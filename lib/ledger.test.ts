import { describe, it, expect } from 'vitest'
import {
  normalSign,
  compareLedgerLines,
  computeRunningBalance,
  summarizeByAccount,
  type LedgerLine,
  type AccountRef,
} from './ledger'

const line = (o: Partial<LedgerLine> & { id: string }): LedgerLine => ({
  journalId: `J-${o.id}`,
  tanggal: '2026-09-01',
  noBukti: `JU-${o.id}`,
  keterangan: null,
  masterCoaId: 'AKUN-1',
  debit: '0.00',
  kredit: '0.00',
  lineOrder: 0,
  ...o,
})

describe('normalSign', () => {
  it('Debit-normal menambah di sisi debit', () => {
    for (const p of ['Debit', 'debit', 'D', 'd']) expect(normalSign(p), p).toBe(1)
  })

  it('Kredit-normal menambah di sisi kredit', () => {
    for (const p of ['Kredit', 'kredit', 'K', 'Credit', 'cr']) expect(normalSign(p), p).toBe(-1)
  })

  it('nilai tak dikenal dianggap normal-debit, tidak melempar', () => {
    // Importer COA sudah memetakan seluruh varian D/K yang lazim, jadi sisanya
    // hanya baris non-postable yang secara definisi tak punya baris jurnal.
    for (const p of ['-', '', 'entah']) expect(normalSign(p), p).toBe(1)
  })
})

// ══ PENJAGA BERDIRI: URUTAN BUKU BESAR STABIL ════════════════════
// Saldo berjalan yang urutannya berubah antar-query adalah angka BERBEDA untuk
// data yang sama. Sejak no_bukti boleh NULL, urutan tanpa aturan eksplisit
// bergantung default DB.
describe('urutan baku: tanggal, no_bukti NULLS LAST, line_order, id', () => {
  it('tanggal paling menentukan', () => {
    const a = line({ id: 'a', tanggal: '2026-09-02', noBukti: 'JU-001' })
    const b = line({ id: 'b', tanggal: '2026-09-01', noBukti: 'JU-999' })
    expect([a, b].sort(compareLedgerLines).map(l => l.id)).toEqual(['b', 'a'])
  })

  it('nomor bukti NULL ditaruh SESUDAH yang bernomor pada tanggal yang sama', () => {
    const kosong = line({ id: 'a', noBukti: null })
    const bernomor = line({ id: 'b', noBukti: 'JU-500' })
    expect([kosong, bernomor].sort(compareLedgerLines).map(l => l.id)).toEqual(['b', 'a'])
    // Dan hasilnya sama apa pun urutan masukannya.
    expect([bernomor, kosong].sort(compareLedgerLines).map(l => l.id)).toEqual(['b', 'a'])
  })

  it('dua baris sama-sama tanpa nomor bukti tetap berurutan stabil lewat line_order lalu id', () => {
    const a = line({ id: 'zzz', noBukti: null, lineOrder: 1 })
    const b = line({ id: 'aaa', noBukti: null, lineOrder: 0 })
    const c = line({ id: 'mmm', noBukti: null, lineOrder: 1 })
    expect([a, b, c].sort(compareLedgerLines).map(l => l.id)).toEqual(['aaa', 'mmm', 'zzz'])
  })

  it('urutan tidak bergantung urutan masukan — hasilnya sama untuk permutasi mana pun', () => {
    const l = [
      line({ id: 'd', tanggal: '2026-09-02', noBukti: null }),
      line({ id: 'a', tanggal: '2026-09-01', noBukti: 'JU-001', lineOrder: 0 }),
      line({ id: 'c', tanggal: '2026-09-01', noBukti: null }),
      line({ id: 'b', tanggal: '2026-09-01', noBukti: 'JU-001', lineOrder: 1 }),
    ]
    const harapan = ['a', 'b', 'c', 'd']
    expect([...l].sort(compareLedgerLines).map(x => x.id)).toEqual(harapan)
    expect([...l].reverse().sort(compareLedgerLines).map(x => x.id)).toEqual(harapan)
    expect([l[2], l[0], l[3], l[1]].sort(compareLedgerLines).map(x => x.id)).toEqual(harapan)
  })
})

describe('computeRunningBalance', () => {
  it('akun Debit-normal: debit menambah, kredit mengurangi', () => {
    const r = computeRunningBalance({
      posisi: 'Debit',
      lines: [
        line({ id: 'a', noBukti: 'JU-001', debit: '1000.00' }),
        line({ id: 'b', noBukti: 'JU-002', kredit: '400.00' }),
      ],
    })
    expect(r.rows.map(x => x.saldo)).toEqual([100_000, 60_000])
    expect(r.closing).toBe(60_000)
  })

  it('akun Kredit-normal: kredit menambah, debit mengurangi', () => {
    const r = computeRunningBalance({
      posisi: 'Kredit',
      lines: [
        line({ id: 'a', noBukti: 'JU-001', kredit: '1000.00' }),
        line({ id: 'b', noBukti: 'JU-002', debit: '400.00' }),
      ],
    })
    expect(r.rows.map(x => x.saldo)).toEqual([100_000, 60_000])
    expect(r.closing).toBe(60_000)
  })

  it('saldo awal dijumlahkan dari baris periode sebelumnya', () => {
    const r = computeRunningBalance({
      posisi: 'Debit',
      openingLines: [
        line({ id: 'o1', tanggal: '2026-08-01', debit: '500.00' }),
        line({ id: 'o2', tanggal: '2026-08-15', kredit: '200.00' }),
      ],
      lines: [line({ id: 'a', debit: '100.00' })],
    })
    expect(r.opening).toBe(30_000)
    expect(r.rows[0].saldo).toBe(40_000)
    expect(r.closing).toBe(40_000)
  })

  it('tanpa baris apa pun, saldo akhir sama dengan saldo awal', () => {
    const r = computeRunningBalance({
      posisi: 'Debit',
      openingLines: [line({ id: 'o', tanggal: '2026-08-01', debit: '750.00' })],
      lines: [],
    })
    expect(r.opening).toBe(75_000)
    expect(r.rows).toEqual([])
    expect(r.closing).toBe(75_000)
  })

  it('kosong sepenuhnya menghasilkan nol, bukan NaN', () => {
    const r = computeRunningBalance({ posisi: 'Debit', lines: [] })
    expect(r).toEqual({ opening: 0, rows: [], closing: 0 })
  })

  it('saldo dihitung dalam SEN — seratus baris 0.01 berjumlah tepat 1.00', () => {
    const lines = Array.from({ length: 100 }, (_, i) =>
      line({ id: `L${String(i).padStart(3, '0')}`, noBukti: null, lineOrder: i, debit: '0.01' })
    )
    expect(computeRunningBalance({ posisi: 'Debit', lines }).closing).toBe(100)
  })

  it('baris masukan tidak dimutasi — pengurutan memakai salinan', () => {
    const lines = [line({ id: 'b', noBukti: 'JU-002' }), line({ id: 'a', noBukti: 'JU-001' })]
    computeRunningBalance({ posisi: 'Debit', lines })
    expect(lines.map(l => l.id)).toEqual(['b', 'a'])
  })

  it('baris hasil membawa seluruh field aslinya, bukan cuma saldo', () => {
    const r = computeRunningBalance({
      posisi: 'Debit',
      lines: [line({ id: 'a', keterangan: 'sewa kantor', journalId: 'J-9', debit: '10.00' })],
    })
    expect(r.rows[0]).toMatchObject({ id: 'a', keterangan: 'sewa kantor', journalId: 'J-9' })
  })
})

describe('summarizeByAccount', () => {
  const akun: AccountRef[] = [
    { id: 'A2', kode: '14-0001', nama: 'Hutang Usaha', posisi: 'Kredit' },
    { id: 'A1', kode: '11-0001', nama: 'Kas', posisi: 'Debit' },
  ]

  it('mengembalikan seluruh akun terurut kode, termasuk yang nol', () => {
    const hasil = summarizeByAccount([], akun)
    expect(hasil.map(h => h.akun.kode)).toEqual(['11-0001', '14-0001'])
    expect(hasil.every(h => h.saldo === 0 && h.debit === 0 && h.kredit === 0)).toBe(true)
  })

  it('total D/K per akun dan saldo berarah normal balance', () => {
    const hasil = summarizeByAccount(
      [
        line({ id: 'a', masterCoaId: 'A1', debit: '1000.00' }),
        line({ id: 'b', masterCoaId: 'A2', kredit: '1000.00' }),
        line({ id: 'c', masterCoaId: 'A2', debit: '250.00' }),
      ],
      akun
    )
    const kas = hasil.find(h => h.akun.id === 'A1')!
    const hutang = hasil.find(h => h.akun.id === 'A2')!
    expect(kas).toMatchObject({ debit: 100_000, kredit: 0, saldo: 100_000 })
    // Kredit-normal: 1000 K − 250 D = 750 positif.
    expect(hutang).toMatchObject({ debit: 25_000, kredit: 100_000, saldo: 75_000 })
  })

  it('baris yang menunjuk akun di luar daftar diabaikan, tidak melempar', () => {
    const hasil = summarizeByAccount([line({ id: 'x', masterCoaId: 'ENTAH', debit: '999.00' })], akun)
    expect(hasil.every(h => h.saldo === 0)).toBe(true)
  })

  it('jumlah seluruh debit = jumlah seluruh kredit pada data yang seimbang', () => {
    // Penjaga arah: kalau mesin ini pernah menghitung sisi yang salah, kesamaan
    // ini yang jatuh lebih dulu.
    const hasil = summarizeByAccount(
      [
        line({ id: 'a', masterCoaId: 'A1', debit: '1000.00' }),
        line({ id: 'b', masterCoaId: 'A2', kredit: '1000.00' }),
      ],
      akun
    )
    const totalD = hasil.reduce((s, h) => s + h.debit, 0)
    const totalK = hasil.reduce((s, h) => s + h.kredit, 0)
    expect(totalD).toBe(totalK)
  })
})
