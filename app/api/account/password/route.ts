import { NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import bcrypt from 'bcryptjs'
import { db } from '@/lib/db'
import { users } from '@/lib/db/schema'
import { requireUser } from '@/lib/api/guards'
import { dbWriteErrorResponse } from '@/lib/api/db-errors'
import { validatePasswordChange } from '@/lib/api/password-change'
import { isLoginLocked, recordFailedLogin, clearLoginAttempts } from '@/lib/login-rate-limit-store'

export const runtime = 'nodejs'

// Cost 12 — SAMA dengan POST /api/users dan lib/db/seed.ts. Kalau berubah, harus
// berubah di ketiganya bersamaan.
const BCRYPT_COST = 12

const bad = (msg: string) => NextResponse.json({ error: msg }, { status: 400 })

// IP best-effort untuk log rate limit (informatif saja, bukan kunci lockout).
function clientIp(req: Request): string | null {
  const xff = req.headers.get('x-forwarded-for')
  if (xff) return xff.split(',')[0]!.trim()
  return req.headers.get('x-real-ip')
}

// POST /api/account/password — ganti password AKUN SENDIRI. Semua role boleh
// (owner/akunting/user): tiap orang harus bisa mengamankan akunnya sendiri.
//
// KEAMANAN — kenapa tidak ada id di mana pun:
// Akun yang diubah ditentukan HANYA oleh email di dalam sesi. Tidak ada
// parameter path, tidak ada `userId` di body, dan body hanya dibaca untuk dua
// field password. Jadi tidak ada permukaan yang bisa dimanipulasi untuk
// menyasar akun lain — bukan karena dicek, tapi karena target-nya memang tidak
// pernah datang dari input. Mengganti password orang lain (Owner → staf) SENGAJA
// bukan bagian dari endpoint ini.
//
// Password lama TETAP diverifikasi walau sesi sudah valid: sesi membuktikan
// "pernah login", bukan "sedang dipegang pemiliknya". Tanpa cek ini, laptop yang
// ditinggal terbuka = pengambilalihan akun permanen.
export async function POST(req: Request) {
  const g = await requireUser()
  if ('error' in g) return g.error

  const email = g.user.email
  if (!email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Rate limit: PAKAI BERSAMA mesin login (tabel login_attempts, kunci = email).
  // Menebak password lama berulang kali adalah vektor yang sama dengan menebak
  // password login, jadi counter-nya sengaja SATU. Kalau endpoint ini punya
  // counter sendiri, ia justru jadi oracle: penyerang bisa menguji password
  // tanpa pernah menyentuh lockout login.
  if (await isLoginLocked(email)) {
    return NextResponse.json(
      { error: 'Terlalu banyak percobaan gagal. Coba lagi dalam beberapa menit.' },
      { status: 429 }
    )
  }

  let body: { currentPassword?: unknown; newPassword?: unknown }
  try {
    body = await req.json()
  } catch {
    return bad('Body harus JSON.')
  }

  const check = validatePasswordChange({
    currentPassword: body.currentPassword,
    newPassword: body.newPassword,
  })
  if (!check.ok) return bad(check.error)

  const [user] = await db
    .select({ id: users.id, passwordHash: users.passwordHash })
    .from(users)
    .where(eq(users.email, email))
    .limit(1)

  // Sesi valid tapi baris user hilang (akun dihapus saat sesi masih hidup).
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const matches = await bcrypt.compare(check.currentPassword, user.passwordHash)
  if (!matches) {
    await recordFailedLogin(email, clientIp(req))
    // Satu-satunya hal yang boleh dibocorkan pesan error.
    return bad('Password lama salah.')
  }

  const passwordHash = await bcrypt.hash(check.newPassword, BCRYPT_COST)

  try {
    await db
      .update(users)
      .set({ passwordHash, updatedAt: new Date() })
      .where(eq(users.id, user.id))
  } catch (e) {
    return dbWriteErrorResponse(e, 'Gagal mengubah password. Coba lagi.')
  }

  // Sama seperti login sukses: bukti kepemilikan → counter direset.
  await clearLoginAttempts(email)

  // Hash tidak pernah ikut di response.
  return NextResponse.json({ ok: true })
}
