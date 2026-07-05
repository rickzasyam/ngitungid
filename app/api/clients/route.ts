import { NextResponse } from 'next/server'
import { asc, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { clients } from '@/lib/db/schema'
import { requireAdmin, requireUser } from '@/lib/api/guards'

const clientColumns = { id: clients.id, name: clients.name, type: clients.type }

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

// POST /api/clients — admin only. Body { name, type }.
export async function POST(req: Request) {
  const g = await requireAdmin()
  if ('error' in g) return g.error

  const body = (await req.json().catch(() => null)) as { name?: unknown; type?: unknown } | null
  const name = typeof body?.name === 'string' ? body.name.trim() : ''
  const type = typeof body?.type === 'string' ? body.type.trim() : ''

  if (!name || !type) {
    return NextResponse.json({ error: 'Nama dan jenis klien wajib diisi.' }, { status: 400 })
  }

  const [created] = await db.insert(clients).values({ name, type }).returning(clientColumns)
  return NextResponse.json(created, { status: 201 })
}
