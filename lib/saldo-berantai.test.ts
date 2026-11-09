import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  barisRantaiDariSel,
  periksaKesinambungan,
  tentukanArah,
  type BarisArah,
  type BarisRantai,
} from './saldo-berantai'
import { bacaBlok, belahTempelan, bacaSaldoSel } from './mutasi-draf'

const r = (masuk: number, keluar: number, saldo: number | null = null): BarisRantai => ({ masuk, keluar, saldo })
const a = (masuk: number, keluar: number, saldo: number | null = null, penanda: BarisArah['penanda'] = null): BarisArah => ({
  masuk,
  keluar,
  saldo,
  penanda,
})

describe('periksaKesinambungan — dalam sen bulat', () => {
  it('rantai utuh', () => {
    const h = periksaKesinambungan([r(500, 0, 1500), r(0, 200, 1300), r(100, 0, 1400)], 1000)
    expect(h).toMatchObject({ utuh: true, putus: null, terverifikasi: 3, pertamaTanpaJangkar: false })
  })

  it('putus di tengah: baris pertama yang putus + selisihnya; rantai bersambung lagi dari saldo tercetak', () => {
    const h = periksaKesinambungan([r(500, 0, 1500), r(0, 200, 1350), r(100, 0, 1450)], 1000)
    expect(h.utuh).toBe(false)
    expect(h.putus).toEqual({ indeks: 1, jenis: 'baris', diharapkan: 1300, tercetak: 1350, selisih: 50 })
    // Baris ketiga cocok terhadap 1350 — satu kesalahan tidak menular ke semua baris sesudahnya.
    expect(h.semuaPutus).toHaveLength(1)
  })

  it('baris TANPA saldo di antara: dijumlahkan sampai baris bersaldo berikutnya', () => {
    const h = periksaKesinambungan([r(500, 0), r(0, 200), r(100, 0, 1400)], 1000)
    expect(h).toMatchObject({ utuh: true, terverifikasi: 1 })
  })

  it('tanpa jangkar: baris bersaldo pertama TIDAK terverifikasi — dan dilaporkan', () => {
    const h = periksaKesinambungan([r(500, 0, 1500), r(0, 200, 1300)])
    expect(h).toMatchObject({ utuh: true, terverifikasi: 1, pertamaTanpaJangkar: true })
  })

  it('saldo negatif (cerukan) dihitung biasa', () => {
    const h = periksaKesinambungan([r(0, 1500, -500), r(800, 0, 300)], 1000)
    expect(h.utuh).toBe(true)
  })

  it('nominal dekat batas sen aman tetap tepat (tanpa float)', () => {
    const besar = Number.MAX_SAFE_INTEGER - 10
    expect(periksaKesinambungan([r(0, 1, besar - 1)], besar).utuh).toBe(true)
    expect(periksaKesinambungan([r(0, 1, besar)], besar).utuh).toBe(false)
    // 0,1 + 0,2 di float = 0,30000000000000004 — di sen bulat tepat 30.
    expect(periksaKesinambungan([r(10, 0), r(20, 0, 30)], 0).utuh).toBe(true)
  })

  it('nominal tak terbaca memutus pengetahuan saldo: bersambung lagi dari baris bersaldo berikutnya, tanpa putus palsu', () => {
    const h = periksaKesinambungan([{ masuk: null, keluar: 0, saldo: null }, r(0, 200, 1300), r(100, 0, 1400)], 1000)
    expect(h.utuh).toBe(true)
    expect(h.terverifikasi).toBe(1)
  })

  it('titik saldo di tengah (SALDO AWAL halaman 2) ikut diperiksa', () => {
    expect(periksaKesinambungan([r(500, 0, 1500), r(0, 200, 1300)], 1000, [{ setelah: 1, saldo: 1500 }]).utuh).toBe(true)
    const h = periksaKesinambungan([r(500, 0, 1500), r(0, 200, 1300)], 1000, [{ setelah: 1, saldo: 1600 }])
    expect(h.putus).toMatchObject({ indeks: 1, jenis: 'titik', selisih: 100 })
  })

  it('titik di akhir (SALDO AKHIR) memverifikasi baris terakhir', () => {
    expect(periksaKesinambungan([r(500, 0), r(0, 200)], 1000, [{ setelah: 2, saldo: 1300 }]).utuh).toBe(true)
    expect(periksaKesinambungan([r(500, 0), r(0, 200)], 1000, [{ setelah: 2, saldo: 1200 }]).utuh).toBe(false)
  })

  it('10.000 baris', () => {
    const baris: BarisRantai[] = []
    let saldo = 0
    for (let i = 0; i < 10_000; i++) {
      const masuk = i % 2 ? 123_45 : 0
      const keluar = i % 2 ? 0 : 67_89
      saldo += masuk - keluar
      baris.push(r(masuk, keluar, saldo))
    }
    const t0 = performance.now()
    const h = periksaKesinambungan(baris, 0)
    expect(performance.now() - t0).toBeLessThan(100)
    expect(h).toMatchObject({ utuh: true, terverifikasi: 10_000 })
    baris[9_999] = { ...baris[9_999], saldo: saldo + 1 }
    expect(periksaKesinambungan(baris, 0).putus?.indeks).toBe(9_999)
  })
})

describe('tentukanArah — kedua orientasi diuji, DB/CR hanya petunjuk', () => {
  it('orientasi sementara benar → normal, tanpa bertanya', () => {
    const h = tentukanArah({ baris: [a(500, 0, 1500), a(0, 200, 1300)], jangkar: 1000 })
    expect(h).toMatchObject({ arah: 'normal', peringatan: null })
  })

  it('orientasi TERBALIK terdeteksi tanpa bertanya → tukar', () => {
    // Rekening koran bank: kolom pertama "Debet" = KELUAR, tapi S2 menaruhnya sementara di Masuk.
    const h = tentukanArah({ baris: [a(500, 0, 500), a(0, 200, 700)], jangkar: 1000 })
    expect(h).toMatchObject({ arah: 'tukar', usulan: 'tukar' })
  })

  it('tanpa saldo → null (WAJIB dipilih), usulan dari penanda', () => {
    const h = tentukanArah({ baris: [a(500, 0, null, 'keluar'), a(0, 200, null, 'masuk')] })
    expect(h.arah).toBeNull()
    expect(h.alasan).toContain('tanpa kolom saldo')
    expect(h.usulan).toBe('tukar')
  })

  it('tanpa saldo & tanpa penanda → null, usulan normal', () => {
    expect(tentukanArah({ baris: [a(500, 0), a(0, 200)] })).toMatchObject({ arah: null, usulan: 'normal' })
  })

  it('DB/CR BERTENTANGAN dengan rantai → rantai menang + peringatan', () => {
    const h = tentukanArah({ baris: [a(500, 0, 1500, 'keluar'), a(0, 200, 1300, 'masuk')], jangkar: 1000 })
    expect(h.arah).toBe('normal')
    expect(h.peringatan).toContain('bertentangan')
  })

  it('DB/CR yang SETUJU dengan rantai → tanpa peringatan', () => {
    const h = tentukanArah({ baris: [a(0, 500, 500, 'keluar'), a(200, 0, 700, 'masuk')], jangkar: 1000 })
    expect(h).toMatchObject({ arah: 'normal', peringatan: null })
  })

  it('satu saldo tanpa jangkar → saldo tidak cukup → null', () => {
    expect(tentukanArah({ baris: [a(500, 0, 1500)] }).arah).toBeNull()
  })

  it('kedua orientasi putus → null; usulan = yang putusnya lebih sedikit', () => {
    const h = tentukanArah({ baris: [a(500, 0, 1500), a(0, 200, 9999), a(0, 100, 9899)], jangkar: 1000 })
    expect(h.arah).toBeNull()
    expect(h.usulan).toBe('normal')
  })

  it('kedua orientasi utuh (mutasi saling meniadakan) → null, tidak ditebak', () => {
    expect(tentukanArah({ baris: [a(100, 0), a(0, 100, 1000)], jangkar: 1000 }).arah).toBeNull()
  })
})

describe('S2 → S3: template akuntan vs rekening koran, struktur sama, arah beda', () => {
  const baca = (teks: string) => {
    const { baris, nomor } = belahTempelan(teks)
    const h = bacaBlok({ baris, nomor, sumber: 'tempel', periode: { mulai: '2026-04-01', akhir: '2026-04-30' } })
    if (!h.ok) throw new Error(h.pesan)
    return tentukanArah({
      baris: h.baris.map(b => ({ ...barisRantaiDariSel(b.sel), penanda: b.penanda })),
      titik: h.titikSaldo.map(t => {
        const s = bacaSaldoSel(t.saldo)
        return { setelah: t.setelah, saldo: s.status === 'ok' ? s.minor : 0 }
      }),
    })
  }
  const JUDUL = 'Tanggal\tUraian\tDebet\tKredit\tSaldo\n01/04/2026\tSALDO AWAL\t\t\t1.000.000\n'

  it('template akuntan (Debet = MASUK) → normal', () => {
    expect(baca(JUDUL + '02/04/2026\tPenjualan\t500.000\t\t1.500.000\n03/04/2026\tBeli\t\t200.000\t1.300.000\n').arah).toBe('normal')
  })

  it('rekening koran (Debet = KELUAR) → tukar', () => {
    expect(baca(JUDUL + '02/04/2026\tTRF\t500.000\t\t500.000\n03/04/2026\tSETOR\t\t200.000\t700.000\n').arah).toBe('tukar')
  })

  it('BCA satu kolom + DB/CR → normal (penanda sudah menaruhnya benar), rantai memverifikasi', () => {
    expect(
      baca(
        'TANGGAL\tKETERANGAN\tMUTASI\tSALDO\n01/04\tSALDO AWAL\t\t1,000,000.00\n' +
          '02/04\tTRSF\t500,000.00 DB\t500,000.00\n03/04\tSETOR\t200,000.00 CR\t700,000.00\n'
      ).arah
    ).toBe('normal')
  })
})

describe('kontrak modul', () => {
  it('tanpa RegExp dan tanpa float untuk uang (tidak ada parseFloat/toFixed)', () => {
    const src = readFileSync(join(process.cwd(), 'lib', 'saldo-berantai.ts'), 'utf8')
    for (const jejak of ['new RegExp', '.match(', '.replace(/', '.test(', 'parseFloat', 'toFixed']) {
      expect(src.includes(jejak), jejak).toBe(false)
    }
  })
})
