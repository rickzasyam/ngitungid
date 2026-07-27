import { describe, it, expect } from 'vitest'
import {
  countUnmapped,
  isFullyMapped,
  isMappable,
  needsMapping,
  statusAfterExtract,
  sumUnmapped,
  isEmptyRow,
  isPlaceholderName,
  type MappableLine,
} from './mapping-status'
import { buildLineItemValues } from './line-items'
import type { ExtractedLine } from '@/lib/gemini/extract'

const line = (over: Partial<MappableLine> = {}): MappableLine => ({
  isSubtotal: false,
  status: 'unmatched',
  masterCoaId: null,
  // Default = baris normal: punya nama bermakna & nominal ≠ 0, jadi test lama
  // tetap menguji hal yang sama (bukan tidak sengaja kena filter baris kosong).
  rawName: 'Akun Biasa',
  amount: 1000,
  ...over,
})

describe('needsMapping / isMappable', () => {
  it('baris biasa tanpa COA masih perlu dipetakan', () => {
    expect(needsMapping(line())).toBe(true)
  })

  it('baris yang sudah punya COA tidak perlu dipetakan lagi', () => {
    expect(needsMapping(line({ masterCoaId: 'coa-1', status: 'matched' }))).toBe(false)
  })

  it('subtotal tidak pernah perlu dipetakan meski masterCoaId null', () => {
    expect(isMappable(line({ isSubtotal: true }))).toBe(false)
    expect(needsMapping(line({ isSubtotal: true }))).toBe(false)
  })

  it('baris rejected tidak pernah perlu dipetakan meski masterCoaId null', () => {
    expect(isMappable(line({ status: 'rejected' }))).toBe(false)
    expect(needsMapping(line({ status: 'rejected' }))).toBe(false)
  })

  it('baris edited diperlakukan seperti baris biasa', () => {
    expect(needsMapping(line({ status: 'edited' }))).toBe(true)
    expect(needsMapping(line({ status: 'edited', masterCoaId: 'coa-1' }))).toBe(false)
  })
})

describe('countUnmapped', () => {
  it('hanya menghitung baris yang benar-benar perlu dipetakan', () => {
    expect(
      countUnmapped([
        line(),                                             // hitung
        line({ status: 'edited' }),                         // hitung
        line({ masterCoaId: 'coa-1', status: 'matched' }),  // sudah dipetakan
        line({ isSubtotal: true }),                         // subtotal
        line({ status: 'rejected' }),                       // ditolak
      ])
    ).toBe(2)
  })

  it('laporan kosong = 0', () => {
    expect(countUnmapped([])).toBe(0)
  })
})

describe('isFullyMapped', () => {
  it('true kalau semua baris mappable sudah punya COA', () => {
    expect(
      isFullyMapped([
        line({ masterCoaId: 'coa-1', status: 'matched' }),
        line({ masterCoaId: 'coa-2', status: 'matched' }),
        line({ isSubtotal: true }),
        line({ status: 'rejected' }),
      ])
    ).toBe(true)
  })

  it('false kalau masih ada satu baris tanpa COA', () => {
    expect(
      isFullyMapped([line({ masterCoaId: 'coa-1', status: 'matched' }), line()])
    ).toBe(false)
  })

  it('subtotal/rejected saja TIDAK dianggap selesai — tak ada yang dipetakan', () => {
    expect(isFullyMapped([line({ isSubtotal: true }), line({ status: 'rejected' })])).toBe(false)
  })

  it('laporan tanpa baris sama sekali TIDAK dianggap selesai', () => {
    expect(isFullyMapped([])).toBe(false)
  })
})

// Jalur upload & retry-extract: hasil buildLineItemValues langsung menentukan
// status laporan. Ini regression test untuk bug "status nyangkut di review":
// laporan yang auto-match-nya 100% dulu tetap 'review' selamanya.
describe('statusAfterExtract (jalur upload + retry-extract)', () => {
  const extracted = (rawName: string, isSubtotal = false): ExtractedLine => ({
    rawName,
    amount: 1000,
    isSubtotal,
    confidence: 0.99,
  })
  const coa = [
    { id: 'coa-gaji', nama: 'Biaya Gaji Karyawan' },
    { id: 'coa-sewa', nama: 'Biaya Sewa' },
  ]

  it('auto-match 100% → langsung mapped', () => {
    const { values, autoMapped } = buildLineItemValues(
      [extracted('Biaya Gaji Karyawan'), extracted('Biaya Sewa'), extracted('LABA KOTOR', true)],
      'report-1',
      coa,
      new Map()
    )
    expect(autoMapped).toBe(2)
    expect(statusAfterExtract(values)).toBe('mapped')
  })

  it('masih ada sisa yang tak ter-auto-match → tetap review', () => {
    const { values } = buildLineItemValues(
      [extracted('Biaya Gaji Karyawan'), extracted('Akun Yang Tidak Dikenal Sama Sekali')],
      'report-1',
      coa,
      new Map()
    )
    expect(statusAfterExtract(values)).toBe('review')
  })

  it('ekstraksi tanpa baris → tetap review, bukan mapped', () => {
    const { values } = buildLineItemValues([], 'report-1', coa, new Map())
    expect(statusAfterExtract(values)).toBe('review')
  })

  it('hanya subtotal → tetap review', () => {
    const { values } = buildLineItemValues(
      [extracted('TOTAL AKTIVA', true)],
      'report-1',
      coa,
      new Map()
    )
    expect(statusAfterExtract(values)).toBe('review')
  })
})

// Badge sidebar COA Mapping: jumlah AKUN lintas seluruh laporan klien,
// independen dari status laporan.
describe('sumUnmapped (badge sidebar)', () => {
  it('menjumlahkan sisa akun dari beberapa laporan sekaligus', () => {
    expect(
      sumUnmapped([{ unmappedCount: 3 }, { unmappedCount: 0 }, { unmappedCount: 2 }])
    ).toBe(5)
  })

  it('status laporan tidak berpengaruh — yang dihitung akun, bukan laporan', () => {
    const reports = [
      { status: 'review', unmappedCount: 0 },
      { status: 'mapped', unmappedCount: 0 },
      { status: 'review', unmappedCount: 4 },
      { status: 'uploaded', unmappedCount: 0 },
    ]
    // 4 laporan, 3 di antaranya berstatus bukan 'mapped' — badge lama akan
    // menampilkan 3. Yang benar: 4 akun.
    expect(sumUnmapped(reports)).toBe(4)
  })

  it('semua sudah dipetakan → badge nol (tidak ditampilkan)', () => {
    expect(sumUnmapped([{ unmappedCount: 0 }, { unmappedCount: 0 }])).toBe(0)
  })

  it('klien tanpa laporan → nol', () => {
    expect(sumUnmapped([])).toBe(0)
  })
})

// ── Baris kosong tanpa informasi ─────────────────────────────
// Aturannya DUA syarat sekaligus; ketiga kasus di bawah adalah alasan
// kenapa tidak boleh dilonggarkan jadi salah satu saja.
describe('isEmptyRow — filter baris tanpa informasi', () => {
  it('placeholder + nominal 0 → TIDAK perlu dipetakan', () => {
    const l = line({ rawName: 'Tidak Ada Data', amount: 0 })
    expect(isEmptyRow(l)).toBe(true)
    expect(isMappable(l)).toBe(false)
    expect(needsMapping(l)).toBe(false)
    expect(countUnmapped([l])).toBe(0)
  })

  it('placeholder TAPI nominal ≠ 0 → TETAP perlu dipetakan (angkanya masuk laporan)', () => {
    const l = line({ rawName: 'Tidak Ada Data', amount: 1_500_000 })
    expect(isEmptyRow(l)).toBe(false)
    expect(needsMapping(l)).toBe(true)
    // Ini kegagalan ekstraksi yang berdampak ke hasil hitungan — menyembunyikannya
    // berarti menghilangkan angka dari laporan tanpa jejak.
    expect(countUnmapped([l])).toBe(1)
  })

  it('nama bermakna TAPI nominal 0 → TETAP perlu dipetakan (saldo nol itu sah)', () => {
    const l = line({ rawName: 'Piutang Karyawan', amount: 0 })
    expect(isEmptyRow(l)).toBe(false)
    expect(needsMapping(l)).toBe(true)
  })

  it('placeholder dicocokkan persis, bukan substring / panjang nama', () => {
    // Akun sah bernama pendek yang benar-benar ada di data dev.
    expect(isPlaceholderName('OVO')).toBe(false)
    expect(isPlaceholderName('Emas')).toBe(false)
    // Nama yang MENGANDUNG placeholder tapi bukan placeholder itu sendiri.
    expect(isPlaceholderName('Cadangan Tidak Ada Data Lama')).toBe(false)
    // Tahan spasi & huruf besar-kecil.
    expect(isPlaceholderName('  TIDAK ADA DATA  ')).toBe(true)
  })

  it('baris kosong tidak menghalangi laporan jadi 100% ter-mapping', () => {
    const lines = [
      line({ rawName: 'Penjualan', amount: 100, masterCoaId: 'coa-1', status: 'matched' }),
      line({ rawName: 'Tidak Ada Data', amount: 0 }), // tanpa COA, tapi tak dihitung
    ]
    expect(isFullyMapped(lines)).toBe(true)
    expect(statusAfterExtract(lines)).toBe('mapped')
  })

  it('laporan yang isinya HANYA baris kosong tidak dianggap selesai', () => {
    // Tidak ada baris mappable sama sekali → tetap masuk antrean review,
    // konsisten dengan perilaku laporan tanpa baris apa pun.
    expect(statusAfterExtract([line({ rawName: 'Tidak Ada Data', amount: 0 })])).toBe('review')
  })
})
