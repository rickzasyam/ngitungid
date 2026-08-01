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
  // Default sengaja BERBEDA dari `nama`: kalau suatu saat ada fungsi agregasi
  // yang diam-diam beralih memakai displayName, test pencocokan di bawah
  // (yang override `nama` saja) akan langsung merah.
  displayName: 'Nama Tampilan Berbeda',
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

// ── Pemisahan nama pencocokan vs nama tampilan ───────────────
// Penjaga regresi. Pencocokan akun (kas/piutang/persediaan/prepaid/hutang
// dagang) HARUS memakai `nama` = rawName, supaya rasio & skor kesehatan tidak
// ikut bergeser saat akun di-rename di Master COA. Kalau suatu saat ada yang
// mengalihkannya ke displayName (nama kanonik Master COA), test di bawah merah.
describe('aggregateBalanceSheet — mencocokkan lewat `nama` (rawName), BUKAN displayName', () => {
  it('mengenali kas dari `nama` walau displayName tidak mengandung kata kunci', () => {
    const bs = aggregateBalanceSheet([
      bsLine({ nama: 'Kas Bank BCA', displayName: 'Aset Likuid Utama', amount: 1_000 }),
    ])
    // Ikut terhitung sebagai kas → pencocokan membaca `nama`.
    expect(bs.kas).toBe(1_000)
  })

  it('TIDAK terpancing displayName yang mengandung kata kunci', () => {
    const bs = aggregateBalanceSheet([
      bsLine({ nama: 'Sewa Dibayar Tahunan', displayName: 'Kas & Setara Kas', amount: 500 }),
    ])
    // Kalau ini 500, berarti pencocokan sudah beralih ke displayName — bug.
    expect(bs.kas).toBe(0)
  })

  it('rename di Master COA tidak menggeser piutang/persediaan/hutang dagang', () => {
    const lines = [
      bsLine({ nama: 'Piutang Usaha Marketplace', displayName: 'Nama Baru A', amount: 300 }),
      bsLine({ nama: 'Persediaan Barang Jadi', displayName: 'Nama Baru B', amount: 200 }),
      bsLine({ subKelompok: 'Hutang', nama: 'Hutang Dagang Supplier', displayName: 'Nama Baru C', amount: -150 }),
    ]
    const bs = aggregateBalanceSheet(lines)
    expect(bs.piutang).toBe(300)
    expect(bs.persediaan).toBe(200)
    expect(bs.hutangUsaha).toBe(-150)
  })
})

// ── Aktiva Tidak Berwujud: kategori aset KEEMPAT ─────────────
describe('classifyBs — aktivaTidakBerwujud', () => {
  it.each([
    ['Aktiva Tidak Berwujud', 'aktivaTidakBerwujud'],
    ['Aset Tak Berwujud', 'aktivaTidakBerwujud'],
    ['Intangible Assets', 'aktivaTidakBerwujud'],
  ])('"%s" → %s', (sub, cat) => {
    expect(classifyBs(sub)).toBe(cat)
  })

  it('URUTAN: "Aktiva Tetap Tidak Berwujud" → tidak berwujud, BUKAN aktivaTetap', () => {
    // Mengandung dua kata kunci sekaligus. Sifat wujud yang menentukan
    // (PSAK 19 vs PSAK 16) — kalau "tetap" menang, kategori ini tak pernah terisi.
    expect(classifyBs('Aktiva Tetap Tidak Berwujud')).toBe('aktivaTidakBerwujud')
  })

  it('regresi: bucket lama TIDAK berubah perilakunya', () => {
    expect(classifyBs('Aktiva Lancar')).toBe('aktivaLancar')
    expect(classifyBs('Aset Lancar')).toBe('aktivaLancar')
    expect(classifyBs('Aktiva Tetap')).toBe('aktivaTetap')
    expect(classifyBs('Aktiva Lain-Lain')).toBe('aktivaLainnya')
    expect(classifyBs('Hutang')).toBe('hutang')
    expect(classifyBs('Modal')).toBe('modal')
  })
})

describe('classifyBs — catch-all sisi aset & kata kunci pasiva', () => {
  it('apa pun yang menyebut dirinya aktiva/aset TIDAK jatuh ke other', () => {
    for (const sub of ['Aktiva Pajak Tangguhan', 'Aset Hak Guna', 'Aset Biologis', 'Aktiva Sewa']) {
      const cat = classifyBs(sub)
      expect(cat).not.toBe('other')
      expect(cat).toBe('aktivaLainnya')
    }
  })

  it('"Utang" tanpa H dikenali (ejaan baku EYD)', () => {
    expect(classifyBs('Utang Usaha')).toBe('hutang')
    expect(classifyBs('Utang Jangka Panjang')).toBe('hutang')
  })

  it('"Liabilitas" dikenali (istilah PSAK modern)', () => {
    expect(classifyBs('Liabilitas Jangka Pendek')).toBe('hutang')
  })

  it('kata kewajiban menang atas kata aset pada frasa campuran', () => {
    // "Kewajiban atas Aset Sewa" adalah kewajiban, bukan aset.
    expect(classifyBs('Kewajiban atas Aset Sewa')).toBe('hutang')
  })

  it('yang benar-benar tak bertanda tetap other', () => {
    expect(classifyBs('-')).toBe('other')
    expect(classifyBs('Suspense')).toBe('other')
  })
})

describe('aggregateBalanceSheet — totalAset menyertakan bucket baru', () => {
  it('aktivaTidakBerwujud ikut Total Aset', () => {
    const r = aggregateBalanceSheet([
      bsLine({ nama: 'Kas', amount: 500 }),
      bsLine({ subKelompok: 'Aktiva Tidak Berwujud', nama: 'Goodwill', amount: 300 }),
    ])
    expect(r.balanceSheet.aktivaTidakBerwujud).toBe(300)
    expect(r.balanceSheet.totalAset).toBe(800)
  })

  it('kasus nyata Graphicook: 9.000.000 yang dulu hilang kini masuk Total Aset', () => {
    const r = aggregateBalanceSheet([
      bsLine({ nama: 'Kas', amount: 5_800_824_266 }),
      bsLine({ subKelompok: 'Aktiva Tidak Berwujud', nama: 'Software', amount: 9_000_000 }),
      bsLine({ subKelompok: 'Hutang', nama: 'Hutang Dagang', amount: 2_000_000_000 }),
      bsLine({ subKelompok: 'Modal', nama: 'Modal Disetor', amount: 3_809_824_267 }),
    ])
    expect(r.balanceSheet.totalAset).toBe(5_809_824_266)
    // Sebelum perbaikan selisihnya −9.000.001; sekarang −1 (pembulatan).
    expect(r.balance.diff).toBe(-1)
    expect(r.balance.balanced).toBe(true)
  })
})

describe('checkBalance — toleransi Rp 1.000', () => {
  const bs = (aset: number, pasiva: number) =>
    aggregateBalanceSheet([
      bsLine({ nama: 'Kas', amount: aset }),
      bsLine({ subKelompok: 'Modal', nama: 'Modal', amount: pasiva }),
    ]).balance

  it('selisih 0 → balance', () => {
    expect(bs(1000, 1000).balanced).toBe(true)
  })

  it('selisih 1 rupiah (pembulatan PDF) → balance', () => {
    expect(bs(1_000_001, 1_000_000).diff).toBe(1)
    expect(bs(1_000_001, 1_000_000).balanced).toBe(true)
  })

  it('TEPAT di ambang (1.000) → masih balance', () => {
    expect(bs(1_001_000, 1_000_000).diff).toBe(1000)
    expect(bs(1_001_000, 1_000_000).balanced).toBe(true)
  })

  it('SATU rupiah di atas ambang → tidak balance', () => {
    expect(bs(1_001_001, 1_000_000).balanced).toBe(false)
  })

  it('ambang berlaku dua arah (aset kurang)', () => {
    expect(bs(1_000_000, 1_001_001).balanced).toBe(false)
    expect(bs(1_000_000, 1_000_500).balanced).toBe(true)
  })

  it('akun tak terklasifikasi ikut dilaporkan sebagai petunjuk', () => {
    const r = aggregateBalanceSheet([
      bsLine({ nama: 'Kas', amount: 1000 }),
      bsLine({ subKelompok: 'Suspense', nama: 'Entah', amount: 750 }),
      bsLine({ subKelompok: 'Modal', nama: 'Modal', amount: 1000 }),
    ])
    expect(r.balance.unclassifiedCount).toBe(1)
    expect(r.balance.unclassifiedTotal).toBe(750)
  })
})
