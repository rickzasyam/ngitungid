import { describe, it, expect } from 'vitest'
import {
  countUnmapped,
  isFullyMapped,
  isMappable,
  needsMapping,
  statusAfterExtract,
  sumUnmapped,
  type MappableLine,
} from './mapping-status'
import { buildLineItemValues } from './line-items'
import type { ExtractedLine } from '@/lib/gemini/extract'

const line = (over: Partial<MappableLine> = {}): MappableLine => ({
  isSubtotal: false,
  status: 'unmatched',
  masterCoaId: null,
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
