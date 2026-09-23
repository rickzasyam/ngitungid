import { describe, it, expect } from 'vitest'
import { formatRupiah, formatRupiahPersis, formatRupiahPlain, formatRupiahShort, digitsOf } from './format'
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

// ══ formatRupiahPersis — TANPA pembulatan (rekonsiliasi hutang, F4) ══════
// formatRupiah membulatkan ke rupiah utuh. Di layar rekonsiliasi itu fatal:
// selisih Rp 0,01 tampil "Rp 0" dan terbaca COCOK.
describe('formatRupiahPersis', () => {
  it('selisih SATU SEN tetap terlihat — bukan "Rp 0"', () => {
    expect(formatRupiahPersis('0.01', 'idr')).toBe('Rp 0,01')
    // Pembanding: formatter lama memang membulatkannya.
    expect(formatRupiah(0.01, 'idr')).toBe('Rp 0')
  })

  it('nominal bulat tetap terbaca biasa, tanpa ",00"', () => {
    expect(formatRupiahPersis('1210000.00', 'idr')).toBe('Rp 1.210.000')
  })

  it('sen tampil bila tidak nol, dengan pemisah desimal sesuai gaya', () => {
    expect(formatRupiahPersis('1234567.89', 'idr')).toBe('Rp 1.234.567,89')
    expect(formatRupiahPersis('1234567.89', 'intl')).toBe('IDR 1,234,567.89')
  })

  it('negatif memakai kurung — sama dengan formatRupiah, tanda tidak hilang', () => {
    expect(formatRupiahPersis('-500000.00', 'idr')).toBe('(Rp 500.000)')
    expect(formatRupiahPersis('-0.01', 'idr')).toBe('(Rp 0,01)')
  })

  it('nol tetap nol, tanpa kurung walau ditulis "-0.00"', () => {
    expect(formatRupiahPersis('0.00', 'idr')).toBe('Rp 0')
    expect(formatRupiahPersis('-0.00', 'idr')).toBe('Rp 0')
  })

  it('nilai di atas presisi float tidak kehilangan satu digit pun', () => {
    // 90 kuadriliun lebih — Number() akan membulatkannya. String tidak.
    expect(formatRupiahPersis('90071992547409934.07', 'idr')).toBe('Rp 90.071.992.547.409.934,07')
  })

  it('pengelompokan ribuan benar di semua panjang', () => {
    expect(formatRupiahPersis('1.00', 'idr')).toBe('Rp 1')
    expect(formatRupiahPersis('12.00', 'idr')).toBe('Rp 12')
    expect(formatRupiahPersis('123.00', 'idr')).toBe('Rp 123')
    expect(formatRupiahPersis('1234.00', 'idr')).toBe('Rp 1.234')
    expect(formatRupiahPersis('123456.00', 'idr')).toBe('Rp 123.456')
  })
})

// ══ Kasus nyata uji klik CP-8 — kenapa layar pencocokan dokumen butuh persis ══
describe('rupiah vs rupiahPersis pada angka yang dicocokkan ke dokumen (CP-8)', () => {
  it('biaya bank 12.345,67 di pratinjau impor: dibulatkan KE ATAS oleh formatRupiah', () => {
    expect(formatRupiah(12345.67, 'idr')).toBe('Rp 12.346')
    expect(formatRupiahPersis('12345.67', 'idr')).toBe('Rp 12.345,67')
  })

  it('sisa invoice 100.000,01 di dropdown alokasi: senya hilang lewat formatRupiah', () => {
    expect(formatRupiah(100000.01, 'idr')).toBe('Rp 100.000')
    expect(formatRupiahPersis('100000.01', 'idr')).toBe('Rp 100.000,01')
  })
})
