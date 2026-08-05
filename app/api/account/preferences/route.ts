import { NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { users } from '@/lib/db/schema'
import { requireUser } from '@/lib/api/guards'
import { dbWriteErrorResponse } from '@/lib/api/db-errors'
import { validatePreferences, normalizePreferences, DEFAULT_PREFERENCES } from '@/lib/api/preferences'

export const runtime = 'nodejs'

// Preferensi tampilan AKUN SENDIRI. Semua role boleh (owner/akunting/user).
//
// KEAMANAN — pola yang sama dengan POST /api/account/password: baris yang dibaca
// dan ditulis ditentukan HANYA oleh email di sesi. Tidak ada parameter path,
// tidak ada userId di body, dan body cuma dibaca untuk dua field preferensi.
// Menyasar akun lain bukan sesuatu yang "dicek dan ditolak" — memang tidak ada
// permukaannya.

// GET /api/account/preferences
export async function GET() {
  const g = await requireUser()
  if ('error' in g) return g.error

  const email = g.user.email
  if (!email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const [row] = await db
    .select({ language: users.language, currencyFormat: users.currencyFormat })
    .from(users)
    .where(eq(users.email, email))
    .limit(1)

  // Sesi valid tapi baris user hilang → jangan 500; kembalikan default supaya UI
  // tetap bisa dirender (nilainya read-only sampai user login ulang).
  return NextResponse.json({ preferences: row ? normalizePreferences(row) : DEFAULT_PREFERENCES })
}

// PUT /api/account/preferences — mengganti SELURUH preferensi sekaligus.
export async function PUT(req: Request) {
  const g = await requireUser()
  if ('error' in g) return g.error

  const email = g.user.email
  if (!email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { language?: unknown; currencyFormat?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Body harus JSON.' }, { status: 400 })
  }

  const check = validatePreferences({ language: body.language, currencyFormat: body.currencyFormat })
  if (!check.ok) return NextResponse.json({ error: check.error }, { status: 400 })

  try {
    const updated = await db
      .update(users)
      .set({ ...check.preferences, updatedAt: new Date() })
      .where(eq(users.email, email))
      .returning({ language: users.language, currencyFormat: users.currencyFormat })

    if (updated.length === 0) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    return NextResponse.json({ preferences: normalizePreferences(updated[0]) })
  } catch (e) {
    return dbWriteErrorResponse(e, 'Gagal menyimpan preferensi. Coba lagi.')
  }
}
