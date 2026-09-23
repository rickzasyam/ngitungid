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
  /**
   * Nama untuk PENCOCOKAN — selalu `report_line_items.raw_name` (nama apa
   * adanya dari PDF), JANGAN pernah diisi `master_coa.nama`.
   *
   * Dipakai predikat di aggregateBalanceSheet ('kas'|'bank', 'piutang',
   * 'persediaan', 'dibayar dimuka', 'dagang') yang hasilnya mengalir ke rasio
   * likuiditas, DSO/DIO/DPO, dan skor kesehatan. rawName tidak pernah berubah
   * setelah ekstraksi, jadi angka historis kebal terhadap rename di Master COA.
   * Kalau ini dialihkan ke master_coa.nama, mengganti label akun yang tampak
   * tidak berbahaya bisa diam-diam menggeser rasio klien.
   *
   * Untuk yang tampil ke pengguna, pakai `displayName`.
   */
  nama: string
  /**
   * Nama untuk TAMPILAN — `master_coa.nama` kalau baris sudah ter-mapping,
   * fallback ke rawName kalau belum. Supaya satu baris tampil dengan nama yang
   * sama di Dashboard, Analytics, dan Neraca Detail.
   *
   * Sengaja terpisah dari `nama`: tampilan boleh ikut berubah saat admin
   * merapikan Master COA, pencocokan tidak boleh.
   */
  displayName: string
  kelompok: string
  subKelompok: string
  classCf: string | null
  isSubtotal: boolean
  status: string
}

const norm = (s: string | null | undefined) => (s ?? '').toLowerCase().trim()

export function contributing<T extends AggLine>(lines: readonly T[]): T[] {
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

/**
 * SATU-SATUNYA daftar kategori aset. Semua tempat yang menjumlahkan atau
 * merender sisi aktiva WAJIB diturunkan dari sini — `totalAset` di bawah,
 * `AKTIVA_KEYS` di lib/neraca-compare, daftar section di app/analytics, dan
 * segmen bar di components/dashboard/balance-sheet-health.
 *
 * Dulu keempatnya adalah array literal yang berdiri sendiri, sehingga menambah
 * satu kategori bisa "berhasil" di satu tempat dan hilang diam-diam di tempat
 * lain tanpa error — persis yang terjadi saat Aktiva Tidak Berwujud
 * ditambahkan. Urutannya juga urutan tampil.
 */
export const AKTIVA_CATS = ['aktivaLancar', 'aktivaTetap', 'aktivaTidakBerwujud', 'aktivaLainnya'] as const
export const PASIVA_CATS = ['hutang', 'modal'] as const

export type AktivaCat = (typeof AKTIVA_CATS)[number]
export type BsCat = AktivaCat | (typeof PASIVA_CATS)[number] | 'other'

export const BS_CAT_LABEL: Record<BsCat, string> = {
  aktivaLancar: 'Aktiva Lancar',
  aktivaTetap: 'Aktiva Tetap',
  aktivaTidakBerwujud: 'Aktiva Tidak Berwujud',
  aktivaLainnya: 'Aktiva Lainnya',
  hutang: 'Hutang',
  modal: 'Modal',
  other: 'Tidak Terklasifikasi',
}

export function classifyBs(subKelompok: string): BsCat {
  const s = norm(subKelompok)
  // 'asset' (Inggris) ikut: "Assets" TIDAK mengandung "aset" karena dobel-s,
  // jadi tanpa ini COA berbahasa Inggris lolos dari catch-all sisi aset.
  const isAset = s.includes('aktiva') || s.includes('aset') || s.includes('asset')

  // URUTAN PENTING — "tidak berwujud" HARUS dicek SEBELUM "tetap".
  // Penamaan "Aktiva Tetap Tidak Berwujud" lazim di COA Indonesia dan
  // mengandung KEDUA kata kunci. Yang menentukan secara akuntansi adalah sifat
  // wujudnya, bukan kata "tetap": aset tak berwujud (goodwill, merek, lisensi,
  // software) disajikan sebagai pos tersendiri di neraca — PSAK 19, terpisah
  // dari aset tetap PSAK 16. Kalau "tetap" dicek lebih dulu, seluruh aset tak
  // berwujud akan tertelan Aktiva Tetap dan kategorinya tidak pernah terisi.
  // 'intangible' berdiri sendiri tanpa syarat isAset — tidak ada pos kewajiban
  // maupun modal yang memakai kata itu, jadi tak ambigu.
  if (s.includes('intangible') || (isAset && (s.includes('tidak berwujud') || s.includes('tak berwujud')))) {
    return 'aktivaTidakBerwujud'
  }
  if (isAset && s.includes('lancar')) return 'aktivaLancar'
  if (isAset && s.includes('tetap')) return 'aktivaTetap'
  if (isAset && s.includes('lain')) return 'aktivaLainnya'

  // Sisi pasiva. 'utang' sengaja tanpa H di depan: itu ejaan baku EYD, dan
  // substring-nya juga cocok untuk "Hutang" — satu kata kunci menutup dua ejaan.
  // 'liabilitas' ditambahkan karena istilah itu dipakai PSAK modern.
  if (s.includes('utang') || s.includes('liabilitas') || s.includes('kewajiban')) return 'hutang'
  if (s.includes('modal') || s.includes('ekuitas')) return 'modal'

  // CATCH-ALL sisi aset: apa pun yang menyebut dirinya aktiva/aset TAPI tidak
  // cocok kategori mana pun tetap masuk Total Aset lewat Aktiva Lainnya —
  // JANGAN dibiarkan jatuh ke 'other'. Aset yang hilang dari Total Aset
  // langsung memecah identitas Aktiva = Pasiva, dan itu jauh lebih berbahaya
  // daripada salah menempatkannya di sub-kategori.
  //
  // Sengaja SETELAH pengecekan pasiva: kata kewajiban/modal adalah sinyal yang
  // lebih kuat, sehingga "Kewajiban atas Aset Sewa" tetap jadi hutang. Yang
  // dikorbankan hanyalah aset sejati yang namanya memuat kata kewajiban —
  // kasus patologis yang belum pernah muncul.
  //
  // TIDAK ada catch-all serupa di sisi pasiva: di sana tak ada penanda tunggal
  // yang tak ambigu seperti "aset", jadi menebak justru berisiko.
  if (isAset) return 'aktivaLainnya'
  return 'other'
}

export interface BalanceSheetAgg {
  aktivaLancar: number
  aktivaTetap: number
  aktivaTidakBerwujud: number
  aktivaLainnya: number
  totalAset: number
  totalHutang: number
  totalModal: number
}

/**
 * Ambang identitas Aktiva = Pasiva, dalam rupiah absolut.
 *
 * Rp 1.000 dipilih dari data nyata: selisih yang murni pembulatan PDF terukur
 * ±1 rupiah di seluruh periode, sedangkan kesalahan klasifikasi nyata terkecil
 * yang pernah terjadi adalah Rp 9.000.000 (Aktiva Tidak Berwujud Graphicook
 * yang hilang dari Total Aset). Jadi ambang ini ~1.000× di atas noise yang
 * teramati namun masih 9.000× di bawah kesalahan sungguhan — mustahil menelan
 * kesalahan sekelas itu.
 *
 * Sengaja ABSOLUT, bukan persentase: 0,01% dari total aset Graphicook sudah
 * ±580.000, terlalu longgar untuk manfaat yang tidak seberapa, dan ambangnya
 * ikut membesar justru pada klien yang angkanya paling besar.
 */
export const BALANCE_TOLERANCE = 1000

export interface BalanceCheck {
  /** totalAset − (totalHutang + totalModal). Positif = aset berlebih. */
  diff: number
  balanced: boolean
  tolerance: number
  /** Baris neraca yang subKelompok-nya tak dikenali — penyebab paling lazim. */
  unclassifiedCount: number
  unclassifiedTotal: number
}

export function checkBalance(
  bs: BalanceSheetAgg,
  unclassified: { count: number; total: number }
): BalanceCheck {
  const diff = bs.totalAset - (bs.totalHutang + bs.totalModal)
  return {
    diff,
    balanced: Math.abs(diff) <= BALANCE_TOLERANCE,
    tolerance: BALANCE_TOLERANCE,
    unclassifiedCount: unclassified.count,
    unclassifiedTotal: unclassified.total,
  }
}

export interface WorkingCapitalItem {
  label: string
  value: number
  icon: string
}

/** Agregasi neraca dari baris SATU laporan neraca (point-in-time). */
export function aggregateBalanceSheet(lines: AggLine[]): {
  balanceSheet: BalanceSheetAgg
  balance: BalanceCheck
  workingCapital: WorkingCapitalItem[]
  kas: number
  piutang: number
  persediaan: number
  prepaid: number
  hutangLancar: number
  hutangUsaha: number
} {
  const c = contributing(lines).filter(l => norm(l.kelompok).includes('neraca'))
  // Penjumlahan BERTANDA (bukan Math.abs). Akun KONTRA disimpan negatif dari
  // ekstraksi (di PDF ditulis dalam kurung): Akumulasi Penyusutan & provisi
  // (kontra-aset), Prive (kontra-modal), saldo kas overdraft. Math.abs dulu
  // MEMBALIK tandanya → tiap kategori ber-kontra menggelembung 2×|nilai kontra|
  // (mis. Aktiva Lancar Rasyuka Feb over 34.371.942 dari Kas Tiktok −177 +
  // Cadangan Promosi −17.185.794), dan identitas TOTAL AKTIVA = TOTAL PASIVA
  // pecah. Signed = cocok PDF & identitas terjaga (sama dgn lib/neraca-compare).
  const sumCat = (cat: BsCat) =>
    c.filter(l => classifyBs(l.subKelompok) === cat).reduce((s, l) => s + l.amount, 0)

  const aktivaLancar = sumCat('aktivaLancar')
  const aktivaTetap = sumCat('aktivaTetap')
  const aktivaTidakBerwujud = sumCat('aktivaTidakBerwujud')
  const aktivaLainnya = sumCat('aktivaLainnya')
  const totalHutang = sumCat('hutang')
  const totalModal = sumCat('modal')
  // DITURUNKAN dari AKTIVA_CATS, bukan dijumlah manual: menambah kategori aset
  // baru otomatis ikut ke Total Aset tanpa perlu ingat memperbarui baris ini.
  const totalAset = AKTIVA_CATS.reduce((sum, cat) => sum + sumCat(cat), 0)

  // Baris neraca yang subKelompok-nya tidak dikenali sama sekali. Setelah
  // catch-all aset, ini hanya bisa berisi hal yang tidak menyebut dirinya
  // aktiva/aset maupun kewajiban/modal — petunjuk paling actionable saat
  // identitas Aktiva = Pasiva tidak seimbang.
  const unclassifiedLines = c.filter(l => classifyBs(l.subKelompok) === 'other')
  const unclassified = {
    count: unclassifiedLines.length,
    total: unclassifiedLines.reduce((s, l) => s + l.amount, 0),
  }

  // Akun spesifik dalam Aktiva Lancar (match by nama).
  const inLancar = c.filter(l => classifyBs(l.subKelompok) === 'aktivaLancar')
  const sumNama = (pred: (n: string) => boolean) =>
    inLancar.filter(l => pred(norm(l.nama))).reduce((s, l) => s + l.amount, 0)

  const kas = sumNama(n => n.includes('kas') || n.includes('bank'))
  const piutang = sumNama(n => n.includes('piutang'))
  const persediaan = sumNama(n => n.includes('persediaan'))
  const prepaid = sumNama(n => n.includes('dibayar dimuka') || n.includes('dibayar di muka'))

  // Akun spesifik dalam sisi Hutang (match by nama). HANYA "Hutang Dagang"
  // dihitung sebagai Hutang Usaha / accounts payable (dasar DPO). subKelompok
  // "Hutang" di COA klien campur (Pihak Ketiga, Pajak, Gaji, dsb) — akun-akun
  // itu tetap masuk totalHutang/hutangLancar, tapi BUKAN AP.
  const inHutang = c.filter(l => classifyBs(l.subKelompok) === 'hutang')
  const sumNamaHutang = (pred: (n: string) => boolean) =>
    inHutang.filter(l => pred(norm(l.nama))).reduce((s, l) => s + l.amount, 0)
  const hutangUsaha = sumNamaHutang(n => n.includes('dagang'))

  // Hutang lancar untuk rasio likuiditas. COA asli hanya punya subKelompok
  // "Hutang" (tanpa pisah lancar/jk-panjang) → pakai total hutang sebagai proxy.
  const hutangLancar = totalHutang

  const balanceSheet: BalanceSheetAgg = {
    aktivaLancar,
    aktivaTetap,
    aktivaTidakBerwujud,
    aktivaLainnya,
    totalAset,
    totalHutang,
    totalModal,
  }

  return {
    balanceSheet,
    balance: checkBalance(balanceSheet, unclassified),
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
    hutangUsaha,
  }
}

// ── Saldo neraca per akun (Rekonsiliasi hutang supplier) ─────

/** AggLine yang membawa akun Master COA tempat baris itu dipetakan. */
export interface AggLineAkun extends AggLine {
  /** `report_line_items.master_coa_id` — null bila baris belum dipetakan. */
  masterCoaId: string | null
}

export interface SaldoAkunNeraca {
  masterCoaId: string
  /** Jumlah BERTANDA baris yang ikut dihitung, dalam SEN. */
  saldoMinor: number
  jumlahBaris: number
}

/**
 * Saldo neraca untuk SEKUMPULAN AKUN pilihan pemanggil — dicocokkan lewat
 * pemetaan (`master_coa_id`), BUKAN lewat nama.
 *
 * Lahir untuk Rekonsiliasi hutang supplier (keputusan Ricko di CP-8): yang
 * dibandingkan dengan sisa per supplier adalah saldo akun yang BENAR-BENAR
 * menampung hutang supplier, bukan `hutangUsaha` yang hanya mengenali nama
 * "dagang". Klien yang mencatat hutang supplier di "Hutang Pihak Ketiga"
 * akan selamanya berselisih sebesar seluruh hutangnya kalau dibandingkan
 * dengan predikat nama — selisih yang bukan temuan, melainkan salah ukur.
 *
 * Aturan baris yang ikut SAMA dengan `aggregateBalanceSheet`: `contributing()`
 * (matched/edited, bukan subtotal), kelompok neraca, dan penjumlahan BERTANDA.
 *
 * Hasilnya:
 *   - `perAkun` — hanya akun yang punya minimal satu baris yang ikut dihitung,
 *     berurutan menurut `akunIds`. Akun yang tidak muncul di sini TIDAK ADA di
 *     neraca ini — berbeda dari akun yang ada dengan saldo nol.
 *   - `totalMinor` — `null` bila tidak satu pun akun ditemukan. Nol di sana
 *     akan terbaca "hutangnya nol", padahal neracanya tidak menyebut akun itu.
 *
 * Dalam SEN: tiap baris dibulatkan ke sen SEBELUM dijumlah, jadi tidak ada
 * galat float yang menumpuk di antara baris.
 */
export function saldoNeracaPerAkun(
  lines: readonly AggLineAkun[],
  akunIds: readonly string[]
): { perAkun: SaldoAkunNeraca[]; totalMinor: number | null } {
  const dicari = new Set(akunIds)
  const per = new Map<string, SaldoAkunNeraca>()
  for (const l of contributing(lines)) {
    if (!norm(l.kelompok).includes('neraca')) continue
    if (l.masterCoaId === null || !dicari.has(l.masterCoaId)) continue
    const s = per.get(l.masterCoaId) ?? { masterCoaId: l.masterCoaId, saldoMinor: 0, jumlahBaris: 0 }
    s.saldoMinor += Math.round(l.amount * 100)
    s.jumlahBaris += 1
    per.set(l.masterCoaId, s)
  }
  const perAkun = [...dicari].flatMap(id => {
    const s = per.get(id)
    return s ? [s] : []
  })
  return {
    perAkun,
    totalMinor: perAkun.length === 0 ? null : perAkun.reduce((t, s) => t + s.saldoMinor, 0),
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
