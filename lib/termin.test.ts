import { describe, it, expect } from 'vitest'
import { buildTerminSchedule, mundurBulan } from './termin'

describe('mundurBulan', () => {
  it('mundur biasa', () => {
    expect(mundurBulan('2027-01-01', 1)).toBe('2026-12-01')
    expect(mundurBulan('2027-01-01', 2)).toBe('2026-11-01')
    expect(mundurBulan('2027-01-01', 0)).toBe('2027-01-01')
  })

  it('lintas tahun', () => {
    expect(mundurBulan('2026-02-15', 3)).toBe('2025-11-15')
    expect(mundurBulan('2026-01-31', 13)).toBe('2024-12-31')
  })

  // ══ PENJAGA BERDIRI: AKHIR BULAN DIKEPIT, BUKAN DIGULUNG ═══════════════
  // Mundur satu bulan dari 31 Maret lewat objek Date menghasilkan 3 Maret di
  // sebagian runtime (31 Februari digulung). Itu tidak melempar — ia cuma
  // memindahkan jatuh tempo tiga minggu lebih awal.
  it('tanggal yang tidak ada di bulan tujuan dikepit ke hari terakhirnya', () => {
    expect(mundurBulan('2027-03-31', 1)).toBe('2027-02-28')
    expect(mundurBulan('2027-03-30', 1)).toBe('2027-02-28')
    expect(mundurBulan('2027-05-31', 1)).toBe('2027-04-30')
    expect(mundurBulan('2027-07-31', 2)).toBe('2027-05-31')
  })

  it('tahun kabisat memberi 29 Februari', () => {
    expect(mundurBulan('2028-03-31', 1)).toBe('2028-02-29')
    // 2100 BUKAN kabisat (habis dibagi 100, tidak habis dibagi 400).
    expect(mundurBulan('2100-03-31', 1)).toBe('2100-02-28')
    // 2000 kabisat (habis dibagi 400).
    expect(mundurBulan('2000-03-31', 1)).toBe('2000-02-29')
  })

  it('tidak pernah memakai objek Date — hasilnya stabil apa pun zona waktunya', () => {
    // Bentuk keluarannya selalu YYYY-MM-DD berpad nol, termasuk bulan/hari <10.
    expect(mundurBulan('2026-10-05', 9)).toBe('2026-01-05')
    expect(mundurBulan('2026-01-05', 1)).toBe('2025-12-05')
  })
})

describe('buildTerminSchedule — contoh dari brief', () => {
  it('jatuh tempo 1 Jan 2027, 3 termin → 1 Nov, 1 Des, 1 Jan', () => {
    const j = buildTerminSchedule({
      jatuhTempoAkhir: '2027-01-01',
      jumlahTermin: 3,
      totalMinor: 300_000,
    })
    expect(j.map(c => c.tanggal)).toEqual(['2026-11-01', '2026-12-01', '2027-01-01'])
    expect(j.map(c => c.nominalMinor)).toEqual([100_000, 100_000, 100_000])
    expect(j.map(c => c.urutan)).toEqual([1, 2, 3])
  })

  it('termin 1× = satu cicilan tepat di tanggal jatuh tempo', () => {
    const j = buildTerminSchedule({
      jatuhTempoAkhir: '2026-12-31',
      jumlahTermin: 1,
      totalMinor: 1_234_567,
    })
    expect(j).toHaveLength(1)
    expect(j[0]).toMatchObject({ urutan: 1, tanggal: '2026-12-31', nominalMinor: 1_234_567 })
  })

  it('cicilan TERAKHIR selalu tepat di jatuh tempo akhir', () => {
    for (const n of [1, 2, 3, 6, 12, 24]) {
      const j = buildTerminSchedule({ jatuhTempoAkhir: '2027-06-15', jumlahTermin: n, totalMinor: 1000 })
      expect(j.at(-1)!.tanggal, `termin ${n}`).toBe('2027-06-15')
    }
  })
})

// ══ PENJAGA BERDIRI: Σ CICILAN === TOTAL, PERSIS ═════════════════════════
// Total yang meleset satu sen membuat invoice tidak pernah bisa lunas, dan
// sisanya mengendap di monitoring hutang selamanya.
describe('sisa sen ditaruh di cicilan TERAKHIR', () => {
  it('total ganjil dibagi 3 tetap berjumlah sama persis', () => {
    const total = 10_000_001 // Rp 100.000,01 dalam sen
    const j = buildTerminSchedule({ jatuhTempoAkhir: '2027-01-01', jumlahTermin: 3, totalMinor: total })
    expect(j.reduce((s, c) => s + c.nominalMinor, 0)).toBe(total)
    // Dua cicilan pertama sama; yang terakhir menampung sisanya.
    expect(j[0].nominalMinor).toBe(j[1].nominalMinor)
    expect(j[2].nominalMinor).toBe(j[0].nominalMinor + 2)
  })

  it('berlaku untuk banyak kombinasi total & jumlah termin', () => {
    for (const total of [1, 2, 7, 99, 100, 333_333, 10_000_007]) {
      for (const n of [1, 2, 3, 4, 7, 12]) {
        const j = buildTerminSchedule({ jatuhTempoAkhir: '2027-01-31', jumlahTermin: n, totalMinor: total })
        expect(j.reduce((s, c) => s + c.nominalMinor, 0), `${total}/${n}`).toBe(total)
        expect(j, `${total}/${n}`).toHaveLength(n)
      }
    }
  })

  it('setiap nominal bilangan bulat sen — tidak ada pecahan yang menyelinap', () => {
    const j = buildTerminSchedule({ jatuhTempoAkhir: '2027-01-01', jumlahTermin: 7, totalMinor: 100 })
    for (const c of j) expect(Number.isInteger(c.nominalMinor), String(c.nominalMinor)).toBe(true)
  })

  it('total nol menghasilkan cicilan nol, bukan galat', () => {
    const j = buildTerminSchedule({ jatuhTempoAkhir: '2027-01-01', jumlahTermin: 3, totalMinor: 0 })
    expect(j.map(c => c.nominalMinor)).toEqual([0, 0, 0])
  })
})

describe('masukan tidak sah menghasilkan jadwal kosong, bukan lemparan', () => {
  it.each([
    ['tanggal tidak valid', { jatuhTempoAkhir: '2027-02-31', jumlahTermin: 3, totalMinor: 100 }],
    ['tanggal bukan YMD', { jatuhTempoAkhir: '01/01/2027', jumlahTermin: 3, totalMinor: 100 }],
    ['termin nol', { jatuhTempoAkhir: '2027-01-01', jumlahTermin: 0, totalMinor: 100 }],
    ['termin negatif', { jatuhTempoAkhir: '2027-01-01', jumlahTermin: -3, totalMinor: 100 }],
    ['total negatif', { jatuhTempoAkhir: '2027-01-01', jumlahTermin: 3, totalMinor: -1 }],
    ['total pecahan', { jatuhTempoAkhir: '2027-01-01', jumlahTermin: 3, totalMinor: 10.5 }],
  ])('%s → []', (_nama, input) => {
    expect(buildTerminSchedule(input)).toEqual([])
  })
})

// ══ PENYESUAIAN MANUAL: disiapkan, belum dipakai (D34) ═══════════════════
describe('overrides', () => {
  it('tanggal cicilan tertentu bisa ditimpa, dan ditandai', () => {
    const j = buildTerminSchedule({
      jatuhTempoAkhir: '2027-01-01',
      jumlahTermin: 3,
      totalMinor: 300,
      overrides: [{ urutan: 2, tanggal: '2026-12-20' }],
    })
    expect(j.map(c => c.tanggal)).toEqual(['2026-11-01', '2026-12-20', '2027-01-01'])
    expect(j[1].disesuaikan).toBe(true)
    expect(j[0].disesuaikan).toBeUndefined()
  })

  it('override TIDAK mengubah nominal — hanya tanggalnya', () => {
    const j = buildTerminSchedule({
      jatuhTempoAkhir: '2027-01-01',
      jumlahTermin: 3,
      totalMinor: 301,
      overrides: [{ urutan: 1, tanggal: '2026-10-01' }],
    })
    expect(j.reduce((s, c) => s + c.nominalMinor, 0)).toBe(301)
  })

  // jumlah_termin invoice bisa diubah SETELAH override dibuat. Melempar di situ
  // berarti halaman hutang gagal dimuat karena data lama yang tidak berbahaya.
  it('override yang menunjuk cicilan di luar jadwal DIABAIKAN, tidak melempar', () => {
    const j = buildTerminSchedule({
      jatuhTempoAkhir: '2027-01-01',
      jumlahTermin: 2,
      totalMinor: 200,
      overrides: [{ urutan: 5, tanggal: '2026-01-01' }],
    })
    expect(j).toHaveLength(2)
    expect(j.some(c => c.disesuaikan)).toBe(false)
  })

  it('override bertanggal tidak sah diabaikan, jadwal dasarnya tetap dipakai', () => {
    const j = buildTerminSchedule({
      jatuhTempoAkhir: '2027-01-01',
      jumlahTermin: 2,
      totalMinor: 200,
      overrides: [{ urutan: 1, tanggal: '2026-02-31' }],
    })
    expect(j[0].tanggal).toBe('2026-12-01')
    expect(j[0].disesuaikan).toBeUndefined()
  })

  it('tanpa overrides, hasilnya sama dengan memberi array kosong', () => {
    const a = buildTerminSchedule({ jatuhTempoAkhir: '2027-01-01', jumlahTermin: 3, totalMinor: 300 })
    const b = buildTerminSchedule({
      jatuhTempoAkhir: '2027-01-01',
      jumlahTermin: 3,
      totalMinor: 300,
      overrides: [],
    })
    expect(a).toEqual(b)
  })
})
