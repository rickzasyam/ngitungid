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

  it('subKelompok Neraca yang benar-benar tak dikenali → peringatan', () => {
    const w = classificationWarnings({ kelompok: 'Neraca', subKelompok: 'Suspense', classCf: null })
    expect(w).toHaveLength(1)
    expect(w[0].field).toBe('subKelompok')
    expect(w[0].message).toContain('Total Aset')
  })

  it('"Aktiva Tidak Berwujud" TIDAK lagi diperingatkan — kini kategori sendiri', () => {
    // Dulu jatuh ke 'other' (tidak mengandung kata "lain") sehingga 2 akun
    // Graphicook senilai 9.000.000 hilang dari Total Aset. Sejak jadi kategori
    // keempat, ini kombinasi yang sah.
    expect(
      classificationWarnings({ kelompok: 'Neraca', subKelompok: 'Aktiva Tidak Berwujud', classCf: null })
    ).toEqual([])
  })

  it('catch-all: subKelompok ber-"aset" apa pun tidak lagi diperingatkan', () => {
    expect(
      classificationWarnings({ kelompok: 'Neraca', subKelompok: 'Aset Hak Guna', classCf: null })
    ).toEqual([])
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

// ══ PERINGATAN TIPE AKUN EKSPLISIT ≠ TURUNAN (E4) ════════════════════════
// Bukan galat — akunting berhak menimpa tebakan sistem, dan itulah gunanya
// kolom eksplisit. Yang layak diperingatkan adalah pertentangan yang tidak ada
// yang melihat: akun ditandai revenue, lalu impor COA berikutnya memindahkan
// sub kelompoknya ke Beban. Nilai eksplisitnya tetap menang diam-diam, dan
// laporan berubah tanpa ada yang menyentuh akun itu.
describe('classificationWarnings — tipe akun', () => {
  const dasar = { kelompok: 'Laba Rugi', subKelompok: 'Fixed Cost', classCf: null }

  it('memperingatkan saat eksplisit bertentangan dengan turunan', () => {
    const w = classificationWarnings({ ...dasar, tipeAkun: 'revenue', posisi: 'Debit', nama: 'Sewa' })
    const tipe = w.filter(x => x.field === 'tipeAkun')
    expect(tipe).toHaveLength(1)
    // Pesannya menyebut KEDUA sisi — tanpa itu pembacanya tidak tahu apa yang
    // seharusnya, hanya bahwa ada yang salah.
    expect(tipe[0].message).toContain('Pendapatan')
    expect(tipe[0].message).toContain('Beban')
  })

  it('diam saat eksplisit sama dengan turunan', () => {
    const w = classificationWarnings({ ...dasar, tipeAkun: 'expense', posisi: 'Debit', nama: 'Sewa' })
    expect(w.filter(x => x.field === 'tipeAkun')).toEqual([])
  })

  it('diam saat tipe tidak diisi — null berarti "ikut turunan", bukan konflik', () => {
    const w = classificationWarnings({ ...dasar, tipeAkun: null, posisi: 'Debit', nama: 'Sewa' })
    expect(w.filter(x => x.field === 'tipeAkun')).toEqual([])
  })

  it('diam saat turunannya TIDAK BISA ditentukan — tidak ada yang bisa dibandingkan', () => {
    // Sub kelompok yang tak dikenali sudah punya peringatannya sendiri; menambah
    // "tipe bertentangan" di atasnya cuma kebisingan untuk satu masalah.
    const w = classificationWarnings({
      kelompok: 'Neraca',
      subKelompok: 'Entah',
      classCf: null,
      tipeAkun: 'asset',
      posisi: 'Debit',
      nama: 'X',
    })
    expect(w.filter(x => x.field === 'tipeAkun')).toEqual([])
  })

  it('pemanggil LAMA (tanpa tipeAkun) berperilaku persis seperti sebelumnya', () => {
    const lama = classificationWarnings({ kelompok: 'Laba Rugi', subKelompok: 'Fixed Cost', classCf: null })
    expect(lama.filter(x => x.field === 'tipeAkun')).toEqual([])
  })
})
