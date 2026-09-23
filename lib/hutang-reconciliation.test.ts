import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  efekHutangMinor,
  reconcileHutang,
  rupiahKeSen,
  type PenjelasBaris,
} from './hutang-reconciliation'
import type { SupplierHutang } from './hutang'

const sup = (o: Partial<SupplierHutang> = {}): SupplierHutang => ({
  supplierId: 's1',
  supplierNama: 'Toko Jaya',
  invoiceCount: 1,
  totalMinor: 1_000_000,
  dibayarMinor: 0,
  sisaMinor: 1_000_000,
  ...o,
})

const jurnal = (o: Partial<PenjelasBaris> = {}): PenjelasBaris => ({
  journalId: 'j1',
  noBukti: 'JM-001',
  tanggal: '2026-09-10',
  keterangan: 'Koreksi hutang',
  akunKode: '14-0001',
  akunNama: 'Hutang Dagang',
  supplierId: null,
  supplierNama: null,
  debit: '0',
  kredit: '0',
  ...o,
})

describe('selisih ditampilkan APA ADANYA (keputusan Ricko 2026-09-23)', () => {
  it('neraca − supplier, dalam SEN', () => {
    const r = reconcileHutang({
      perSupplier: [sup({ sisaMinor: 3_000_000 })],
      saldoNeracaHutangMinor: 3_500_000,
      jurnalManualHutang: [],
    })
    expect(r.selisihMinor).toBe(500_000)
  })

  it('TANDA dipertahankan — neraca lebih kecil menghasilkan selisih NEGATIF', () => {
    // Tandanya separuh informasinya: negatif berarti modul mencatat hutang yang
    // neraca tidak akui. Math.abs akan membuang arah itu.
    const r = reconcileHutang({
      perSupplier: [sup({ sisaMinor: 3_000_000 })],
      saldoNeracaHutangMinor: 2_000_000,
      jurnalManualHutang: [],
    })
    expect(r.selisihMinor).toBe(-1_000_000)
  })

  it('selisih SATU SEN tetap satu sen — tidak ada ambang toleransi', () => {
    const r = reconcileHutang({
      perSupplier: [sup({ sisaMinor: 1_000_000 })],
      saldoNeracaHutangMinor: 1_000_001,
      jurnalManualHutang: [],
    })
    expect(r.selisihMinor).toBe(1)
  })

  it('TANPA neraca → selisih null, BUKAN nol', () => {
    // Nol di sini akan terbaca "cocok". Belum bisa dibandingkan bukan cocok.
    const r = reconcileHutang({
      perSupplier: [sup()],
      saldoNeracaHutangMinor: null,
      jurnalManualHutang: [],
    })
    expect(r.totalNeracaMinor).toBeNull()
    expect(r.selisihMinor).toBeNull()
  })

  it('cocok persis → selisih tepat nol', () => {
    const r = reconcileHutang({
      perSupplier: [sup({ sisaMinor: 1_000_000 })],
      saldoNeracaHutangMinor: 1_000_000,
      jurnalManualHutang: [],
    })
    expect(r.selisihMinor).toBe(0)
  })
})

describe('sisi supplier — dijumlahkan, tidak dihitung ulang', () => {
  it('total = Σ sisa per supplier', () => {
    const r = reconcileHutang({
      perSupplier: [sup({ sisaMinor: 100 }), sup({ supplierId: 's2', sisaMinor: 250 })],
      saldoNeracaHutangMinor: 350,
      jurnalManualHutang: [],
    })
    expect(r.totalSupplierMinor).toBe(350)
    expect(r.rows).toHaveLength(2)
  })

  it('memakai sisaMinor apa adanya — tidak membaca total atau dibayar', () => {
    // Kalau modul ini menghitung ulang sisa dari total − dibayar, ia punya
    // aturan sisa KEDUA yang bisa menyimpang dari lib/hutang.ts.
    const r = reconcileHutang({
      perSupplier: [sup({ totalMinor: 999, dibayarMinor: 1, sisaMinor: 500 })],
      saldoNeracaHutangMinor: 500,
      jurnalManualHutang: [],
    })
    expect(r.totalSupplierMinor).toBe(500)
    expect(r.selisihMinor).toBe(0)
  })

  it('tanpa supplier sama sekali → total nol, selisih = seluruh saldo neraca', () => {
    const r = reconcileHutang({ perSupplier: [], saldoNeracaHutangMinor: 750, jurnalManualHutang: [] })
    expect(r.totalSupplierMinor).toBe(0)
    expect(r.selisihMinor).toBe(750)
  })
})

describe('penjelas — jurnal manual ke akun hutang supplier', () => {
  it('dipisah BERSUPPLIER vs TANPA supplier (F1)', () => {
    const r = reconcileHutang({
      perSupplier: [],
      saldoNeracaHutangMinor: 0,
      jurnalManualHutang: [
        jurnal({ journalId: 'a', supplierId: 's1', supplierNama: 'Toko Jaya', kredit: '100' }),
        jurnal({ journalId: 'b', kredit: '50' }),
      ],
    })
    expect(r.penjelas.berSupplier.rows.map(x => x.journalId)).toEqual(['a'])
    expect(r.penjelas.tanpaSupplier.rows.map(x => x.journalId)).toEqual(['b'])
  })

  it('efek = kredit − debit: kredit MENAMBAH hutang, debit MENGURANGI', () => {
    expect(efekHutangMinor({ debit: '0', kredit: '1000' })).toBe(100_000)
    expect(efekHutangMinor({ debit: '1000', kredit: '0' })).toBe(-100_000)
  })

  it('total tiap kelompok dijumlahkan dalam SEN', () => {
    const r = reconcileHutang({
      perSupplier: [],
      saldoNeracaHutangMinor: 0,
      jurnalManualHutang: [
        jurnal({ journalId: 'a', kredit: '0.10' }),
        jurnal({ journalId: 'b', kredit: '0.20' }),
      ],
    })
    // 0,1 + 0,2 dalam float = 0,30000000000000004. Dalam sen: tepat 30.
    expect(r.penjelas.tanpaSupplier.totalMinor).toBe(30)
  })

  it('penjelas TIDAK dikurangkan dari selisih — ia kemungkinan sebab, bukan koreksi', () => {
    // Selisih "setelah dijelaskan" adalah angka karangan: penjelas bisa
    // sebagian, bisa dobel dengan invoice, bisa dari periode lain. Yang
    // memutuskan apakah ia menjelaskan adalah akunting yang membacanya.
    const r = reconcileHutang({
      perSupplier: [sup({ sisaMinor: 1_000_000 })],
      saldoNeracaHutangMinor: 1_500_000,
      jurnalManualHutang: [jurnal({ kredit: '5000' })],
    })
    expect(r.selisihMinor).toBe(500_000)
    expect(r.penjelas.tanpaSupplier.totalMinor).toBe(500_000)
    expect(Object.keys(r)).not.toContain('belumTerjelaskanMinor')
  })

  it('urut menurut tanggal lalu nomor bukti — "kapan mulai berbeda"', () => {
    const r = reconcileHutang({
      perSupplier: [],
      saldoNeracaHutangMinor: 0,
      jurnalManualHutang: [
        jurnal({ journalId: 'c', tanggal: '2026-09-20', noBukti: 'A' }),
        jurnal({ journalId: 'a', tanggal: '2026-09-01', noBukti: 'Z' }),
        jurnal({ journalId: 'b', tanggal: '2026-09-20', noBukti: '0' }),
      ],
    })
    expect(r.penjelas.tanpaSupplier.rows.map(x => x.journalId)).toEqual(['a', 'b', 'c'])
  })

  it('nominal tak sah dihitung nol, tidak melempar', () => {
    expect(efekHutangMinor({ debit: 'abc', kredit: null })).toBe(0)
  })
})

describe('rupiahKeSen — memulihkan dua desimal, bukan membulatkan selisih', () => {
  it('nilai dua desimal kembali persis', () => {
    expect(rupiahKeSen(3_630_000)).toBe(363_000_000)
    expect(rupiahKeSen(1234.56)).toBe(123_456)
  })

  it('noise float dari Number() tidak menggeser satu sen pun', () => {
    // 0,1 + 0,2 = 0,30000000000000004 — tetap 30 sen.
    expect(rupiahKeSen(0.1 + 0.2)).toBe(30)
  })

  it('nilai negatif (kontra) tetap bertanda', () => {
    expect(rupiahKeSen(-17_185_794.5)).toBe(-1_718_579_450)
  })
})

describe('kontrak modul', () => {
  // Dipindai TANPA komentar: kepala modulnya sengaja MENYEBUT apa yang tidak
  // dipakainya (Math.abs, BALANCE_TOLERANCE) sebagai penjelasan. Yang dicari
  // adalah KODE-nya.
  const SRC = readFileSync(join(process.cwd(), 'lib', 'hutang-reconciliation.ts'), 'utf8')
    .split(/\r?\n/)
    .map(baris => {
      const i = baris.indexOf('//')
      return i === -1 ? baris : baris.slice(0, i)
    })
    .join(String.fromCharCode(10))
    .split('/**')
    .map((potong, i) => (i === 0 ? potong : potong.slice(potong.indexOf('*/') + 2)))
    .join('')

  it('tidak ada Math.abs pada selisih', () => {
    expect(SRC).not.toContain('Math.abs(')
  })

  it('tidak memakai BALANCE_TOLERANCE — ambang itu untuk pertanyaan lain', () => {
    expect(SRC).not.toContain('BALANCE_TOLERANCE')
  })

  it('tidak menghitung sisa sendiri — tidak mengimpor applyPayments/invoiceOutstanding', () => {
    expect(SRC).not.toContain('applyPayments')
    expect(SRC).not.toContain('invoiceOutstanding')
    expect(SRC).not.toContain('allocatedToInvoice')
  })

  it('murni — tidak menyentuh database', () => {
    expect(SRC).not.toContain("from '@/lib/db'")
  })
})
