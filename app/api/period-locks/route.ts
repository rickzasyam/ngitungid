import { NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { desc, eq } from 'drizzle-orm'
import type { BatchItem } from 'drizzle-orm/batch'
import { db } from '@/lib/db'
import { clients, periodLocks, users } from '@/lib/db/schema'
import { requireAkunting, requireInternal } from '@/lib/api/guards'
import { canAccessClientData } from '@/lib/roles'
import { latestLock, validateLockInput } from '@/lib/period-lock'
import { loadPeriodLocks } from '@/lib/api/period-lock'
import { recordAuditEvent } from '@/lib/api/audit'
import { resolveUserId } from '@/lib/api/journal-queries'
import { dbWriteErrorResponse } from '@/lib/api/db-errors'
import { todayYmd } from '@/lib/ymd'

export const runtime = 'nodejs'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// GET /api/period-locks?clientId — status kunci + riwayat barisnya.
//
// Baca = requireInternal: finance ikut melihat sampai kapan buku klien sudah
// ditutup, sama seperti ia melihat /hutang (D45). Status "terkunci sampai"
// DITURUNKAN dari baris terbesar (P3), tidak disimpan.
export async function GET(req: Request) {
  const g = await requireInternal()
  if ('error' in g) return g.error

  const clientId = new URL(req.url).searchParams.get('clientId') ?? ''
  if (!UUID_RE.test(clientId)) {
    return NextResponse.json({ error: 'clientId tidak valid.' }, { status: 400 })
  }
  if (!canAccessClientData(g.user.role, g.user.clientId, clientId)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const kunci = await db
    .select({
      id: periodLocks.id,
      terkunciSampai: periodLocks.terkunciSampai,
      dikunciOleh: users.name,
      createdAt: periodLocks.createdAt,
    })
    .from(periodLocks)
    .innerJoin(users, eq(users.id, periodLocks.dikunciOleh))
    .where(eq(periodLocks.clientId, clientId))
    .orderBy(desc(periodLocks.terkunciSampai), desc(periodLocks.createdAt))

  return NextResponse.json({ terkunciSampai: latestLock(kunci)?.terkunciSampai ?? null, kunci })
}

// POST /api/period-locks { clientId, terkunciSampai } — MENGUNCI (D17: akunting/owner).
//
// Kunci baru harus MAJU dari yang berlaku dan tidak melewati hari ini
// (validateLockInput). Baris kunci dan riwayatnya ditulis di SATU batch: kunci
// tanpa jejak siapa yang mengunci adalah kunci yang tidak bisa dipertanggungjawabkan.
export async function POST(req: Request) {
  const g = await requireAkunting()
  if ('error' in g) return g.error

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Body harus JSON.' }, { status: 400 })
  }
  const raw = (body ?? {}) as Record<string, unknown>

  const clientId = typeof raw.clientId === 'string' ? raw.clientId : ''
  if (!UUID_RE.test(clientId)) {
    return NextResponse.json({ error: 'clientId tidak valid.' }, { status: 400 })
  }
  if (!canAccessClientData(g.user.role, g.user.clientId, clientId)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const [client] = await db.select({ id: clients.id }).from(clients).where(eq(clients.id, clientId)).limit(1)
  if (!client) return NextResponse.json({ error: 'Klien tidak ditemukan.' }, { status: 404 })

  const latest = latestLock(await loadPeriodLocks(clientId))
  const check = validateLockInput({ terkunciSampai: raw.terkunciSampai }, { latest, hariIni: todayYmd() })
  if (!check.ok) return NextResponse.json({ error: check.error }, { status: 400 })

  const userId = await resolveUserId(g.user.email)
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const id = randomUUID()
  const statements: BatchItem<'pg'>[] = [
    db.insert(periodLocks).values({ id, clientId, terkunciSampai: check.value.terkunciSampai, dikunciOleh: userId }),
    recordAuditEvent({
      clientId,
      entityType: 'period_lock',
      entityId: id,
      event: 'period_locked',
      userId,
      nilaiSebelum: { terkunciSampai: latest?.terkunciSampai ?? null },
      nilaiSesudah: { terkunciSampai: check.value.terkunciSampai },
    }),
  ]
  try {
    await db.batch(statements as [BatchItem<'pg'>, ...BatchItem<'pg'>[]])
  } catch (e) {
    return dbWriteErrorResponse(e, 'Gagal mengunci periode. Coba lagi.')
  }
  return NextResponse.json({ id, terkunciSampai: check.value.terkunciSampai }, { status: 201 })
}
