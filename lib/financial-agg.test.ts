import { describe, it, expect } from 'vitest'
import {
  contributing,
  classifyPnl,
  classifyBs,
  aggregatePnl,
  aggregateBalanceSheet,
  aggregateCashflow,
  monthLabel,
  type AggLine,
} from './financial-agg'

// Baris default = baris Laba Rugi normal yang ikut dihitung; override seperlunya.
const line = (over: Partial<AggLine> = {}): AggLine => ({
  amount: 0,
  nama: 'Akun',
  kelompok: 'Laba Rugi',
  subKelompok: 'Penjualan',
  classCf: null,
  isSubtotal: false,
  status: 'matched',
  ...over,
})

const bsLine = (over: Partial<AggLine> = {}): AggLine =>
  line({ kelompok: 'Neraca', subKelompok: 'Aktiva Lancar', ...over })

describe('contributing', () => {
  it('hanya baris matched/edited yang bukan subtotal', () => {
    const lines = [
      line({ status: 'matched' }),
      line({ status: 'edited' }),
      line({ status: 'unmatched' }),
      line({ status: 'rejected' }),
      line({ status: 'matched', isSubtotal: true }),
    ]
    expect(contributing(lines)).toHaveLength(2)
  })
})

describe('classifyPnl — urutan kata kunci itu penting', () => {
  // Regresi: "Harga Pokok Penjualan" MENGANDUNG "penjualan" (kata kunci revenue).
  // Kalau revenue dicek lebih dulu, HPP salah masuk revenue → laba kotor kacau.
  it('"Harga Pokok Penjualan" → hpp, BUKAN revenue', () => {
    expect(classifyPnl('Harga Pokok Penjualan')).toBe('hpp')
  })

  // "Pendapatan dan Biaya Lain-Lain" mengandung "pendapatan" (kata kunci revenue).
  it('"Pendapatan dan Biaya Lain-Lain" → lainLain, BUKAN revenue', () => {
    expect(classifyPnl('Pendapatan dan Biaya Lain-Lain')).toBe('lainLain')
  })

  it.each([
    ['Penjualan', 'revenue'],
    ['Penerimaan', 'revenue'],
    ['Pendapatan', 'revenue'],
    ['HPP', 'hpp'],
    ['COGS', 'hpp'],
    ['Biaya Variabel', 'varCost'],
    ['Variable Cost', 'varCost'],
    ['Fixed Cost', 'fixedCost'],
    ['Biaya Tetap', 'fixedCost'],
    ['Pajak Penghasilan', 'pajak'],
    ['Entah Apa', 'other'],
  ])('"%s" → %s', (sub, cat) => {
    expect(classifyPnl(sub)).toBe(cat)
  })

  it('tahan huruf besar/kecil & spasi berlebih', () => {
    expect(classifyPnl('  HARGA POKOK PENJUALAN  ')).toBe('hpp')
  })
})

describe('aggregatePnl — rumus yang dicocokkan dengan PDF klien', () => {
  it('revenue net − hpp = laba kotor; − biaya + lain-lain − pajak = laba bersih', () => {
    const a = aggregatePnl([
      line({ subKelompok: 'Penjualan', amount: 100_000_000 }),
      // Retur/potongan tersimpan BERTANDA negatif → revenue otomatis jadi net.
      line({ subKelompok: 'Penjualan', nama: 'Retur Penjualan', amount: -5_000_000 }),
      line({ subKelompok: 'Harga Pokok Penjualan', amount: 60_000_000 }),
      line({ subKelompok: 'Biaya Variabel', amount: 10_000_000 }),
      line({ subKelompok: 'Fixed Cost', amount: 8_000_000 }),
      line({ subKelompok: 'Pendapatan dan Biaya Lain-Lain', amount: 2_000_000 }),
      line({ subKelompok: 'Pajak Penghasilan', amount: 1_000_000 }),
    ])
    expect(a.revenue).toBe(95_000_000)
    expect(a.hpp).toBe(60_000_000)
    expect(a.grossProfit).toBe(35_000_000) // 95 − 60
    expect(a.expenses).toBe(18_000_000) // 10 + 8
    expect(a.lainLain).toBe(2_000_000)
    expect(a.pajak).toBe(1_000_000)
    expect(a.netProfit).toBe(18_000_000) // 35 − 18 + 2 − 1
  })

  it('hpp/biaya/pajak di-abs → tanda kurung di PDF tidak menggandakan pengurangan', () => {
    const a = aggregatePnl([
      line({ subKelompok: 'Penjualan', amount: 100 }),
      line({ subKelompok: 'HPP', amount: -60 }),
      line({ subKelompok: 'Fixed Cost', amount: -10 }),
    ])
    expect(a.hpp).toBe(60)
    expect(a.grossProfit).toBe(40)
    expect(a.netProfit).toBe(30)
  })

  it('lain-lain BERTANDA — bisa mengurangi laba bersih', () => {
    const a = aggregatePnl([
      line({ subKelompok: 'Penjualan', amount: 100 }),
      line({ subKelompok: 'Pendapatan dan Biaya Lain-Lain', amount: -30 }),
    ])
    expect(a.lainLain).toBe(-30)
    expect(a.netProfit).toBe(70)
  })

  it('mengabaikan baris kelompok Neraca', () => {
    const a = aggregatePnl([
      line({ subKelompok: 'Penjualan', amount: 100 }),
      line({ kelompok: 'Neraca', subKelompok: 'Aktiva Lancar', amount: 999 }),
    ])
    expect(a.revenue).toBe(100)
  })
})

describe('classifyBs', () => {
  it.each([
    ['Aktiva Lancar', 'aktivaLancar'],
    ['Aset Lancar', 'aktivaLancar'],
    ['Aktiva Tetap', 'aktivaTetap'],
    ['Aktiva Lain-Lain', 'aktivaLainnya'],
    ['Hutang', 'hutang'],
    ['Kewajiban Lancar', 'hutang'],
    ['Modal', 'modal'],
    ['Ekuitas', 'modal'],
    ['Suspense', 'other'],
  ])('"%s" → %s', (sub, cat) => {
    expect(classifyBs(sub)).toBe(cat)
  })
})

describe('aggregateBalanceSheet — penjumlahan BERTANDA (regresi b892b82)', () => {
  // Bug 2026-07-14: dulu Math.abs(amount) PER BARIS. Akun kontra tersimpan
  // negatif dari ekstraksi (di PDF ditulis dalam kurung) → abs MEMBALIK tandanya,
  // kategori menggelembung TEPAT 2×|kontra|, dan identitas TOTAL AKTIVA =
  // TOTAL PASIVA pecah. Kasus nyata Rasyuka Feb: Aktiva Lancar kelebihan
  // 34.371.942 = 2 × (177 + 17.185.794).
  const KAS_NEGATIF = -177 // saldo kas marketplace negatif
  const CADANGAN_PROMOSI = -17_185_794 // kontra-aset

  it('akun kontra MENGURANGI kategori, bukan menambah', () => {
    const positif = 1_586_000_000
    const bs = aggregateBalanceSheet([
      bsLine({ nama: 'Kas Bank BCA', amount: positif }),
      bsLine({ nama: 'Kas Tiktok', amount: KAS_NEGATIF }),
      bsLine({ nama: 'Cadangan Promosi', amount: CADANGAN_PROMOSI }),
    ]).balanceSheet

    const signed = positif + KAS_NEGATIF + CADANGAN_PROMOSI
    const absBug = positif + Math.abs(KAS_NEGATIF) + Math.abs(CADANGAN_PROMOSI)

    expect(bs.aktivaLancar).toBe(signed)
    expect(bs.aktivaLancar).not.toBe(absBug)
    // Tanda tangan bug lama: selisih PERSIS 2× total kontra.
    expect(absBug - bs.aktivaLancar).toBe(2 * 17_185_971)
    expect(absBug - bs.aktivaLancar).toBe(34_371_942)
  })

  it('identitas TOTAL AKTIVA = TOTAL PASIVA terjaga walau ada kontra di dua sisi', () => {
    const r = aggregateBalanceSheet([
      bsLine({ nama: 'Kas', amount: 500 }),
      bsLine({ subKelompok: 'Aktiva Tetap', nama: 'Kendaraan', amount: 300 }),
      bsLine({ subKelompok: 'Aktiva Tetap', nama: 'Akumulasi Penyusutan', amount: -100 }),
      bsLine({ subKelompok: 'Hutang', nama: 'Hutang Dagang', amount: 200 }),
      bsLine({ subKelompok: 'Modal', nama: 'Modal Disetor', amount: 550 }),
      bsLine({ subKelompok: 'Modal', nama: 'Prive', amount: -50 }),
    ])
    const { totalAset, totalHutang, totalModal, aktivaTetap } = r.balanceSheet
    expect(aktivaTetap).toBe(200) // 300 − 100 (akumulasi penyusutan)
    expect(totalAset).toBe(700)
    expect(totalModal).toBe(500) // 550 − 50 (prive)
    expect(totalHutang + totalModal).toBe(700)
    expect(totalAset).toBe(totalHutang + totalModal)
  })
})

describe('aggregateBalanceSheet — akun spesifik', () => {
  it('kas/piutang/persediaan/prepaid dicocokkan by nama di dalam Aktiva Lancar', () => {
    const r = aggregateBalanceSheet([
      bsLine({ nama: 'Kas Kecil', amount: 100 }),
      bsLine({ nama: 'Bank BCA', amount: 400 }),
      bsLine({ nama: 'Piutang Usaha', amount: 250 }),
      bsLine({ nama: 'Persediaan Barang', amount: 300 }),
      bsLine({ nama: 'Sewa Dibayar Dimuka', amount: 60 }),
    ])
    expect(r.kas).toBe(500) // Kas Kecil + Bank BCA
    expect(r.piutang).toBe(250)
    expect(r.persediaan).toBe(300)
    expect(r.prepaid).toBe(60)
    // Urutan kartu Modal Kerja di dashboard: Kas, Piutang, Prepaid, Persediaan.
    expect(r.workingCapital.map(w => w.value)).toEqual([500, 250, 60, 300])
  })

  // subKelompok "Hutang" di COA klien mencampur AP dengan pajak/gaji/akrual.
  // DPO hanya boleh berbasis Hutang Dagang — kalau semua dihitung, DPO overstated.
  it('hutangUsaha HANYA akun ber-nama "dagang"; sisanya tetap masuk total hutang', () => {
    const r = aggregateBalanceSheet([
      bsLine({ subKelompok: 'Hutang', nama: 'Hutang Dagang', amount: 200 }),
      bsLine({ subKelompok: 'Hutang', nama: 'Hutang Pajak', amount: 50 }),
      bsLine({ subKelompok: 'Hutang', nama: 'Hutang Gaji', amount: 30 }),
    ])
    expect(r.hutangUsaha).toBe(200)
    expect(r.balanceSheet.totalHutang).toBe(280)
    // COA klien tak memisah lancar/jangka-panjang → total hutang jadi proxy.
    expect(r.hutangLancar).toBe(280)
  })

  it('mengabaikan baris kelompok Laba Rugi', () => {
    const r = aggregateBalanceSheet([
      bsLine({ nama: 'Kas', amount: 100 }),
      line({ subKelompok: 'Penjualan', amount: 999 }),
    ])
    expect(r.balanceSheet.aktivaLancar).toBe(100)
  })
})

describe('aggregateCashflow', () => {
  it('mengelompokkan by classCf, BERTANDA (arus keluar negatif)', () => {
    const cf = aggregateCashflow([
      line({ classCf: 'Operating', amount: 500 }),
      line({ classCf: 'operasi', amount: -100 }),
      line({ classCf: 'Investing', amount: -300 }),
      line({ classCf: 'Funding', amount: 200 }),
      line({ classCf: 'Pendanaan', amount: -50 }),
    ])
    expect(cf).toEqual({ operating: 400, investing: -300, funding: 150 })
  })

  // "Operating Balance" = SALDO kas, bukan arus. Kalau ikut dijumlah, arus
  // operasi dobel-hitung dengan saldonya.
  it('classCf "Operating Balance" (saldo) dikecualikan dari operating', () => {
    const cf = aggregateCashflow([
      line({ classCf: 'Operating', amount: 500 }),
      line({ classCf: 'Operating Balance', amount: 9_999 }),
    ])
    expect(cf.operating).toBe(500)
  })

  it('classCf null diabaikan', () => {
    expect(aggregateCashflow([line({ classCf: null, amount: 123 })])).toEqual({
      operating: 0,
      investing: 0,
      funding: 0,
    })
  })
})

describe('monthLabel', () => {
  it('mengambil bulan dari periodStart YYYY-MM-DD', () => {
    expect(monthLabel('2026-01-01')).toBe('Jan')
    expect(monthLabel('2026-03-31')).toBe('Mar')
    expect(monthLabel('2026-12-01')).toBe('Dec')
  })
})
