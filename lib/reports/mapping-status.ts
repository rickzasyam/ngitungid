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
}

/** Baris yang memang WAJIB punya COA: bukan subtotal, dan tidak ditolak admin.
 *  Subtotal (LABA KOTOR, TOTAL AKTIVA, …) adalah hasil hitung, bukan akun;
 *  baris rejected sengaja dibuang saat Extraction Review. Keduanya tidak pernah
 *  bisa dipetakan — kalau ikut dihitung, sisa unmatched tidak pernah nol dan
 *  status laporan tidak pernah berpindah ke 'mapped'. */
export function isMappable(line: MappableLine): boolean {
  return !line.isSubtotal && line.status !== 'rejected'
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
