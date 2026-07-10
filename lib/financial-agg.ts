// Agregasi angka Dashboard & Analytics dari report_line_items + master_coa,
// dihitung on-the-fly (tidak ada tabel snapshot — lihat keputusan ROADMAP
// 2026-07-02). Murni (tanpa I/O) → gampang diuji & dipakai dari route mana pun.
//
// Hanya baris berstatus 'matched'/'edited' dan BUKAN subtotal yang dihitung —
// baris 'unmatched'/'rejected' dan subtotal (total dari PDF) tidak ikut.
//
// Klasifikasi berbasis KATA KUNCI pada subKelompok/classCf supaya tahan
// terhadap variasi taksonomi antar klien (mis. COA asli Rasyuka pakai
// "Penjualan"/"Harga Pokok Penjualan", seed-dev pakai "Penerimaan"/"HPP").

export interface AggLine {
  amount: number
  nama: string
  kelompok: string
  subKelompok: string
  classCf: string | null
  isSubtotal: boolean
  status: string
}

const norm = (s: string | null | undefined) => (s ?? '').toLowerCase().trim()

export function contributing(lines: AggLine[]): AggLine[] {
  return lines.filter(l => !l.isSubtotal && (l.status === 'matched' || l.status === 'edited'))
}

// ── Klasifikasi kategori Laba Rugi dari subKelompok ──────────
type PnlCat = 'revenue' | 'hpp' | 'varCost' | 'fixedCost' | 'lainLain' | 'pajak' | 'other'

export function classifyPnl(subKelompok: string): PnlCat {
  const s = norm(subKelompok)
  // URUTAN PENTING: "pendapatan dan biaya lain-lain" & "harga pokok penjualan"
  // sama-sama mengandung kata kunci revenue → keduanya harus dicek LEBIH DULU.
  if (s.includes('lain')) return 'lainLain'
  if (s.includes('pajak')) return 'pajak'
  if (s.includes('harga pokok') || s.includes('hpp') || s.includes('cogs')) return 'hpp'
  if (s.includes('variabel') || s.includes('variable')) return 'varCost'
  if (s.includes('fixed') || s.includes('tetap')) return 'fixedCost'
  if (s.includes('penjualan') || s.includes('penerimaan') || s.includes('pendapatan')) return 'revenue'
  return 'other'
}

export interface PnlAgg {
  revenue: number
  hpp: number
  varCost: number
  fixedCost: number
  lainLain: number
  pajak: number
  grossProfit: number
  expenses: number
  netProfit: number
}

/** Agregasi P&L dari baris SATU laporan laba_rugi. */
export function aggregatePnl(lines: AggLine[]): PnlAgg {
  const bucket: Record<PnlCat, number> = { revenue: 0, hpp: 0, varCost: 0, fixedCost: 0, lainLain: 0, pajak: 0, other: 0 }
  for (const l of contributing(lines)) {
    if (norm(l.kelompok).includes('laba')) bucket[classifyPnl(l.subKelompok)] += l.amount
  }
  const revenue = bucket.revenue // net (penjualan + retur/potongan yg bertanda −)
  const hpp = Math.abs(bucket.hpp)
  const varCost = Math.abs(bucket.varCost)
  const fixedCost = Math.abs(bucket.fixedCost)
  const lainLain = bucket.lainLain // net, sudah bertanda
  const pajak = Math.abs(bucket.pajak)
  const grossProfit = revenue - hpp
  const expenses = varCost + fixedCost
  const netProfit = grossProfit - expenses + lainLain - pajak
  return { revenue, hpp, varCost, fixedCost, lainLain, pajak, grossProfit, expenses, netProfit }
}

// ── Neraca ────────────────────────────────────────────────────
type BsCat = 'aktivaLancar' | 'aktivaTetap' | 'aktivaLainnya' | 'hutang' | 'modal' | 'other'

export function classifyBs(subKelompok: string): BsCat {
  const s = norm(subKelompok)
  if (s.includes('lancar') && (s.includes('aktiva') || s.includes('aset'))) return 'aktivaLancar'
  if (s.includes('tetap') && (s.includes('aktiva') || s.includes('aset'))) return 'aktivaTetap'
  if ((s.includes('aktiva') || s.includes('aset')) && s.includes('lain')) return 'aktivaLainnya'
  if (s.includes('hutang') || s.includes('kewajiban')) return 'hutang'
  if (s.includes('modal') || s.includes('ekuitas')) return 'modal'
  return 'other'
}

export interface BalanceSheetAgg {
  aktivaLancar: number
  aktivaTetap: number
  aktivaLainnya: number
  totalAset: number
  totalHutang: number
  totalModal: number
}

export interface WorkingCapitalItem {
  label: string
  value: number
  icon: string
}

/** Agregasi neraca dari baris SATU laporan neraca (point-in-time). */
export function aggregateBalanceSheet(lines: AggLine[]): {
  balanceSheet: BalanceSheetAgg
  workingCapital: WorkingCapitalItem[]
  kas: number
  piutang: number
  persediaan: number
  prepaid: number
  hutangLancar: number
} {
  const c = contributing(lines).filter(l => norm(l.kelompok).includes('neraca'))
  const sumCat = (cat: BsCat) =>
    c.filter(l => classifyBs(l.subKelompok) === cat).reduce((s, l) => s + Math.abs(l.amount), 0)

  const aktivaLancar = sumCat('aktivaLancar')
  const aktivaTetap = sumCat('aktivaTetap')
  const aktivaLainnya = sumCat('aktivaLainnya')
  const totalHutang = sumCat('hutang')
  const totalModal = sumCat('modal')
  const totalAset = aktivaLancar + aktivaTetap + aktivaLainnya

  // Akun spesifik dalam Aktiva Lancar (match by nama).
  const inLancar = c.filter(l => classifyBs(l.subKelompok) === 'aktivaLancar')
  const sumNama = (pred: (n: string) => boolean) =>
    inLancar.filter(l => pred(norm(l.nama))).reduce((s, l) => s + Math.abs(l.amount), 0)

  const kas = sumNama(n => n.includes('kas') || n.includes('bank'))
  const piutang = sumNama(n => n.includes('piutang'))
  const persediaan = sumNama(n => n.includes('persediaan'))
  const prepaid = sumNama(n => n.includes('dibayar dimuka') || n.includes('dibayar di muka'))

  // Hutang lancar untuk rasio likuiditas. COA asli hanya punya subKelompok
  // "Hutang" (tanpa pisah lancar/jk-panjang) → pakai total hutang sebagai proxy.
  const hutangLancar = totalHutang

  return {
    balanceSheet: { aktivaLancar, aktivaTetap, aktivaLainnya, totalAset, totalHutang, totalModal },
    workingCapital: [
      { label: 'Kas & Setara Kas', value: kas, icon: 'cash' },
      { label: 'Piutang Usaha', value: piutang, icon: 'receivable' },
      { label: 'Biaya Dibayar Dimuka', value: prepaid, icon: 'prepaid' },
      { label: 'Persediaan', value: persediaan, icon: 'inventory' },
    ],
    kas,
    piutang,
    persediaan,
    prepaid,
    hutangLancar,
  }
}

// ── Arus Kas ──────────────────────────────────────────────────
export interface CashflowAgg {
  operating: number
  investing: number
  funding: number
}

/** Agregasi arus kas dari baris SATU laporan arus_kas, berdasarkan classCf. */
export function aggregateCashflow(lines: AggLine[]): CashflowAgg {
  const c = contributing(lines)
  let operating = 0
  let investing = 0
  let funding = 0
  for (const l of c) {
    const cf = norm(l.classCf)
    if (cf === 'operating' || cf === 'operasi') operating += l.amount // "operating balance" (saldo) dikecualikan
    else if (cf.includes('invest')) investing += l.amount
    else if (cf.includes('funding') || cf.includes('pendanaan')) funding += l.amount
  }
  return { operating, investing, funding }
}

// ── Bulan dari periodStart ────────────────────────────────────
const BULAN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
export function monthLabel(periodStart: string): string {
  const m = Number(periodStart.slice(5, 7))
  return BULAN[m - 1] ?? periodStart
}
