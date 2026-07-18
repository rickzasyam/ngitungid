import { NextResponse } from 'next/server'
import { asc, eq } from 'drizzle-orm'
import bcrypt from 'bcryptjs'
import { db } from '@/lib/db'
import { users, clients } from '@/lib/db/schema'
import { requireOwner } from '@/lib/api/guards'
import { dbWriteErrorResponse, isUniqueViolation } from '@/lib/api/db-errors'
import { CREATABLE_ROLES, type Role } from '@/lib/roles'
import { resolveNewAccountClientId } from '@/lib/api/account'

export const runtime = 'nodejs'

// Cost 12 — SAMA dengan lib/db/seed.ts. Sengaja tidak bikin jalur hashing baru
// yang standarnya beda; kalau berubah, harus berubah di dua tempat itu bersamaan.
const BCRYPT_COST = 12

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const MIN_PASSWORD = 8

const bad = (msg: string) => NextResponse.json({ error: msg }, { status: 400 })

// GET /api/users — OWNER ONLY. Daftar akun tim (tanpa password hash).
export async function GET() {
  const g = await requireOwner()
  if ('error' in g) return g.error

  const rows = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      role: users.role,
      clientId: users.clientId,
      createdAt: users.createdAt,
    })
    .from(users)
    .orderBy(asc(users.createdAt))

  return NextResponse.json({ users: rows })
}

// POST /api/users — OWNER ONLY. Buat akun baru: staf (akunting/owner) ATAU
// klien (user). Sengaja TIDAK ada halaman register publik: ini internal tool,
// semua akun di-provisioning oleh Owner. Akun 'user' WAJIB terikat satu klien
// (clientId tervalidasi); akun staf DIPAKSA clientId null.
export async function POST(req: Request) {
  const g = await requireOwner()
  if ('error' in g) return g.error

  let body: { name?: unknown; email?: unknown; password?: unknown; role?: unknown; clientId?: unknown }
  try {
    body = await req.json()
  } catch {
    return bad('Body harus JSON.')
  }

  const name = typeof body.name === 'string' ? body.name.trim() : ''
  // Email disimpan lowercase: login mencocokkan persis (eq), jadi tanpa ini
  // "Budi@x.com" dan "budi@x.com" jadi dua akun berbeda yang membingungkan.
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
  const password = typeof body.password === 'string' ? body.password : ''
  const role = body.role as Role

  if (name.length < 2) return bad('Nama minimal 2 karakter.')
  if (!EMAIL_RE.test(email)) return bad('Format email tidak valid.')
  if (password.length < MIN_PASSWORD) return bad(`Password minimal ${MIN_PASSWORD} karakter.`)
  if (!CREATABLE_ROLES.includes(role)) {
    return bad(`Role harus salah satu dari: ${CREATABLE_ROLES.join(', ')}.`)
  }

  // clientId ASIMETRIS: WAJIB & tervalidasi-exist untuk 'user', DIPAKSA null
  // untuk staf (body.clientId diabaikan). Cek exist di DB, bukan percaya id
  // dari client. Lihat lib/api/account.ts.
  const resolution = await resolveNewAccountClientId(role, body.clientId, async id => {
    const [c] = await db.select({ id: clients.id }).from(clients).where(eq(clients.id, id)).limit(1)
    return !!c
  })
  if (!resolution.ok) return bad(resolution.error)
  const clientId = resolution.clientId

  const passwordHash = await bcrypt.hash(password, BCRYPT_COST)

  try {
    const [created] = await db
      .insert(users)
      .values({ email, passwordHash, name, role, clientId })
      .returning({
        id: users.id,
        email: users.email,
        name: users.name,
        role: users.role,
        clientId: users.clientId,
        createdAt: users.createdAt,
      })
    // Hash TIDAK pernah ikut di response.
    return NextResponse.json({ user: created }, { status: 201 })
  } catch (e) {
    if (isUniqueViolation(e)) {
      return NextResponse.json({ error: `Email "${email}" sudah dipakai akun lain.` }, { status: 409 })
    }
    return dbWriteErrorResponse(e, 'Gagal membuat akun. Coba lagi.')
  }
}
