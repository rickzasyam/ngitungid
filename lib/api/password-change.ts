// Aturan validasi ganti password SENDIRI. MURNI (tanpa I/O, tanpa DB, tanpa
// bcrypt) supaya bisa diuji tanpa database — pola sama dengan
// lib/login-rate-limit.ts dan lib/reports/retry-policy.ts. Verifikasi password
// lama (bcrypt) dan penulisan hash ada di route handler, bukan di sini.

/** Panjang minimum password. SATU sumber untuk seluruh app: dipakai oleh
 *  pembuatan akun (POST /api/users) DAN ganti password, supaya aturan tidak
 *  menyimpang di antara keduanya. */
export const MIN_PASSWORD = 8

export interface PasswordChangeInput {
  currentPassword: unknown
  newPassword: unknown
}

export type PasswordChangeCheck =
  | { ok: true; currentPassword: string; newPassword: string }
  | { ok: false; error: string }

/**
 * Validasi bentuk & aturan password baru.
 *
 * Soal trim — SENGAJA asimetris, dan ini bukan kelalaian:
 *   - `currentPassword` TIDAK di-trim. Ia harus dibandingkan persis dengan apa
 *     yang dulu di-hash; kalau di-trim, akun yang password-nya memang berspasi
 *     di ujung akan terkunci selamanya dari fitur ganti password.
 *   - `newPassword` DI-trim, lalu hasil trim itulah yang di-hash. Spasi di ujung
 *     password baru hampir selalu salah ketik/tempel, dan menyimpannya membuat
 *     login berikutnya gagal dengan cara yang mustahil didiagnosis pengguna.
 *
 * Panjang minimum dihitung SETELAH trim, supaya "       a" tidak lolos.
 */
export function validatePasswordChange(input: PasswordChangeInput): PasswordChangeCheck {
  const { currentPassword, newPassword } = input

  if (typeof currentPassword !== 'string' || typeof newPassword !== 'string') {
    return { ok: false, error: 'Password lama dan password baru wajib diisi.' }
  }
  if (currentPassword.length === 0) {
    return { ok: false, error: 'Password lama wajib diisi.' }
  }

  const next = newPassword.trim()
  if (next.length === 0) {
    return { ok: false, error: 'Password baru wajib diisi.' }
  }
  if (next.length < MIN_PASSWORD) {
    return { ok: false, error: `Password baru minimal ${MIN_PASSWORD} karakter.` }
  }
  // Dibandingkan terhadap currentPassword MENTAH: "abc12345" vs " abc12345 "
  // adalah password yang sama setelah trim, jadi tetap ditolak.
  if (next === currentPassword) {
    return { ok: false, error: 'Password baru harus berbeda dari password lama.' }
  }

  return { ok: true, currentPassword, newPassword: next }
}
