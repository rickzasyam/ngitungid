// Kebijakan rate limiting login. MURNI (tanpa I/O, tanpa DB) — sengaja dipisah
// dari lib/login-rate-limit-store.ts (yang menyentuh DB) supaya logika ambang,
// reset, dan kedaluwarsa window bisa diuji tanpa database, sama pola dengan
// lib/reports/retry-policy.ts.
//
// Model: satu "record" per email. Setiap login gagal memanggil registerFailure
// untuk menghitung state berikutnya; login berhasil menghapus record (reset).
// Selama masih dalam window dan hitungan gagal mencapai MAX, email dikunci
// sampai lockedUntil lewat.

// ── Parameter (satu tempat, gampang diubah) ───────────────────
/** Jumlah percobaan gagal dalam satu window sebelum email dikunci. */
export const MAX_FAILED_ATTEMPTS = 5
/** Lebar window penghitungan percobaan gagal. Gagal yang terpisah lebih lama
 *  dari ini tidak diakumulasi — hitungan mulai dari nol lagi. */
export const ATTEMPT_WINDOW_MS = 15 * 60_000
/** Lama email terkunci setelah ambang tercapai. */
export const LOCKOUT_MS = 15 * 60_000

// Bentuk record sengaja longgar (Date | string | null) supaya bisa langsung
// diberi baris hasil query DB (timestamp bisa datang sebagai Date) maupun
// payload JSON (string ISO), tanpa konversi di pemanggil.
export interface AttemptRecord {
  failedCount: number
  windowStart: Date | string | null
  lockedUntil: Date | string | null
}

/** State baru yang harus dipersist setelah satu percobaan gagal. */
export interface NextAttempt {
  failedCount: number
  windowStart: Date
  lockedUntil: Date | null
}

const toMs = (v: Date | string | null | undefined): number | null =>
  v == null ? null : (typeof v === 'string' ? new Date(v) : v).getTime()

/**
 * Apakah login untuk email ini sedang terkunci pada waktu `now`?
 * True hanya jika lockedUntil ada DAN masih di masa depan. Record null (belum
 * pernah gagal) → tidak terkunci.
 */
export function isLocked(record: AttemptRecord | null | undefined, now: Date = new Date()): boolean {
  const until = toMs(record?.lockedUntil ?? null)
  return until !== null && until > now.getTime()
}

/** Sisa milidetik sampai kunci lepas (0 kalau tidak terkunci). Untuk log/pesan. */
export function lockRemainingMs(record: AttemptRecord | null | undefined, now: Date = new Date()): number {
  const until = toMs(record?.lockedUntil ?? null)
  if (until === null) return 0
  return Math.max(0, until - now.getTime())
}

/**
 * Hitung state berikutnya setelah SATU percobaan gagal.
 *
 * Window baru dimulai (hitungan reset ke 1) bila salah satu benar:
 *   - belum ada record / belum ada windowStart,
 *   - window sebelumnya sudah kedaluwarsa (> ATTEMPT_WINDOW_MS lalu),
 *   - siklus lock sebelumnya sudah selesai (lockedUntil sudah lewat).
 * Selain itu hitungan bertambah dalam window yang sama. Begitu mencapai
 * MAX_FAILED_ATTEMPTS, lockedUntil diset now + LOCKOUT_MS.
 */
export function registerFailure(record: AttemptRecord | null | undefined, now: Date = new Date()): NextAttempt {
  const nowMs = now.getTime()
  const windowStartMs = toMs(record?.windowStart ?? null)
  const lockedUntilMs = toMs(record?.lockedUntil ?? null)

  const windowExpired = windowStartMs === null || nowMs - windowStartMs > ATTEMPT_WINDOW_MS
  const lockCycleOver = lockedUntilMs !== null && lockedUntilMs <= nowMs
  const startNewWindow = record == null || windowExpired || lockCycleOver

  const failedCount = startNewWindow ? 1 : (record!.failedCount ?? 0) + 1
  const windowStart = startNewWindow ? now : new Date(windowStartMs as number)
  const lockedUntil = failedCount >= MAX_FAILED_ATTEMPTS ? new Date(nowMs + LOCKOUT_MS) : null

  return { failedCount, windowStart, lockedUntil }
}
