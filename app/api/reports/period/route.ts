import { NextResponse } from 'next/server'
import { and, eq } from 'drizzle-orm'
import type { BatchItem } from 'drizzle-orm/batch'
import { db } from '@/lib/db'
import { financialReports } from '@/lib/db/schema'
import { requireAkunting } from '@/lib/api/guards'
import { dbWriteErrorResponse, isUniqueViolation } from '@/lib/api/db-errors'

export const runtime = 'nodejs'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const YMD_RE = /^\d{4}-\d{2}-\d{2}$/

const TYPE_LABEL: Record<string, string> = { laba_rugi: 'Laba Rugi', neraca: 'Neraca', arus_kas: 'Arus Kas' }

// PATCH /api/reports/period — admin only. Body JSON:
//   { clientId, periodStart, periodEnd, newPeriodStart, newPeriodEnd }
// Pindahkan SEMUA laporan satu sesi (klien + periode) ke periode baru,
// ATOMIK (db.batch) — sengaja level sesi, bukan per laporan: kasus nyatanya
// "salah pilih periode saat upload" (mis. PDF Maret ter-upload sebagai
// Januari), dan pindah per laporan bisa memecah sesi kalau sebagian gagal.
// Konflik unique(client, type, period) dicek dulu → 409 jelas, bukan 500.
export async function PATCH(req: Request) {
  const g = await requireAkunting()
  if ('error' in g) return g.error

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Body harus JSON.' }, { status: 400 })
  }

  const clientId = String(body.clientId ?? '')
  const periodStart = String(body.periodStart ?? '')
  const periodEnd = String(body.periodEnd ?? '')
  const newPeriodStart = String(body.newPeriodStart ?? '')
  const newPeriodEnd = String(body.newPeriodEnd ?? '')

  if (!UUID_RE.test(clientId)) {
    return NextResponse.json({ error: 'clientId tidak valid.' }, { status: 400 })
  }
  if (![periodStart, periodEnd, newPeriodStart, newPeriodEnd].every(v => YMD_RE.test(v))) {
    return NextResponse.json({ error: 'Periode tidak valid (YYYY-MM-DD).' }, { status: 400 })
  }
  if (newPeriodStart > newPeriodEnd) {
    return NextResponse.json({ error: 'Periode baru terbalik (mulai > selesai).' }, { status: 400 })
  }
  if (periodStart === newPeriodStart && periodEnd === newPeriodEnd) {
    return NextResponse.json({ error: 'Periode baru sama dengan periode lama.' }, { status: 400 })
  }

  const moving = await db
    .select({ id: financialReports.id, reportType: financialReports.reportType })
    .from(financialReports)
    .where(
      and(
        eq(financialReports.clientId, clientId),
        eq(financialReports.periodStart, periodStart),
        eq(financialReports.periodEnd, periodEnd)
      )
    )
  if (moving.length === 0) {
    return NextResponse.json({ error: 'Tidak ada laporan pada periode tersebut.' }, { status: 404 })
  }

  // Cek tabrakan di periode tujuan: tipe yang sama sudah ada di sana?
  const existing = await db
    .select({ reportType: financialReports.reportType })
    .from(financialReports)
    .where(
      and(
        eq(financialReports.clientId, clientId),
        eq(financialReports.periodStart, newPeriodStart),
        eq(financialReports.periodEnd, newPeriodEnd)
      )
    )
  const movingTypes = new Set(moving.map(m => m.reportType))
  const conflicts = existing.filter(e => movingTypes.has(e.reportType))
  if (conflicts.length > 0) {
    return NextResponse.json(
      {
        error: 'Periode tujuan sudah punya laporan dengan tipe yang sama.',
        details: conflicts.map(c => `${TYPE_LABEL[c.reportType] ?? c.reportType} sudah ada di periode tujuan — hapus/ganti dulu yang di sana.`),
      },
      { status: 409 }
    )
  }

  const now = new Date()
  const statements: BatchItem<'pg'>[] = []
  for (const m of moving) {
    statements.push(
      db
        .update(financialReports)
        .set({ periodStart: newPeriodStart, periodEnd: newPeriodEnd, updatedAt: now })
        .where(eq(financialReports.id, m.id))
    )
  }
  try {
    await db.batch(statements as [BatchItem<'pg'>, ...BatchItem<'pg'>[]])
  } catch (e) {
    // Race dgn upload lain bisa tetap melanggar unique meski pre-check lolos.
    if (isUniqueViolation(e)) {
      return NextResponse.json(
        { error: 'Periode tujuan sudah punya laporan dengan tipe yang sama.' },
        { status: 409 }
      )
    }
    return dbWriteErrorResponse(e, 'Gagal memindahkan periode. Coba lagi.')
  }

  return NextResponse.json({ moved: moving.length, newPeriodStart, newPeriodEnd })
}
