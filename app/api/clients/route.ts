import { NextResponse } from 'next/server'
import { asc, eq, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { clients } from '@/lib/db/schema'
import { requireAkunting, requireUser } from '@/lib/api/guards'

// hasLogo (bukan bytea-nya) supaya UI tahu harus render <img> atau inisial tanpa
// menarik logonya untuk tiap klien. updatedAt dipakai sebagai cache-buster
// (?v=) pada URL logo — tanpa itu logo lama nyangkut di cache setelah diganti.
const clientColumns = {
  id: clients.id,
  name: clients.name,
  type: clients.type,
  hasLogo: sql<boolean>`${clients.logo} is not null`,
  updatedAt: clients.updatedAt,
}

// GET /api/clients
// Admin → semua klien (urut nama). User → hanya klien miliknya sendiri.
// Satu endpoint ini yang memberi makan client-context untuk kedua role.
export async function GET() {
  const g = await requireUser()
  if ('error' in g) return g.error

  if (g.user.role === 'user') {
    if (!g.user.clientId) return NextResponse.json([])
    const rows = await db
      .select(clientColumns)
      .from(clients)
      .where(eq(clients.id, g.user.clientId))
      .limit(1)
    return NextResponse.json(rows)
  }

  const rows = await db.select(clientColumns).from(clients).orderBy(asc(clients.name))
  return NextResponse.json(rows)
}

// POST /api/clients — akunting/owner. Body { name, type }.
export async function POST(req: Request) {
  const g = await requireAkunting()
  if ('error' in g) return g.error

  const body = (await req.json().catch(() => null)) as { name?: unknown; type?: unknown } | null
  const name = typeof body?.name === 'string' ? body.name.trim() : ''
  const type = typeof body?.type === 'string' ? body.type.trim() : ''

  if (!name || !type) {
    return NextResponse.json({ error: 'Nama dan jenis klien wajib diisi.' }, { status: 400 })
  }

  // returning() dengan kolom biasa; hasLogo klien baru selalu false (belum ada
  // logo) → ditambahkan manual supaya bentuknya sama dengan GET (ClientInfo).
  const [created] = await db
    .insert(clients)
    .values({ name, type })
    .returning({ id: clients.id, name: clients.name, type: clients.type, updatedAt: clients.updatedAt })
  return NextResponse.json({ ...created, hasLogo: false }, { status: 201 })
}
