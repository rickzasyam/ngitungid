import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { GalatAi, type AiProvider } from '@/lib/ai/penyedia'
import type { HalamanMentah } from '@/lib/mutasi-kas/kontrak-baris-mentah'
import { dokumenAcak, dokumenDuaKolom, dokumenLanjutanLintasHalaman, dokumenSatuKolom, dokumenSebagianScan, dokumenTanpaSaldo } from '../fikstur/koleksi'
import { penyediaSempurna } from '../fikstur/jawaban-ai'
import type { JawabanSusun } from '../susun-tabel'
import { laporanMarkdown, rangkumUji, ujiDokumen, type HasilDokumen } from './harness'
import { kesinambunganSementara } from './kesinambungan-sementara'
import { uraiStatus } from './status-uji'

// X4 — harness uji banding. Yang diuji: ukurannya PEKA terhadap kesalahan yang
// berbahaya (kolom tertukar, baris hilang, angka salah) dan tidak menghukum
// yang benar. Semua dokumen sintetis, semua penyedia tiruan.

const salin = <T>(x: T): T => JSON.parse(JSON.stringify(x))

describe('kesinambunganSementara (pengganti S3 di harness)', () => {
  it('kebenaran semua fikstur bersaldo → lolos; tanpa kolom saldo → tanpa-saldo', () => {
    for (const d of [dokumenSatuKolom(), dokumenDuaKolom(), dokumenLanjutanLintasHalaman(), dokumenAcak(3), dokumenAcak(4, 70)]) expect(kesinambunganSementara(d.kebenaran), d.nama).toBe('lolos')
    expect(kesinambunganSementara(dokumenTanpaSaldo().kebenaran)).toBe('tanpa-saldo')
  })

  it('arah tidak diputuskan dari judul: seluruh kolom ditukar tetap lolos (orientasi lain)', () => {
    const k = salin(dokumenDuaKolom().kebenaran)
    for (const b of k.flatMap(h => h.baris)) {
      if (b.nominal.bentuk === 'dua-kolom') [b.nominal.pertama.teks, b.nominal.kedua.teks] = [b.nominal.kedua.teks, b.nominal.pertama.teks]
    }
    expect(kesinambunganSementara(k)).toBe('lolos')
  })

  const rusakSatu = (k: HalamanMentah[], ubah: (b: HalamanMentah['baris'][number]) => void, uraian: string) => {
    const b = k.flatMap(h => h.baris).find(x => x.uraian === uraian)!
    ubah(b)
    return kesinambunganSementara(k)
  }

  it('SATU baris kolomnya tertukar → putus', () => {
    expect(rusakSatu(salin(dokumenDuaKolom().kebenaran), b => {
      if (b.nominal.bentuk === 'dua-kolom') [b.nominal.pertama.teks, b.nominal.kedua.teks] = [b.nominal.kedua.teks, b.nominal.pertama.teks]
    }, 'Penjualan UJI-B-103')).toBe('putus')
  })

  it('penanda DB hilang di satu baris → putus', () => {
    expect(rusakSatu(salin(dokumenSatuKolom().kebenaran), b => {
      if (b.nominal.bentuk === 'satu-kolom') b.nominal.penanda = ''
    }, 'BIAYA ADM UJI-B')).toBe('putus')
  })

  it('angka salah baca, nominal tak terbaca, atau baris transaksi hilang → putus', () => {
    expect(rusakSatu(salin(dokumenSatuKolom().kebenaran), b => (b.saldo = '10,735,000.01'), 'BIAYA ADM UJI-B')).toBe('putus')
    expect(rusakSatu(salin(dokumenSatuKolom().kebenaran), b => (b.saldo = '10.735.OOO,OO'), 'BIAYA ADM UJI-B')).toBe('putus')
    const k = salin(dokumenSatuKolom().kebenaran)
    k[0].baris = k[0].baris.filter(b => b.uraian !== 'SETORAN TUNAI UJI-B-002')
    expect(kesinambunganSementara(k)).toBe('putus')
  })
})

describe('ujiDokumen', () => {
  it('penyedia sempurna → lolos tanpa koreksi, identik, tanpa baris hilang/lebih', async () => {
    for (const d of [dokumenSatuKolom(), dokumenDuaKolom(), dokumenLanjutanLintasHalaman(), dokumenAcak(11, 50)]) {
      const r = await ujiDokumen(await penyediaSempurna(d), d, kesinambunganSementara)
      expect(r, d.nama).toMatchObject({ halamanGagal: [], kesinambungan: 'lolos', lolosTanpaKoreksi: true, identik: true, barisHilang: 0, barisLebih: 0 })
    }
  })

  // Halaman 2 dokumen dua kolom TIDAK mencetak judul. Sejak keputusan Ricko
  // 2026-10-29 harness (seperti browser) mengirim posisi judul halaman 1, jadi
  // kolom tertukar di halaman lanjutan pun ditolak penjaga — dulu hanya
  // tertangkap kesinambungan (yang tetap diuji langsung di atas).
  it('kolom tertukar di halaman lanjutan tanpa judul: DITOLAK penjaga lewat posisi judul halaman sebelumnya', async () => {
    const d = dokumenDuaKolom()
    const tukar = (j: JawabanSusun, h: number) =>
      h !== 2 ? j : { ...j, baris: j.baris.map((b, i) => (i === 0 ? { ...b, nominalPertama: b.nominalKedua, nominalKedua: b.nominalPertama } : b)) }
    const r = await ujiDokumen(await penyediaSempurna(d, tukar), d, kesinambunganSementara)
    expect(r).toMatchObject({ halamanGagal: [{ halaman: 2, jenis: 'ditolak-penjaga' }], lolosTanpaKoreksi: false, identik: false })
  })

  it('baris terlewat → halaman ditolak penjaga, baris halaman itu dihitung hilang', async () => {
    const d = dokumenSatuKolom()
    const buang = (j: JawabanSusun, h: number) => (h !== 1 ? j : { ...j, baris: j.baris.filter((_, i) => i !== 2) })
    const r = await ujiDokumen(await penyediaSempurna(d, buang), d, kesinambunganSementara)
    expect(r.halamanGagal).toEqual([{ halaman: 1, jenis: 'ditolak-penjaga' }])
    expect(r.lolosTanpaKoreksi).toBe(false)
    expect(r.barisHilang).toBe(d.kebenaran[0].baris.length)
  })

  it('galat penyedia (kuota) dan halaman scan tercatat per halaman, tanpa isi baris', async () => {
    const d = dokumenSatuKolom()
    const kuota: AiProvider = { nama: 'gemini', model: 'm', mintaJson: async () => { throw Object.assign(new Error('x'), { status: 429 }) } }
    const r = await ujiDokumen(kuota, d, kesinambunganSementara)
    expect(r.halamanGagal).toEqual([{ halaman: 1, jenis: 'penyedia-kuota' }, { halaman: 2, jenis: 'penyedia-kuota' }])
    // Semua halaman gagal ≠ "tanpa saldo": dokumen bersaldo tetap masuk penyebut % lolos.
    expect(r.kesinambungan).toBe('putus')
    expect(rangkumUji(kuota, [r])).toMatchObject({ dokumenBersaldo: 1, persenLolosTanpaKoreksi: 0 })
    // Kuota HARIAN: dokumen dibatalkan utuh (bukan dicatat gagal) supaya CLI bisa melanjutkannya besok.
    let n = 0
    const harian: AiProvider = { nama: 'gemini', model: 'm', mintaJson: async a => (++n === 1 ? (await penyediaSempurna(d)).mintaJson(a) : Promise.reject(new GalatAi('kuotaHarian', 'x'))) }
    await expect(ujiDokumen(harian, d, kesinambunganSementara)).rejects.toMatchObject({ jenis: 'kuotaHarian' })
    const ts = dokumenTanpaSaldo()
    expect((await ujiDokumen(kuota, ts, kesinambunganSementara)).kesinambungan).toBe('tanpa-saldo')
    const s = dokumenSebagianScan()
    const r2 = await ujiDokumen(await penyediaSempurna(s), s, kesinambunganSementara)
    expect(r2.halamanGagal).toEqual([{ halaman: 2, jenis: 'gambar-tidak-didukung-harness' }])
  })
})

describe('rangkumUji & laporan', () => {
  const h = (x: Partial<HasilDokumen>): HasilDokumen => ({
    nama: 'UJI-B', jumlahHalaman: 2, halamanGagal: [], kesinambungan: 'lolos', lolosTanpaKoreksi: true, identik: true,
    barisHilang: 0, barisLebih: 0, msPerHalaman: 100, tokenMasuk: 1_000_000, tokenKeluar: 500_000, ...x,
  })

  it('persen lolos dihitung atas dokumen BERSALDO; biaya = token × harga resmi', () => {
    const r = rangkumUji({ nama: 'anthropic', model: 'claude-haiku-5-5' }, [
      h({}),
      h({ lolosTanpaKoreksi: false, kesinambungan: 'putus', identik: false, halamanGagal: [{ halaman: 1, jenis: 'ditolak-penjaga' }], barisHilang: 3 }),
      h({ kesinambungan: 'tanpa-saldo', lolosTanpaKoreksi: false, msPerHalaman: 400 }),
    ], { masukPerJuta: 0.1, keluarPerJuta: 0.5, mataUang: 'USD', tanggal: '2026-10-06' })
    expect(r).toMatchObject({ dokumen: 3, dokumenBersaldo: 2, persenLolosTanpaKoreksi: 50, persenIdentik: 66.7, halamanGagal: 1, barisHilang: 3, msPerHalaman: 200 })
    expect(r.biayaPerDokumen).toEqual({ nilai: 0.35, mataUang: 'USD', tanggalHarga: '2026-10-06' })
    expect(rangkumUji({ nama: 'gemini', model: 'x' }, [h({})]).biayaPerDokumen).toBeNull()
  })

  it('penyedia tanpa dokumen selesai → "belum diuji", bukan 0% / 0 USD', () => {
    const r = rangkumUji({ nama: 'gemini', model: 'm' }, [], { masukPerJuta: 1, keluarPerJuta: 1, mataUang: 'USD', tanggal: '2026-10-28' })
    const md = laporanMarkdown([r], { tanggal: '2026-10-28', pemeriksa: 'p', dokumen: '1' })
    expect(md).toContain(`| gemini · m | ${Array(7).fill('belum diuji').join(' | ')} |`)
    expect(md).not.toContain('0 USD')
  })

  it('laporan hanya agregat — tanpa isi baris', async () => {
    const d = dokumenSatuKolom()
    const r = rangkumUji({ nama: 'gemini', model: 'tiruan' }, [await ujiDokumen(await penyediaSempurna(d), d, kesinambunganSementara)])
    const md = laporanMarkdown([r], { tanggal: '2026-10-27', pemeriksa: 'p', dokumen: '1' })
    expect(md).toContain('| gemini · tiruan | 100% (1 dok. bersaldo) | 100% | 0 | 0 / 0 |')
    for (const b of d.kebenaran.flatMap(x => x.baris)) for (const s of [b.uraian, b.saldo]) if (s.length > 3) expect(md).not.toContain(s)
  })
})

describe('status uji (dilanjutkan sesudah kuota direset)', () => {
  const sah: HasilDokumen = {
    nama: 'UJI-B-acak-1001', jumlahHalaman: 2, halamanGagal: [{ halaman: 2, jenis: 'ditolak-penjaga' }], kesinambungan: 'putus',
    lolosTanpaKoreksi: false, identik: false, barisHilang: 3, barisLebih: 0, msPerHalaman: 900, tokenMasuk: 10, tokenKeluar: 5,
  }
  const teks = (hasil: unknown, versi = 1) => JSON.stringify({ versi, hasil: { 'gemini:m': hasil } })

  it('hasil agregat terbaca kembali utuh', () => {
    expect(uraiStatus(teks([sah])).hasil['gemini:m']).toEqual([sah])
  })

  it('menolak isi selain agregat: kunci tambahan, nama bukan UJI-B-, tipe salah, versi lain', () => {
    expect(() => uraiStatus(teks([{ ...sah, uraian: 'isi baris' }]))).toThrow()
    expect(() => uraiStatus(teks([{ ...sah, halamanGagal: [{ halaman: 1, jenis: 'x', teks: 'isi' }] }]))).toThrow()
    expect(() => uraiStatus(teks([{ ...sah, nama: 'rekening-nyata' }]))).toThrow()
    expect(() => uraiStatus(teks([{ ...sah, tokenMasuk: '10' }]))).toThrow()
    expect(() => uraiStatus(teks([sah], 2))).toThrow()
  })
})

describe('batas harness', () => {
  const read = (...p: string[]) => readFileSync(join(process.cwd(), ...p), 'utf8')
  const semua = (dir: string): string[] =>
    readdirSync(join(process.cwd(), dir), { withFileTypes: true }).flatMap(e =>
      e.name === 'node_modules' || e.name.startsWith('.') ? [] : e.isDirectory() ? semua(join(dir, e.name)) : e.name.endsWith('.ts') || e.name.endsWith('.tsx') ? [join(dir, e.name)] : []
    )

  // Pemeriksa sementara bukan jalur aplikasi: arah & rantai di grid milik S3.
  it('kesinambunganSementara hanya dipakai harness', () => {
    const pemakai = ['app', 'components', 'lib'].flatMap(semua).filter(f => !f.includes(join('bank-statement', 'uji-banding')) && read(f).includes('kesinambungan-sementara'))
    expect(pemakai).toEqual([])
  })

  it('CLI tidak membaca berkas PDF — hanya dokumen sintetis', () => {
    const src = read('lib', 'bank-statement', 'uji-banding', 'cli.ts')
    for (const s of ['readFile', 'createReadStream', '.pdf']) expect(src, s).not.toContain(s)
    expect(src).toContain('dokumenAcak(')
  })

  // Yang diukur harus sama dengan yang dijalankan route (model, thinking, ulang).
  it('CLI membuat penyedia lewat penyediaEkstraksi, seperti route', () => {
    const src = read('lib', 'bank-statement', 'uji-banding', 'cli.ts')
    expect(src).toContain('penyediaEkstraksi(')
    for (const s of ['penyediaGemini(', 'penyediaAnthropic(', 'penyediaOpenAi(']) expect(src, s).not.toContain(s)
    expect(read('lib', 'bank-statement', 'uji-banding', 'status-uji.ts')).not.toContain('.pdf')
  })
})
