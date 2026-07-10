import { NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import type { BatchItem } from 'drizzle-orm/batch'
import { db } from '@/lib/db'
import { clients, clientMetricVisibility } from '@/lib/db/schema'
import { requireAdmin, requireUser } from '@/lib/api/guards'

export const runtime = 'nodejs'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const METRIC_ID_RE = /^[a-z0-9_-]{1,40}$/
const MAX_METRICS = 100

// GET /api/clients/[id]/metrics
// Hanya mengembalikan baris yang memang tersimpan. Daftar metrik + nilai
// default-nya tetap milik frontend (METRIC_CATEGORIES di app/settings/page.tsx)
// — backend sengaja tidak tahu metrik apa saja yang ada.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await requireUser()
  if ('error' in g) return g.error

  const { id } = await params
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: 'ID klien tidak valid.' }, { status: 400 })
  }
  if (g.user.role === 'user' && g.user.clientId !== id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const rows = await db
    .select({ metricId: clientMetricVisibility.metricId, isVisible: clientMetricVisibility.isVisible })
    .from(clientMetricVisibility)
    .where(eq(clientMetricVisibility.clientId, id))

  return NextResponse.json({
    visibility: Object.fromEntries(rows.map(r => [r.metricId, r.isVisible])),
  })
}

// PUT /api/clients/[id]/metrics — admin only.
// Body: { visibility: { [metricId]: boolean } }
// Upsert seluruh map sekaligus (last-write-wins), jadi aman dipanggil berkali-
// kali dari toggle yang cepat berturut-turut.
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await requireAdmin()
  if ('error' in g) return g.error

  const { id } = await params
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: 'ID klien tidak valid.' }, { status: 400 })
  }

  let body: { visibility?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Body harus JSON.' }, { status: 400 })
  }

  const vis = body.visibility
  if (typeof vis !== 'object' || vis === null || Array.isArray(vis)) {
    return NextResponse.json({ error: 'Field "visibility" harus object.' }, { status: 400 })
  }

  const entries = Object.entries(vis as Record<string, unknown>)
  if (entries.length === 0) {
    return NextResponse.json({ error: '"visibility" tidak boleh kosong.' }, { status: 400 })
  }
  if (entries.length > MAX_METRICS) {
    return NextResponse.json({ error: `Maksimum ${MAX_METRICS} metrik per request.` }, { status: 400 })
  }
  for (const [metricId, isVisible] of entries) {
    if (!METRIC_ID_RE.test(metricId)) {
      return NextResponse.json({ error: `metricId tidak valid: ${metricId}` }, { status: 400 })
    }
    if (typeof isVisible !== 'boolean') {
      return NextResponse.json({ error: `Nilai "${metricId}" harus boolean.` }, { status: 400 })
    }
  }

  const [client] = await db.select({ id: clients.id }).from(clients).where(eq(clients.id, id)).limit(1)
  if (!client) {
    return NextResponse.json({ error: 'Klien tidak ditemukan.' }, { status: 404 })
  }

  const now = new Date()
  const statements: BatchItem<'pg'>[] = entries.map(([metricId, isVisible]) =>
    db
      .insert(clientMetricVisibility)
      .values({ clientId: id, metricId, isVisible: isVisible as boolean, updatedAt: now })
      .onConflictDoUpdate({
        target: [clientMetricVisibility.clientId, clientMetricVisibility.metricId],
        set: { isVisible: isVisible as boolean, updatedAt: now },
      })
  )

  // neon-http: db.batch() = satu Neon HTTP transaction (atomik).
  await db.batch(statements as [BatchItem<'pg'>, ...BatchItem<'pg'>[]])

  return NextResponse.json({ clientId: id, saved: entries.length })
}
