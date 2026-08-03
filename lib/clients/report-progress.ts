// Progres laporan per klien untuk kartu sidebar.
//
// Menggantikan indikator "% storage used" yang dulu ada di situ: nilainya
// pseudoStorage(clientId) — hash UUID klien, tidak pernah menyentuh data sama
// sekali, jadi angkanya tidak berubah walau laporan bertambah. Selain palsu,
// istilah "storage" menyiratkan kuota penyimpanan yang memang tidak ada di
// produk ini. Yang berguna bagi akuntan: klien ini laporannya sudah sampai mana.

/** Satu bulan dianggap SELESAI kalau ketiga jenis laporan sudah masuk. */
export const REQUIRED_REPORT_TYPES = 3

/** Satu bulan milik klien: 'YYYY-MM' + berapa jenis laporan yang sudah ada. */
export interface ClientMonth {
  m: string
  types: number
}

export type ProgressKind =
  /** Belum ada laporan sama sekali — tidak ada jangkar, jadi tidak ada rasio. */
  | 'none'
  /** Laporan pertama justru di bulan berjalan → jendela penilaian masih kosong. */
  | 'no-window'
  | 'ratio'

export interface ReportProgress {
  kind: ProgressKind
  /** Bulan lengkap dalam jendela penilaian. */
  completed: number
  /** Bulan yang SEHARUSNYA sudah masuk: dari bulan pertama klien s/d bulan
   *  lengkap terakhir (bulan berjalan TIDAK ikut). */
  total: number
  /** Bulan terakhir yang punya laporan, lengkap atau belum. */
  lastMonth: string | null
  /** Bulan yang sudah ada laporannya tapi belum ketiga jenis. */
  incompleteMonths: string[]
}

const idx = (m: string) => {
  const [y, mo] = m.split('-').map(Number)
  return y * 12 + (mo - 1)
}

const toMonth = (i: number) => `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}`

/** 'YYYY-MM' dari sebuah Date, memakai waktu LOKAL (bukan UTC): batas bulan di
 *  WIB tidak boleh bergeser sehari gara-gara toISOString. */
export function monthOf(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

/**
 * @param months  bulan-bulan milik klien (urutan bebas, duplikat aman)
 * @param today   acuan "sekarang" — parameter, bukan `new Date()` di dalam,
 *                supaya fungsinya murni & bisa diuji untuk tanggal mana pun.
 */
export function computeReportProgress(months: readonly ClientMonth[], today: Date): ReportProgress {
  const byMonth = new Map<string, number>()
  for (const x of months) {
    // Ambil jumlah jenis TERBESAR kalau ada baris ganda untuk bulan yang sama.
    byMonth.set(x.m, Math.max(byMonth.get(x.m) ?? 0, x.types))
  }
  const semua = [...byMonth.keys()].sort()

  if (semua.length === 0) {
    return { kind: 'none', completed: 0, total: 0, lastMonth: null, incompleteMonths: [] }
  }

  const lastMonth = semua[semua.length - 1]
  const incompleteMonths = semua.filter(m => (byMonth.get(m) ?? 0) < REQUIRED_REPORT_TYPES)

  // Bulan BERJALAN sengaja tidak ikut: laporan bulan M baru disusun awal bulan
  // M+1, jadi memasukkannya membuat setiap klien selalu terlihat tertinggal
  // satu bulan sepanjang bulan — sinyal palsu yang melatih orang mengabaikannya.
  const batasAkhir = idx(monthOf(today)) - 1
  // Jangkar = bulan pertama klien, BUKAN clients.created_at: kolom itu berisi
  // tanggal pembuatan record (dan pada data nyata justru LEBIH BARU dari
  // periode laporan paling awal), jadi tak bisa menandai kapan klien mulai
  // dilayani. Memakai bulan pertama juga otomatis adil untuk klien yang baru
  // masuk tengah tahun.
  const jangkar = idx(semua[0])

  if (jangkar > batasAkhir) {
    return { kind: 'no-window', completed: 0, total: 0, lastMonth, incompleteMonths }
  }

  const total = batasAkhir - jangkar + 1
  // Bulan lengkap DI DALAM jendela saja — bulan berjalan yang kebetulan sudah
  // diunggah tidak boleh membuat completed melebihi total.
  const completed = semua.filter(
    m => (byMonth.get(m) ?? 0) >= REQUIRED_REPORT_TYPES && idx(m) >= jangkar && idx(m) <= batasAkhir
  ).length

  return { kind: 'ratio', completed, total, lastMonth, incompleteMonths }
}

const BULAN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des']

/** '2026-03' → 'Mar 2026'. */
export function formatMonth(m: string): string {
  const [y, mo] = m.split('-').map(Number)
  return `${BULAN[mo - 1] ?? '?'} ${y}`
}

/** Berapa bulan tertinggal dari batas jendela. 0 = terkini. */
export function monthsBehind(p: ReportProgress): number {
  return p.kind === 'ratio' ? p.total - p.completed : 0
}

export { toMonth as __toMonthForTest }
