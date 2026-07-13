import { NextResponse } from 'next/server'
import { asc, desc, eq, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { financialReports, reportLineItems } from '@/lib/db/schema'
import { requireUser } from '@/lib/api/guards'

export const runtime = 'nodejs'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// GET /api/reports/list?clientId=
// SEMUA laporan satu klien — meta saja (tanpa line item) + jumlah baris &
// ter-mapping per laporan. Feeds panel "Riwayat Upload" di halaman Upload
// (kelola laporan: hapus / ubah periode / ganti file). Berbeda dari
// GET /api/reports yang butuh periode persis dan membawa line item penuh.
// Role-aware: admin klien mana pun, user hanya miliknya.
export async function GET(req: Request) {
  const g = await requireUser()
  if ('error' in g) return g.error

  const clientId = new URL(req.url).searchParams.get('clientId') ?? ''
  if (!UUID_RE.test(clientId)) {
    return NextResponse.json({ error: 'clientId tidak valid.' }, { status: 400 })
  }
  if (g.user.role === 'user' && g.user.clientId !== clientId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const rows = await db
    .select({
      id: financialReports.id,
      reportType: financialReports.reportType,
      periodStart: financialReports.periodStart,
      periodEnd: financialReports.periodEnd,
      sourceFileName: financialReports.sourceFileName,
      status: financialReports.status,
      lineCount: sql<number>`count(${reportLineItems.id}) filter (where not ${reportLineItems.isSubtotal})`.mapWith(Number),
      mappedCount: sql<number>`count(${reportLineItems.id}) filter (where not ${reportLineItems.isSubtotal} and ${reportLineItems.masterCoaId} is not null)`.mapWith(Number),
    })
    .from(financialReports)
    .leftJoin(reportLineItems, eq(reportLineItems.reportId, financialReports.id))
    .where(eq(financialReports.clientId, clientId))
    .groupBy(financialReports.id)
    .orderBy(desc(financialReports.periodStart), asc(financialReports.reportType))

  return NextResponse.json({ reports: rows })
}
