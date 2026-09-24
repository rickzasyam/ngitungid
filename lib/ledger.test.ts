import { describe, it, expect } from 'vitest'
import {
  normalSign,
  compareLedgerLines,
  computeRunningBalance,
  summarizeByAccount,
  URUTAN_BUKU_BESAR,
  type LedgerLine,
  type AccountRef,
} from './ledger'

const line = (o: Partial<LedgerLine> & { id: string }): LedgerLine => ({
  journalId: `J-${o.id}`,
  tanggal: '2026-09-01',
  journalCreatedAt: '2026-09-01T00:00:00.000000',
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
// data yang sama. Urutan 2026-09-24 (keputusan Ricko, mengganti CP-5):
// tanggal → waktu jurnal dibuat → id jurnal → line_order (→ id baris).
describe('urutan baku: tanggal, created_at jurnal, id jurnal, line_order', () => {
  it('daftar kuncinya persis yang diputuskan, dalam urutan itu', () => {
    expect([...URUTAN_BUKU_BESAR]).toEqual(['tanggal', 'journalCreatedAt', 'journalId', 'lineOrder', 'id'])
  })

  it('tanggal paling menentukan — mengalahkan waktu dibuat', () => {
    const a = line({ id: 'a', tanggal: '2026-09-02', journalCreatedAt: '2026-09-01T01:00:00.000000' })
    const b = line({ id: 'b', tanggal: '2026-09-01', journalCreatedAt: '2026-09-05T01:00:00.000000' })
    expect([a, b].sort(compareLedgerLines).map(l => l.id)).toEqual(['b', 'a'])
  })

  it('tanggal sama → jurnal yang DIBUAT lebih dulu di depan, bernomor bukti atau tidak', () => {
    // Ini yang diganti dari CP-5: dulu jurnal bernomor selalu di depan yang
    // tanpa nomor. Sekarang nomor bukti tidak ikut menentukan urutan.
    const tanpaNomorLebihDulu = line({ id: 'a', noBukti: null, journalCreatedAt: '2026-09-24T08:00:00.000000' })
    const bernomorBelakangan = line({ id: 'b', noBukti: 'JU-001', journalCreatedAt: '2026-09-24T09:00:00.000000' })
    expect([bernomorBelakangan, tanpaNomorLebihDulu].sort(compareLedgerLines).map(l => l.id)).toEqual(['a', 'b'])
  })

  it('selisih MIKRODETIK tetap memisahkan — presisi Postgres, bukan milidetik Date', () => {
    const lebihDulu = line({ id: 'z', journalId: 'J-z', journalCreatedAt: '2026-09-24T08:00:00.123456' })
    const belakangan = line({ id: 'a', journalId: 'J-a', journalCreatedAt: '2026-09-24T08:00:00.123457' })
    expect([belakangan, lebihDulu].sort(compareLedgerLines).map(l => l.id)).toEqual(['z', 'a'])
  })

  it('waktu dibuat sama (satu transaksi) → id jurnal, dan baris satu jurnal tetap berkumpul', () => {
    const t = '2026-09-24T08:00:00.000000'
    const l = [
      line({ id: 'x1', journalId: 'J-bbb', journalCreatedAt: t, lineOrder: 0 }),
      line({ id: 'y0', journalId: 'J-aaa', journalCreatedAt: t, lineOrder: 1 }),
      line({ id: 'x0', journalId: 'J-bbb', journalCreatedAt: t, lineOrder: 1 }),
      line({ id: 'y1', journalId: 'J-aaa', journalCreatedAt: t, lineOrder: 0 }),
    ]
    expect(l.sort(compareLedgerLines).map(x => x.id)).toEqual(['y1', 'y0', 'x1', 'x0'])
  })

  it('line_order seri di satu jurnal (tak ada batasan unik di DB) → id baris memutus', () => {
    const a = line({ id: 'zzz', lineOrder: 1 })
    const b = line({ id: 'aaa', lineOrder: 1 })
    expect([a, b].sort(compareLedgerLines).map(x => x.id)).toEqual(['aaa', 'zzz'])
  })

  // Seluruh permutasi, bukan tiga contoh: 6! = 720 urutan masukan, dan
  // semuanya WAJIB menghasilkan urutan serta saldo berjalan yang identik.
  it('urutan dan saldo berjalan identik untuk SETIAP permutasi masukan', () => {
    const baris = [
      line({ id: 'l1', tanggal: '2026-09-24', journalId: 'J-bayar', journalCreatedAt: '2026-09-24T09:00:00.000001', noBukti: null, debit: '400000.00' }),
      line({ id: 'l2', tanggal: '2026-09-24', journalId: 'J-beli', journalCreatedAt: '2026-09-24T08:00:00.000000', noBukti: null, kredit: '1000000.50' }),
      line({ id: 'l3', tanggal: '2026-09-23', journalId: 'J-lama', journalCreatedAt: '2026-09-30T00:00:00.000000', noBukti: 'JU-9', kredit: '10.00' }),
      line({ id: 'l4', tanggal: '2026-09-24', journalId: 'J-ju', journalCreatedAt: '2026-09-24T09:00:00.000001', noBukti: 'JU-1', lineOrder: 1, kredit: '1.00' }),
      line({ id: 'l5', tanggal: '2026-09-24', journalId: 'J-ju', journalCreatedAt: '2026-09-24T09:00:00.000001', noBukti: 'JU-1', lineOrder: 0, debit: '2.00' }),
      line({ id: 'l6', tanggal: '2026-09-25', journalId: 'J-akhir', journalCreatedAt: '2026-09-24T07:00:00.000000', noBukti: null, debit: '5.00' }),
    ]
    const permutasi = <T,>(xs: T[]): T[][] =>
      xs.length <= 1 ? [xs] : xs.flatMap((x, i) => permutasi([...xs.slice(0, i), ...xs.slice(i + 1)]).map(p => [x, ...p]))

    const harapan = ['l3', 'l2', 'l1', 'l5', 'l4', 'l6']
    const semua = permutasi(baris)
    expect(semua).toHaveLength(720)
    const saldoHarapan = computeRunningBalance({ posisi: 'Kredit', lines: baris }).rows.map(r => r.saldo)
    for (const p of semua) {
      expect(p.sort(compareLedgerLines).map(x => x.id)).toEqual(harapan)
      expect(computeRunningBalance({ posisi: 'Kredit', lines: p }).rows.map(r => r.saldo)).toEqual(saldoHarapan)
    }
  })

  it('skenario gladi: pembelian dicatat sebelum pembayarannya → saldo hutang tidak pernah minus', () => {
    // Dua jurnal otomatis tanpa nomor bukti di tanggal yang sama. Dengan urutan
    // CP-5 keduanya jatuh ke `id` acak, dan di gladi pembayaran tampil duluan:
    // saldo hutang (400.000) sebelum pembeliannya masuk.
    const beli = line({ id: 'ffff', journalId: 'J-ffff', noBukti: null, journalCreatedAt: '2026-09-24T08:15:00.000000', kredit: '1000000.50' })
    const bayar = line({ id: '0000', journalId: 'J-0000', noBukti: null, journalCreatedAt: '2026-09-24T08:16:00.000000', debit: '400000.00' })
    const r = computeRunningBalance({ posisi: 'Kredit', lines: [bayar, beli] })
    expect(r.rows.map(x => x.id)).toEqual(['ffff', '0000'])
    expect(r.rows.map(x => x.saldo)).toEqual([100_000_050, 60_000_050])
    expect(r.rows.every(x => x.saldo >= 0)).toBe(true)
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
