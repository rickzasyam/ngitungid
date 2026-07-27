// SATU-SATUNYA definisi "baris ini masih perlu dipetakan" untuk seluruh app.
//
// Sebelum modul ini, kriteria yang sama ditulis ulang di beberapa tempat dan
// sempat menyimpang: route /mapping mengecualikan baris rejected, sementara
// hitungan di /api/reports/list tidak. Akibatnya laporan bisa dianggap selesai
// oleh satu bagian app tapi masih "ada sisa" menurut bagian lain.
//
// Dipakai oleh:
//   - POST /api/upload + POST /api/reports/[id]/retry-extract → promosi status
//     ke 'mapped' begitu auto-match sudah menghabiskan semua baris.
//   - POST /api/reports/[id]/mapping → transisi review→mapped setelah simpan.
//   - GET /api/reports/list → unmappedCount, yang jadi sumber badge sidebar.

export interface MappableLine {
  isSubtotal: boolean
  /** Status baris ('matched' | 'unmatched' | 'edited' | 'rejected'). */
  status: string
  masterCoaId: string | null
  rawName: string
  /** numeric dari DB datang sebagai string; number dari sisi klien. */
  amount: number | string
}

/**
 * Teks yang JELAS bukan nama akun, dicocokkan PERSIS (setelah trim +
 * lowercase). Sengaja hanya berisi yang benar-benar teramati di data —
 * "Tidak Ada Data" muncul di PDF Rasyuka dan dibaca Gemini dengan
 * confidence 99 (prompt ekstraksi memang menyuruh menyalin teks apa
 * adanya, jadi ini bukan kegagalan OCR).
 *
 * JANGAN diisi tebakan yang belum pernah terbukti muncul ("Nihil", "N/A",
 * "-", dst): entri spekulatif hanya menambah peluang menyembunyikan akun
 * yang sah. Tambahkan satu per satu saat kasus barunya benar-benar ketemu.
 *
 * JANGAN pula diganti heuristik (panjang nama, substring). Data dev punya
 * akun sah bernama "OVO" (3 huruf, Rp1.718.442) dan "Emas" (4 huruf,
 * Rp5.200.000) — heuristik panjang akan membuang keduanya.
 */
export const PLACEHOLDER_RAW_NAMES: readonly string[] = ['tidak ada data']

export function isPlaceholderName(rawName: string): boolean {
  return PLACEHOLDER_RAW_NAMES.includes(rawName.trim().toLowerCase())
}

/**
 * Baris tanpa informasi apa pun: namanya placeholder DAN nominalnya 0.
 *
 * DUA syarat sekaligus, dan itu disengaja. Placeholder bernominal ≠ 0 tetap
 * ditampilkan karena berarti ada ANGKA yang ikut masuk laporan tanpa nama
 * yang jelas — itu kegagalan ekstraksi yang berdampak ke hasil hitungan dan
 * justru harus terlihat, bukan disembunyikan. Sebaliknya, akun bernama jelas
 * dengan saldo 0 juga tetap tampil: saldo nol itu sah.
 */
export function isEmptyRow(line: MappableLine): boolean {
  return isPlaceholderName(line.rawName) && Number(line.amount) === 0
}

/** Baris yang memang WAJIB punya COA: bukan subtotal, tidak ditolak admin, dan
 *  bukan baris kosong tanpa informasi.
 *  Subtotal (LABA KOTOR, TOTAL AKTIVA, …) adalah hasil hitung, bukan akun;
 *  baris rejected sengaja dibuang saat Extraction Review; baris kosong (lihat
 *  isEmptyRow) tidak mewakili apa pun. Ketiganya tidak pernah bisa dipetakan —
 *  kalau ikut dihitung, sisa unmatched tidak pernah nol dan status laporan
 *  tidak pernah berpindah ke 'mapped'.
 *
 *  CATATAN: kriteria ini punya kembaran dalam bentuk SQL di
 *  GET /api/reports/list (kolom unmappedCount). Kalau aturan di sini berubah,
 *  SQL di sana WAJIB ikut diperbarui — lihat komentar di route tersebut. */
export function isMappable(line: MappableLine): boolean {
  return !line.isSubtotal && line.status !== 'rejected' && !isEmptyRow(line)
}

/** Wajib dipetakan TAPI belum punya COA. */
export function needsMapping(line: MappableLine): boolean {
  return isMappable(line) && line.masterCoaId === null
}

export function countUnmapped(lines: readonly MappableLine[]): number {
  let n = 0
  for (const l of lines) if (needsMapping(l)) n++
  return n
}

/** Semua baris yang wajib dipetakan sudah punya COA.
 *
 *  Sengaja `false` untuk laporan tanpa baris mappable sama sekali (ekstraksi
 *  kosong, atau isinya subtotal semua): tidak ada yang dipetakan bukan berarti
 *  selesai dipetakan — laporan seperti itu harus tetap masuk antrean review. */
export function isFullyMapped(lines: readonly MappableLine[]): boolean {
  return lines.some(isMappable) && countUnmapped(lines) === 0
}

/** Status laporan setelah ekstraksi + auto-match selesai. Auto-match yang
 *  menghabiskan seluruh baris berarti tidak ada lagi yang perlu dikerjakan
 *  admin di /coa-mapping — laporan langsung 'mapped', tanpa menunggu admin
 *  menekan Simpan pada form yang isinya kosong. */
export function statusAfterExtract(lines: readonly MappableLine[]): 'mapped' | 'review' {
  return isFullyMapped(lines) ? 'mapped' : 'review'
}

/** Badge sidebar COA Mapping: total akun belum dipetakan di SELURUH laporan
 *  klien aktif (semua periode), lepas dari status masing-masing laporan. */
export function sumUnmapped(reports: readonly { unmappedCount: number }[]): number {
  let n = 0
  for (const r of reports) n += r.unmappedCount
  return n
}
