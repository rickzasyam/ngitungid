// Lapisan DB untuk rate limiting login. Menyimpan/membaca baris login_attempts
// dan mendelegasikan SEMUA keputusan ke lib/login-rate-limit.ts (murni). Dipakai
// oleh authorize() di lib/auth.ts.
//
// Catatan serverless: baca-lalu-upsert punya window balapan kecil kalau dua
// request gagal untuk email yang sama tiba bersamaan. Untuk tool internal dengan
// segelintir akun ini tidak signifikan — efek terburuknya satu percobaan luput
// dihitung, bukan bypass lockout. Tidak perlu lock baris/transaksi.

import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { loginAttempts } from '@/lib/db/schema'
import { isLocked, registerFailure, lockRemainingMs } from './login-rate-limit'

/** Email dinormalisasi supaya "A@x.com" dan "a@x.com " dihitung sebagai satu
 *  akun (sama seperti pencocokan user di authorize yang case-sensitive lewat DB
 *  — normalisasi di sini menjaga counter tetap konsisten per akun). */
const normalizeEmail = (email: string) => email.trim().toLowerCase()

// Log detail asli hanya ke server + Sentry (UI selalu dapat pesan generik).
// Sentry di-import DINAMIS supaya tidak ikut ter-bundle ke proxy.ts (Edge
// runtime) yang meng-import lib/auth.ts — console.warn selalu jalan sebagai
// baseline, Sentry best-effort.
async function logSecurityEvent(message: string, level: 'warning' | 'info') {
  console.warn(`[login-rate-limit] ${message}`)
  try {
    const Sentry = await import('@sentry/nextjs')
    Sentry.captureMessage(message, level)
  } catch {
    // Sentry tidak tersedia (mis. saat test/script) — cukup console.
  }
}

/** Apakah email ini sedang terkunci? Dipanggil SEBELUM cek password. */
export async function isLoginLocked(email: string, now: Date = new Date()): Promise<boolean> {
  const key = normalizeEmail(email)
  const [row] = await db
    .select()
    .from(loginAttempts)
    .where(eq(loginAttempts.email, key))
    .limit(1)

  const locked = isLocked(row ?? null, now)
  if (locked) {
    const mins = Math.ceil(lockRemainingMs(row ?? null, now) / 60_000)
    await logSecurityEvent(`Login ditolak (terkunci) untuk ${key} — sisa ~${mins} menit`, 'info')
  }
  return locked
}

/** Catat satu percobaan gagal (email tidak ditemukan ATAU password salah). */
export async function recordFailedLogin(
  email: string,
  ip: string | null,
  now: Date = new Date()
): Promise<void> {
  const key = normalizeEmail(email)
  const [row] = await db
    .select()
    .from(loginAttempts)
    .where(eq(loginAttempts.email, key))
    .limit(1)

  const next = registerFailure(row ?? null, now)

  await db
    .insert(loginAttempts)
    .values({
      email: key,
      failedCount: next.failedCount,
      windowStart: next.windowStart,
      lockedUntil: next.lockedUntil,
      lastIp: ip,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: loginAttempts.email,
      set: {
        failedCount: next.failedCount,
        windowStart: next.windowStart,
        lockedUntil: next.lockedUntil,
        lastIp: ip,
        updatedAt: now,
      },
    })

  if (next.lockedUntil) {
    await logSecurityEvent(
      `Email ${key} dikunci sampai ${next.lockedUntil.toISOString()} setelah ${next.failedCount} percobaan gagal (ip=${ip ?? 'unknown'})`,
      'warning'
    )
  }
}

/** Reset penuh: hapus baris counter. Dipanggil saat login berhasil. */
export async function clearLoginAttempts(email: string): Promise<void> {
  const key = normalizeEmail(email)
  await db.delete(loginAttempts).where(eq(loginAttempts.email, key))
}
