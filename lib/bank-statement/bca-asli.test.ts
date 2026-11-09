import { describe, expect, it } from 'vitest'
import { bukaPdf } from './baca-pdf'
import { gabungLintasHalaman, kolomTerakhir, rangkumDokumen } from './dokumen'
import { dokumenBcaAsli } from './fikstur/koleksi'
import { jawabanSempurna, penyediaTiruan } from './fikstur/jawaban-ai'
import { GalatSusun, periksaJawaban, susunHalaman, type JawabanSusun, type MasukanSusun } from './susun-tabel'
import { bacaRingkasanBank, bandingkanRingkasan, labelRingkasan } from './ringkasan-bank'
import { rencanaPdf } from '@/lib/mutasi-grid-turunan'
import type { HalamanMentah } from '@/lib/mutasi-kas/kontrak-baris-mentah'

// Uji X6 (rekening koran BCA asli, 2026-11-09): halaman TERAKHIR selalu ditolak
// — juga sesudah diulang Flash — karena blok ringkasan bank (SALDO AWAL / MUTASI
// CR / MUTASI DB / SALDO AKHIR) sesudah transaksi terakhir memuat nominal, dan
// aturan cakupan (b) mewajibkan baris bernominal tercakup. Fikstur meniru tata
// letaknya (angka & nama karangan).

const d = dokumenBcaAsli()
const rapat = (s: string) => s.split(' ').filter(t => t !== '').join(' ')

async function barisTeks(): Promise<string[][]> {
  const doc = await bukaPdf(d.pdf)
  try {
    const out: string[][] = []
    for (let i = 1; i <= doc.jumlahHalaman; i++) out.push((await doc.bacaHalaman(i)).baris.map(b => b.teks))
    return out
  } finally {
    await doc.tutup()
  }
}

describe('e-statement BCA (X6): blok ringkasan sesudah transaksi terakhir', async () => {
  const semua = await barisTeks()
  const terakhir = semua.length
  const masukan = (hal: number, sebelum: HalamanMentah[]): MasukanSusun => ({
    halaman: hal,
    sumber: { jenis: 'teks', baris: semua[hal - 1] },
    kolomSebelumnya: kolomTerakhir(sebelum, hal),
  })
  const tolak = (j: JawabanSusun, m: MasukanSusun) => {
    try {
      periksaJawaban(JSON.stringify(j), m)
    } catch (e) {
      expect(e).toBeInstanceOf(GalatSusun)
      return (e as GalatSusun).masalah.join(' | ')
    }
    throw new Error('jawaban rusak LOLOS penjaga')
  }

  it('fikstur meniru tata letak asli: 6 halaman, ±8 transaksi/halaman, ringkasan 10 CR / 39 DB', () => {
    expect(semua).toHaveLength(6)
    expect(d.ringkasan.masuk.jumlah).toBe(10)
    expect(d.ringkasan.keluar.jumlah).toBe(39)
    const akhir = semua[terakhir - 1].map(rapat)
    expect(akhir.some(g => g.startsWith('SALDO AWAL :'))).toBe(true)
    expect(akhir.some(g => g.startsWith('MUTASI DB :') && g.endsWith(' 39'))).toBe(true)
    expect(akhir.some(g => g.startsWith('SALDO AKHIR :'))).toBe(true)
    for (const h of semua.slice(0, -1)) expect(h.map(rapat)).toContain('Bersambung ke halaman berikut')
    expect(semua[0].map(rapat).some(g => g.includes('T ANG G A L') && g.includes('SALD O'))).toBe(true)
    expect(semua[0].map(rapat).some(g => g.includes('PE RIOD E : JANU ARI 2026'))).toBe(true)
  })

  it('jawaban SEMPURNA tiap halaman lolos penjaga — TERMASUK halaman terakhir — dan sama persis kebenarannya', async () => {
    const hasil: HalamanMentah[] = []
    for (let hal = 1; hal <= terakhir; hal++) {
      const ai = penyediaTiruan(() => JSON.stringify(jawabanSempurna(d, hal, semua[hal - 1])))
      const r = await susunHalaman(ai, masukan(hal, hasil))
      hasil.push(r.halaman)
    }
    expect(hasil).toEqual(d.kebenaranHalaman)
    expect(gabungLintasHalaman(hasil)).toEqual(d.kebenaran)
  })

  it('celah lama TETAP tertangkap: transaksi terakhir dibuang di halaman terakhir → ditolak', () => {
    const j = jawabanSempurna(d, terakhir, semua[terakhir - 1])
    const akhir = j.baris[j.baris.length - 1]
    expect(rapat(semua[terakhir - 1][akhir.nomorBaris - 1])).toContain('BIAYA ADM')
    expect(tolak({ ...j, baris: j.baris.slice(0, -1) }, masukan(terakhir, d.kebenaranHalaman))).toContain(`baris tercetak [${akhir.nomorBaris}] bernominal tidak tercakup`)
  })

  it('celah lama TETAP tertangkap: transaksi terakhir dibuang di halaman tengah (sebelum "Bersambung") → ditolak', () => {
    const j = jawabanSempurna(d, 3, semua[2])
    const akhir = j.baris[j.baris.length - 1]
    const dibuang = { ...j, baris: j.baris.slice(0, -1) }
    expect(tolak(dibuang, masukan(3, d.kebenaranHalaman))).toContain(`baris tercetak [${akhir.nomorBaris}]`)
  })

  // Jawaban Flash-Lite sungguhan di dev (fikstur ini, 2026-11-09): baris ringkasan IKUT dikirim sebagai
  // entri di ujung, dengan sel acak ("SALDO AWAL :" di uraian, jumlah transaksi 10/39 di saldo).
  const denganRingkasan = (j: JawabanSusun, akhir: string[]): JawabanSusun => {
    const nomor = akhir.map((g, i) => (labelRingkasan(g) !== null ? i + 1 : 0)).filter(n => n > 0)
    expect(nomor).toHaveLength(4)
    const isi = ['SALDO AWAL :', 'MUTASI CR :', 'MUTASI DB :', 'SALDO AKHIR :']
    return {
      ...j,
      baris: [
        ...j.baris,
        ...nomor.map((n, k) => ({ nomorBaris: n, tanggal: '', uraian: isi[k], nominalPertama: '', nominalKedua: '', penanda: '', saldo: k === 1 ? '10' : k === 2 ? '39' : '', lain: [{ judul: 'JUMLAH', teks: 'x' }], barisLanjutan: [] })),
      ],
    }
  }

  it('AI IKUT mengirim blok ringkasan sebagai entri di ujung → dibuang, halaman LOLOS, hasil sama persis kebenaran', () => {
    const akhir = semua[terakhir - 1]
    const j = denganRingkasan(jawabanSempurna(d, terakhir, akhir), akhir)
    expect(periksaJawaban(JSON.stringify(j), masukan(terakhir, d.kebenaranHalaman))).toEqual(d.kebenaranHalaman[terakhir - 1])
  })

  it('…tapi transaksi terakhir yang DIBUANG tetap tertangkap walau ringkasan ikut dikirim', () => {
    const akhir = semua[terakhir - 1]
    const j = jawabanSempurna(d, terakhir, akhir)
    const tx = j.baris[j.baris.length - 1]
    const rusak = denganRingkasan({ ...j, baris: j.baris.slice(0, -1) }, akhir)
    expect(tolak(rusak, masukan(terakhir, d.kebenaranHalaman))).toContain(`baris tercetak [${tx.nomorBaris}] bernominal tidak tercakup`)
  })

  it('baris ringkasan diselipkan sebagai lanjutan uraian transaksi terakhir → ditolak', () => {
    const akhir = semua[terakhir - 1]
    const j = jawabanSempurna(d, terakhir, akhir)
    const ringkas = akhir.map((g, i) => (labelRingkasan(g) !== null ? i + 1 : 0)).filter(n => n > 0)
    const tx = j.baris[j.baris.length - 1]
    const rusak = { ...j, baris: [...j.baris.slice(0, -1), { ...tx, barisLanjutan: ringkas }] }
    expect(tolak(rusak, masukan(terakhir, d.kebenaranHalaman))).toContain(`baris lanjutan [${ringkas[0]}] tidak sah`)
  })

  it('jawaban KOSONG di halaman terakhir tetap ditolak walau blok ringkasan ada', () => {
    const j = jawabanSempurna(d, terakhir, semua[terakhir - 1])
    expect(tolak({ ...j, baris: [] }, masukan(terakhir, d.kebenaranHalaman))).toContain('bernominal tidak tercakup')
  })
})

describe('labelRingkasan — label ringkasan bank, tahan spasi & huruf besar/kecil', () => {
  it.each([
    ['SALDO AWAL    :    5,000,000.00', 'saldoAwal'],
    ['saldo awal : 5.000.000,00', 'saldoAwal'],
    ['SALD O AWAL : 5,000,000.00', 'saldoAwal'],
    ['MUTASI CR     :   12,000,000.00     10', 'masuk'],
    ['MU TASI DB : 14,030,000.00 39', 'keluar'],
    ['Mutasi Debet : 1.000,00', 'keluar'],
    ['MUTASI KREDIT : 1.000,00', 'masuk'],
    ['SALDO AKHIR   :    2,970,000.00', 'saldoAkhir'],
    ['TOTAL MUTASI : 26,030,000.00', 'totalMutasi'],
    ['Opening Balance  1,000.00', 'saldoAwal'],
    ['CLOSING  BALANCE  2,000.00', 'saldoAkhir'],
  ])('%s → %s', (baris, jenis) => {
    expect(labelRingkasan(baris)).toBe(jenis)
  })

  it.each([
    '01/01   SALDO AWAL                      25,000,000.00',
    '31/01   BIAYA ADM          30,000.00 DB      2,970,000.00',
    'Bersambung ke halaman berikut',
    'HALAMAN : 6/6',
    'SALDO PER 30/09  1,000,000.00',
    'TRSF E-BANKING DB 3101/FTSCY/WS95051   111,000.00 DB',
    // Label harus SAMA PERSIS — yang hanya mengandung label ringkasan tetap wajib tercakup.
    'BIAYA MUTASI DB : 5,000.00',
    'KOREKSI SALDO AKHIR : 1,000.00',
    'SALDO AWAL BULAN LALU : 1,000.00',
  ])('bukan ringkasan: %s', baris => {
    expect(labelRingkasan(baris)).toBeNull()
  })
})

describe('ringkasan bank sebagai pemeriksa (dibaca KODE, bukan AI)', async () => {
  const semua = await barisTeks()
  const rp = (sen: number) => sen

  it('angka blok ringkasan halaman terakhir terbaca persis; halaman lain tanpa ringkasan', () => {
    const r = bacaRingkasanBank(semua[semua.length - 1])
    expect(r).toEqual({
      saldoAwal: rp(d.ringkasan.saldoAwal),
      saldoAkhir: rp(d.ringkasan.saldoAkhir),
      masuk: { total: d.ringkasan.masuk.total, jumlah: 10 },
      keluar: { total: d.ringkasan.keluar.total, jumlah: 39 },
      saldoAwalTeks: '25,000,000.00',
    })
    for (const h of semua.slice(0, -1)) expect(bacaRingkasanBank(h)).toBeNull()
  })

  it('hasil ekstraksi lengkap → semua COCOK (arah dari rantai saldo, seperti saat masuk grid)', () => {
    const r = bacaRingkasanBank(semua[semua.length - 1])!
    const t = rencanaPdf(d.kebenaranHalaman, { mulai: '2026-01-01', akhir: '2026-01-31' })
    if (t.jenis !== 'blok') throw new Error(t.jenis)
    const b = bandingkanRingkasan(r, t.hasil)
    expect(b.map(x => [x.label, x.cocok])).toEqual([
      ['Jumlah transaksi masuk', true],
      ['Jumlah transaksi keluar', true],
      ['Total masuk', true],
      ['Total keluar', true],
      ['Saldo awal', true],
      ['Saldo akhir', true],
    ])
  })

  it('satu halaman gagal (tidak ikut) → jumlah & total TIDAK cocok; saldo awal tetap cocok', () => {
    const r = bacaRingkasanBank(semua[semua.length - 1])!
    const t = rencanaPdf(d.kebenaranHalaman.filter(h => h.halaman !== 3), { mulai: '2026-01-01', akhir: '2026-01-31' })
    if (t.jenis !== 'blok') throw new Error(t.jenis)
    const b = Object.fromEntries(bandingkanRingkasan(r, t.hasil).map(x => [x.label, x]))
    expect(b['Jumlah transaksi keluar'].cocok).toBe(false)
    expect(b['Jumlah transaksi keluar'].ekstraksi).toBeLessThan(39)
    expect(b['Total keluar'].cocok).toBe(false)
    expect(b['Saldo awal'].cocok).toBe(true)
  })

  it('tanpa baris SALDO AWAL di blok → saldo awal DITURUNKAN dari saldo tercetak pertama (cocok), teks bank tersedia untuk jangkar', () => {
    const r = bacaRingkasanBank(semua[semua.length - 1])!
    const tanpa = d.kebenaranHalaman.map((h, i) => (i === 0 ? { ...h, baris: h.baris.filter(b => b.uraian !== 'SALDO AWAL') } : h))
    const t = rencanaPdf(tanpa, { mulai: '2026-01-01', akhir: '2026-01-31' })
    if (t.jenis !== 'blok') throw new Error(t.jenis)
    const awal = bandingkanRingkasan(r, t.hasil).find(x => x.label === 'Saldo awal')!
    expect([awal.ekstraksi, awal.cocok]).toEqual([d.ringkasan.saldoAwal, true])
    expect(t.hasil.titikSaldo.some(x => x.setelah === 0)).toBe(false)
    expect(r.saldoAwalTeks).toBe('25,000,000.00')
  })
})

describe('periode berspasi aneh (uji X6)', async () => {
  const semua = await barisTeks()
  const h = (halaman: number, periodeTeks: string | null): HalamanMentah => ({ halaman, kolom: [], baris: [], periodeTeks })

  it('"PE RIOD E : JANU ARI 2026" = "PERIODE : JANUARI 2026" = "Januari 2026" → TIDAK ada peringatan periode', () => {
    const r = rangkumDokumen([h(1, 'PE RIOD E : JANU ARI 2026'), h(2, 'PERIODE : JANUARI 2026'), h(3, 'Januari 2026')], 3)
    expect(r.peringatan).toEqual([])
  })

  it('satu halaman gagal (tidak ikut) tidak memunculkan peringatan periode — hanya "belum terbaca"', () => {
    const r = rangkumDokumen([h(1, 'PE RIOD E : JANU ARI 2026'), h(2, 'PE RIOD E : JANU ARI 2026'), h(4, 'PE RIOD E : JANU ARI 2026')], 4)
    expect(r.peringatan).toEqual(['Halaman 3 belum terbaca.'])
  })

  it('periode yang BENAR-BENAR berbeda tetap diperingatkan', () => {
    expect(rangkumDokumen([h(1, 'PE RIOD E : JANU ARI 2026'), h(2, 'PERIODE : FEBRUARI 2026')], 2).peringatan).toContain(
      'Teks periode berbeda antar halaman — pastikan semua halaman dari rekening koran yang sama.'
    )
  })

  it('penjaga: periodeTeks yang dirapikan AI ("PERIODE : JANUARI 2026") tetap dianggap tercetak', () => {
    const j = jawabanSempurna(d, 2, semua[1])
    const m: MasukanSusun = { halaman: 2, sumber: { jenis: 'teks', baris: semua[1] }, kolomSebelumnya: d.kebenaranHalaman[0].kolom }
    expect(periksaJawaban(JSON.stringify({ ...j, periodeTeks: 'PERIODE : JANUARI 2026' }), m).periodeTeks).toBe('PERIODE : JANUARI 2026')
    expect(() => periksaJawaban(JSON.stringify({ ...j, periodeTeks: 'PERIODE : FEBRUARI 2026' }), m)).toThrow(GalatSusun)
  })
})
