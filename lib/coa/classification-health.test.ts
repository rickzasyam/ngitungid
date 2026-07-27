import { describe, it, expect } from 'vitest'
import { classificationWarnings, aggregationTargetOf, cashflowBucketOf } from './classification-health'

// Nilai-nilai di bawah BUKAN karangan: semuanya benar-benar ada di Master COA
// dev per 2026-07-28, termasuk yang bermasalah.
describe('aggregationTargetOf', () => {
  it('mengenali kelompok yang dipakai klien', () => {
    expect(aggregationTargetOf('Laba Rugi')).toBe('laba_rugi')
    expect(aggregationTargetOf('Neraca')).toBe('neraca')
  })

  it('kelompok "-" tidak masuk agregasi mana pun (2 akun nyata di dev)', () => {
    expect(aggregationTargetOf('-')).toBe('none')
  })
})

describe('cashflowBucketOf — operating COCOK PERSIS, sisanya substring', () => {
  it('Operating / Investing / Funding terhitung', () => {
    expect(cashflowBucketOf('Operating')).toBe('operating')
    expect(cashflowBucketOf('Investing')).toBe('investing')
    expect(cashflowBucketOf('Funding')).toBe('funding')
  })

  it('"Operating Balance" TIDAK terhitung — pengecualian yang disengaja', () => {
    // 22 akun di dev memakai nilai ini; aggregateCashflow sengaja
    // mengecualikannya karena itu saldo, bukan arus.
    expect(cashflowBucketOf('Operating Balance')).toBeNull()
  })

  it('classCf kosong/null tidak masuk bucket', () => {
    expect(cashflowBucketOf(null)).toBeNull()
    expect(cashflowBucketOf('')).toBeNull()
  })
})

describe('classificationWarnings', () => {
  it('kombinasi yang sehat tidak memunculkan peringatan', () => {
    expect(
      classificationWarnings({ kelompok: 'Laba Rugi', subKelompok: 'Penjualan', classCf: 'Operating' })
    ).toEqual([])
    expect(
      classificationWarnings({ kelompok: 'Neraca', subKelompok: 'Aktiva Lancar', classCf: null })
    ).toEqual([])
  })

  it('kelompok tak dikenal → peringatan, dan subKelompok tidak diributkan lagi', () => {
    const w = classificationWarnings({ kelompok: '-', subKelompok: '-', classCf: null })
    expect(w).toHaveLength(1)
    expect(w[0].field).toBe('kelompok')
  })

  it('subKelompok Neraca yang jatuh ke other → peringatan', () => {
    // Kasus nyata: "Aktiva Tidak Berwujud" tidak mengandung kata "lain",
    // sehingga classifyBs mengembalikan 'other' dan akunnya hilang dari totalAset.
    const w = classificationWarnings({ kelompok: 'Neraca', subKelompok: 'Aktiva Tidak Berwujud', classCf: null })
    expect(w).toHaveLength(1)
    expect(w[0].field).toBe('subKelompok')
    expect(w[0].message).toContain('Total Aset')
  })

  it('subKelompok Laba Rugi yang jatuh ke other → peringatan', () => {
    const w = classificationWarnings({ kelompok: 'Laba Rugi', subKelompok: 'Entah Apa', classCf: null })
    expect(w).toHaveLength(1)
    expect(w[0].field).toBe('subKelompok')
  })

  it('classCf DIISI tapi tak dikenali → peringatan', () => {
    const w = classificationWarnings({ kelompok: 'Laba Rugi', subKelompok: 'Penjualan', classCf: 'Operasional' })
    expect(w.map(x => x.field)).toEqual(['classCf'])
  })

  it('classCf kosong TIDAK diperingatkan — wajar untuk akun non-arus-kas', () => {
    expect(
      classificationWarnings({ kelompok: 'Laba Rugi', subKelompok: 'Penjualan', classCf: null })
    ).toEqual([])
  })

  it('"Operating Balance" diperingatkan walau terlihat sah', () => {
    const w = classificationWarnings({ kelompok: 'Neraca', subKelompok: 'Aktiva Lancar', classCf: 'Operating Balance' })
    expect(w.map(x => x.field)).toEqual(['classCf'])
    expect(w[0].message).toContain('Arus Kas')
  })

  it('varian ejaan yang SUDAH ada di dev tetap lolos (bukan false alarm)', () => {
    for (const sub of ['Variable Cost', 'Variabel Cost', 'Pendapatan dan Biaya Lain-Lain', 'Pendapatan & Biaya Lain Lain']) {
      expect(classificationWarnings({ kelompok: 'Laba Rugi', subKelompok: sub, classCf: null })).toEqual([])
    }
  })
})
