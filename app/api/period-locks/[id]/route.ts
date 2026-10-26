import { NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import type { BatchItem } from 'drizzle-orm/batch'
import { db } from '@/lib/db'
import { periodLocks } from '@/lib/db/schema'
import { requireOwner } from '@/lib/api/guards'
import { canAccessClientData } from '@/lib/roles'
import { latestLock, validateUnlockReason } from '@/lib/period-lock'
import { loadPeriodLocks } from '@/lib/api/period-lock'
import { recordAuditEvent } from '@/lib/api/audit'
import { resolveUserId } from '@/lib/api/journal-queries'
import { dbWriteErrorResponse } from '@/lib/api/db-errors'

export const runtime = 'nodejs'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// DELETE /api/period-locks/[id] { alasan } — MEMBUKA kunci (D17: owner saja,
// alasan wajib ≥ 10 karakter).
//
// Hanya kunci TERBARU yang bisa dibuka: membuka = mundur ke kunci sebelumnya.
// Menghapus baris lama tidak mengubah apa pun yang berlaku, tapi riwayatnya
// akan mencatat "dibuka" untuk periode yang sebenarnya tetap terkunci.
// Barisnya hilang, jejaknya tidak: event `period_unlocked` membawa alasan dan
// tanggal yang dibuka, di batch yang sama dengan penghapusannya.
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await requireOwner()
  if ('error' in g) return g.error

  const { id } = await params
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'ID kunci tidak valid.' }, { status: 400 })

  const [row] = await db
    .select({ id: periodLocks.id, clientId: periodLocks.clientId, terkunciSampai: periodLocks.terkunciSampai })
    .from(periodLocks)
    .where(eq(periodLocks.id, id))
    .limit(1)
  if (!row) return NextResponse.json({ error: 'Kunci tidak ditemukan.' }, { status: 404 })
  if (!canAccessClientData(g.user.role, g.user.clientId, row.clientId)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Body harus JSON.' }, { status: 400 })
  }
  const alasan = validateUnlockReason(((body ?? {}) as Record<string, unknown>).alasan)
  if (!alasan.ok) return NextResponse.json({ error: alasan.error }, { status: 400 })

  const semua = await loadPeriodLocks(row.clientId)
  if (latestLock(semua)?.id !== row.id) {
    return NextResponse.json(
      { error: 'Hanya kunci terbaru yang bisa dibuka.', details: ['Buka kunci yang berlaku lebih dulu.'] },
      { status: 409 }
    )
  }
  const sesudah = latestLock(semua.filter(l => l.id !== row.id))

  const userId = await resolveUserId(g.user.email)
  const statements: BatchItem<'pg'>[] = [
    db.delete(periodLocks).where(eq(periodLocks.id, row.id)),
    recordAuditEvent({
      clientId: row.clientId,
      entityType: 'period_lock',
      entityId: row.id,
      event: 'period_unlocked',
      userId,
      catatan: alasan.value,
      nilaiSebelum: { terkunciSampai: row.terkunciSampai },
      nilaiSesudah: { terkunciSampai: sesudah?.terkunciSampai ?? null },
    }),
  ]
  try {
    await db.batch(statements as [BatchItem<'pg'>, ...BatchItem<'pg'>[]])
  } catch (e) {
    return dbWriteErrorResponse(e, 'Gagal membuka kunci periode. Coba lagi.')
  }
  return NextResponse.json({ ok: true, terkunciSampai: sesudah?.terkunciSampai ?? null })
}
