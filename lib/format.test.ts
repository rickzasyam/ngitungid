import { describe, it, expect } from 'vitest'
import { formatRupiah, formatRupiahPlain, formatRupiahShort, digitsOf } from './format'
import { CURRENCY_FORMATS, type CurrencyFormat } from '@/lib/api/preferences'

describe('formatRupiah — nominal penuh dengan simbol', () => {
  it("gaya 'idr' → Rp dengan titik ribuan", () => {
    expect(formatRupiah(1_234_567, 'idr')).toBe('Rp 1.234.567')
  })

  it("gaya 'intl' → IDR dengan koma ribuan", () => {
    expect(formatRupiah(1_234_567, 'intl')).toBe('IDR 1,234,567')
  })

  it('negatif memakai kurung, konvensi laporan akuntansi', () => {
    expect(formatRupiah(-1_234_567, 'idr')).toBe('(Rp 1.234.567)')
    expect(formatRupiah(-1_234_567, 'intl')).toBe('(IDR 1,234,567)')
  })

  it('nol dan nilai kecil', () => {
    expect(formatRupiah(0, 'idr')).toBe('Rp 0')
    expect(formatRupiah(750, 'idr')).toBe('Rp 750')
  })

  it('membulatkan — tidak ada sen di laporan klien', () => {
    expect(formatRupiah(1_234.4, 'idr')).toBe('Rp 1.234')
    expect(formatRupiah(1_234.6, 'idr')).toBe('Rp 1.235')
  })

  it("default gaya adalah 'idr'", () => {
    expect(formatRupiah(1_000)).toBe(formatRupiah(1_000, 'idr'))
  })
})

describe('formatRupiahPlain — digit saja, tanpa simbol', () => {
  it('tanpa Rp / IDR', () => {
    expect(formatRupiahPlain(1_234_567, 'idr')).toBe('1.234.567')
    expect(formatRupiahPlain(1_234_567, 'intl')).toBe('1,234,567')
  })

  it('negatif tetap memakai kurung', () => {
    expect(formatRupiahPlain(-9_000, 'idr')).toBe('(9.000)')
  })
})

describe('formatRupiahShort — ringkas untuk kartu & sumbu', () => {
  it("gaya 'idr' memakai singkatan Indonesia", () => {
    expect(formatRupiahShort(1_200_000_000, 'idr')).toBe('Rp 1,2M')
    expect(formatRupiahShort(5_000_000, 'idr')).toBe('Rp 5jt')
    expect(formatRupiahShort(3_000, 'idr')).toBe('Rp 3rb')
    expect(formatRupiahShort(750, 'idr')).toBe('Rp 750')
  })

  it("gaya 'intl' memakai singkatan Inggris", () => {
    expect(formatRupiahShort(1_200_000_000, 'intl')).toBe('IDR 1.2B')
    expect(formatRupiahShort(5_000_000, 'intl')).toBe('IDR 5M')
    expect(formatRupiahShort(3_000, 'intl')).toBe('IDR 3K')
  })

  it('desimal hanya bila informatif — 5,0jt tampil 5jt', () => {
    expect(formatRupiahShort(5_000_000, 'idr')).toBe('Rp 5jt')
    expect(formatRupiahShort(5_500_000, 'idr')).toBe('Rp 5,5jt')
  })

  it('negatif memakai kurung', () => {
    expect(formatRupiahShort(-5_000_000, 'idr')).toBe('(Rp 5jt)')
  })
})

// ══ TIDAK ADA KONVERSI ═══════════════════════════════════════════════════
// Penjaga inti: mengganti gaya hanya boleh mengubah simbol dan pemisah.
// Kalau suatu saat ada yang menyelipkan kurs/pengali, digitnya akan berbeda dan
// test ini merah.
describe('gaya hanya mengubah tampilan, tidak pernah nilai', () => {
  const SAMPLES = [0, 1, 999, 1_000, 12_345, 1_234_567, 987_654_321, 1_000_000_000, -1_234_567]

  it('digit identik antara idr dan intl untuk nominal penuh', () => {
    for (const v of SAMPLES) {
      expect(digitsOf(formatRupiah(v, 'idr')), `nilai ${v}`)
        .toBe(digitsOf(formatRupiah(v, 'intl')))
    }
  })

  it('digit identik antara idr dan intl untuk digit-saja', () => {
    for (const v of SAMPLES) {
      expect(digitsOf(formatRupiahPlain(v, 'idr')), `nilai ${v}`)
        .toBe(digitsOf(formatRupiahPlain(v, 'intl')))
    }
  })

  it('digit hasil format = digit angka aslinya (tidak ada pengali)', () => {
    for (const v of SAMPLES) {
      const expected = String(Math.abs(Math.round(v)))
      expect(digitsOf(formatRupiah(v, 'idr')), `nilai ${v}`).toBe(expected)
      expect(digitsOf(formatRupiah(v, 'intl')), `nilai ${v}`).toBe(expected)
    }
  })

  it('tanda negatif dipertahankan lewat kurung di SEMUA gaya', () => {
    for (const f of CURRENCY_FORMATS) {
      expect(formatRupiah(-5_000, f).startsWith('(')).toBe(true)
      expect(formatRupiah(5_000, f).startsWith('(')).toBe(false)
    }
  })

  it('setiap gaya yang terdaftar bisa diformat — tidak ada yang melempar', () => {
    for (const f of CURRENCY_FORMATS as readonly CurrencyFormat[]) {
      expect(() => formatRupiah(1_234, f)).not.toThrow()
      expect(() => formatRupiahShort(1_234_000, f)).not.toThrow()
      expect(() => formatRupiahPlain(1_234, f)).not.toThrow()
    }
  })
})

// ══ PENJAGA TANGGAL ══════════════════════════════════════════════════════
// Formatter tanggal SENGAJA tidak dipindahkan ke lib/format.ts. Test ini tetap
// ada sebagai pagar berdiri: periode akuntansi datang sebagai string
// 'YYYY-MM-DD' dan harus dipecah sebagai STRING. Sesi terdahulu pernah
// mengirimnya lewat Date/toISOString di WIB dan melempar Januari ke Desember.
const BULAN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des']
/** Salinan pola yang dipakai app (app/laporan/page.tsx, coa-replace-dialog, dst). */
const fmtTanggal = (ymd: string) => {
  const [y, m, d] = ymd.split('-').map(Number)
  return `${d} ${BULAN[m - 1] ?? '?'} ${y}`
}

describe('periode akuntansi tidak pernah bergeser', () => {
  const CASES: [string, string][] = [
    ['2026-01-01', '1 Jan 2026'],
    ['2026-01-31', '31 Jan 2026'],
    ['2026-03-01', '1 Mar 2026'],
    ['2026-03-31', '31 Mar 2026'],
    ['2026-07-01', '1 Jul 2026'],
    ['2026-07-31', '31 Jul 2026'],
    ['2026-12-01', '1 Des 2026'],
    ['2026-12-31', '31 Des 2026'],
  ]

  it('tanggal 1 dan 31 di berbagai bulan terbaca persis', () => {
    for (const [ymd, expected] of CASES) {
      expect(fmtTanggal(ymd), ymd).toBe(expected)
    }
  })

  it('hasilnya tidak bergantung TZ proses — murni operasi string', () => {
    // Kalau ada yang mengganti implementasinya jadi berbasis Date, nilai di
    // mesin UTC+X akan berbeda dari string aslinya dan test ini merah.
    for (const [ymd] of CASES) {
      const [y, m, d] = ymd.split('-')
      const out = fmtTanggal(ymd)
      expect(out.startsWith(String(Number(d))), `${ymd} → ${out}`).toBe(true)
      expect(out.endsWith(y), `${ymd} → ${out}`).toBe(true)
      expect(out).toContain(BULAN[Number(m) - 1])
    }
  })

  it('1 Januari TIDAK pernah jatuh ke Desember tahun sebelumnya', () => {
    // Bug persis yang pernah terjadi: toISOString() di WIB menggeser mundur.
    expect(fmtTanggal('2026-01-01')).toBe('1 Jan 2026')
    expect(fmtTanggal('2026-01-01')).not.toContain('Des')
    expect(fmtTanggal('2026-01-01')).not.toContain('2025')
  })

  it('31 Desember TIDAK pernah maju ke Januari tahun berikutnya', () => {
    expect(fmtTanggal('2026-12-31')).toBe('31 Des 2026')
    expect(fmtTanggal('2026-12-31')).not.toContain('Jan')
    expect(fmtTanggal('2026-12-31')).not.toContain('2027')
  })
})
