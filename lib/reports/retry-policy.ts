// Kebijakan "laporan ini boleh di-retry ekstraksinya atau tidak". Murni (tanpa
// I/O) supaya dipakai bareng oleh route retry (sebagai guard) dan route list
// (menentukan tombol muncul atau tidak) — satu sumber kebenaran, dan bisa diuji.
//
// KENAPA butuh ambang waktu:
// POST /api/upload memasang status 'extracting' SEBELUM memanggil Gemini, dan
// mengembalikannya ke 'uploaded' di blok catch kalau ekstraksi gagal. Jadi
// kegagalan yang "sopan" sudah sembuh sendiri. Yang bikin laporan nyangkut
// SELAMANYA adalah ketika function-nya sendiri MATI di tengah jalan (melewati
// maxDuration 60s, proses dibunuh, deploy terputus) — catch-nya tidak pernah
// jalan. Karena satu invocation mustahil hidup lebih dari maxDuration, laporan
// yang masih 'extracting' jauh setelah itu pasti yatim, bukan "masih diproses".

/** 3 menit = 3× maxDuration route upload (60s). Lega, tapi tetap jauh di bawah
 *  durasi yang bikin admin merasa "ini nyangkut". */
export const STALE_EXTRACTING_MS = 3 * 60_000

export type RetryState =
  /** Aman di-retry sekarang. */
  | 'retriable'
  /** Baru mulai — masih wajar diproses, biarkan selesai. */
  | 'in-progress'
  /** PDF sumber tidak tersimpan → tidak ada bahan untuk ekstraksi ulang. */
  | 'no-pdf'
  /** Sudah terekstrak — retry justru akan membuang hasil kerja. */
  | 'not-applicable'

export interface RetryInput {
  status: string
  /** Kapan percobaan ekstraksi SEKARANG dimulai. `updatedAt` dipakai karena
   *  upload mengisinya saat insert (status langsung 'extracting') dan route
   *  retry menyetelnya ulang saat mengklaim percobaan baru. */
  updatedAt: Date | string
  hasPdf: boolean
  /** Disuntik di test; default waktu sekarang. */
  now?: Date
}

export function retryState({ status, updatedAt, hasPdf, now }: RetryInput): RetryState {
  // Dicek DULUAN: laporan yang sudah punya hasil ekstraksi tidak boleh di-retry
  // walau PDF-nya hilang — retry akan menghapus line item (dan mapping yang
  // mungkin sudah dikerjakan admin). Untuk kasus itu jalurnya "Ganti file".
  if (status === 'review' || status === 'mapped' || status === 'confirmed') {
    return 'not-applicable'
  }
  if (!hasPdf) return 'no-pdf'
  if (status === 'uploaded') return 'retriable'
  if (status === 'extracting') {
    const started = typeof updatedAt === 'string' ? new Date(updatedAt) : updatedAt
    const ref = now ?? new Date()
    return ref.getTime() - started.getTime() > STALE_EXTRACTING_MS ? 'retriable' : 'in-progress'
  }
  return 'not-applicable'
}
