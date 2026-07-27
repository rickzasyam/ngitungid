import { describe, it, expect } from 'vitest'
import { groupUnmappedByReportType, isUnreadableName, type GroupableLine } from './group-unmapped'

const line = (over: Partial<GroupableLine> & { id: string; reportType: string }): GroupableLine => ({
  isSubtotal: false,
  status: 'unmatched',
  masterCoaId: null,
  rawName: 'Akun Biasa',
  amount: 1000,
  ...over,
})

describe('groupUnmappedByReportType', () => {
  it('baris dari 3 laporan berbeda terkelompok ke jenisnya masing-masing', () => {
    const groups = groupUnmappedByReportType([
      line({ id: 'a1', reportType: 'laba_rugi' }),
      line({ id: 'b1', reportType: 'neraca' }),
      line({ id: 'a2', reportType: 'laba_rugi' }),
      line({ id: 'c1', reportType: 'arus_kas' }),
      line({ id: 'b2', reportType: 'neraca' }),
      line({ id: 'a3', reportType: 'laba_rugi' }),
    ])

    expect(groups.map(g => g.reportType)).toEqual(['laba_rugi', 'neraca', 'arus_kas'])
    expect(groups.map(g => g.items.length)).toEqual([3, 2, 1])
    expect(groups[0].items.map(i => i.id)).toEqual(['a1', 'a2', 'a3'])
    expect(groups[1].items.map(i => i.id)).toEqual(['b1', 'b2'])
    expect(groups[2].items.map(i => i.id)).toEqual(['c1'])
  })

  it('total item lintas grup = jumlah baris yang perlu dipetakan', () => {
    const lines = [
      line({ id: '1', reportType: 'laba_rugi' }),
      line({ id: '2', reportType: 'neraca' }),
      line({ id: '3', reportType: 'arus_kas' }),
    ]
    const groups = groupUnmappedByReportType(lines)
    expect(groups.reduce((s, g) => s + g.items.length, 0)).toBe(3)
  })

  it('baris yang sudah ter-mapping tidak ikut', () => {
    const groups = groupUnmappedByReportType([
      line({ id: '1', reportType: 'laba_rugi', masterCoaId: 'coa-1', status: 'matched' }),
      line({ id: '2', reportType: 'laba_rugi' }),
    ])
    expect(groups[0].items.map(i => i.id)).toEqual(['2'])
  })

  it('subtotal, rejected, dan baris kosong tidak ikut — jenis yang jadi kosong hilang', () => {
    const groups = groupUnmappedByReportType([
      line({ id: '1', reportType: 'laba_rugi' }),
      line({ id: 's', reportType: 'neraca', isSubtotal: true }),
      line({ id: 'r', reportType: 'neraca', status: 'rejected' }),
      line({ id: 'e', reportType: 'neraca', rawName: 'Tidak Ada Data', amount: 0 }),
    ])
    // Neraca tidak muncul sama sekali karena semua barisnya tersaring.
    expect(groups.map(g => g.reportType)).toEqual(['laba_rugi'])
  })

  it('placeholder bernominal ≠ 0 TETAP masuk grup, dan ditandai', () => {
    const l = line({ id: 'x', reportType: 'arus_kas', rawName: 'Tidak Ada Data', amount: 250_000 })
    const groups = groupUnmappedByReportType([l])
    expect(groups[0].items.map(i => i.id)).toEqual(['x'])
    expect(isUnreadableName(l)).toBe(true)
  })

  it('akun bernama wajar tidak ditandai tak-terbaca', () => {
    expect(isUnreadableName({ rawName: 'OVO' })).toBe(false)
    expect(isUnreadableName({ rawName: 'Biaya Gaji Karyawan' })).toBe(false)
  })

  it('tidak ada baris → tidak ada grup', () => {
    expect(groupUnmappedByReportType([])).toEqual([])
  })
})
