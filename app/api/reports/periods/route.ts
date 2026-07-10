import { NextResponse } from 'next/server'
import { desc, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { financialReports } from '@/lib/db/schema'
import { requireUser } from '@/lib/api/guards'

export const runtime = 'nodejs'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// GET /api/reports/periods?clientId=
// Daftar periode (distinct) yang punya laporan untuk satu klien — mengisi
// period selector di /coa-mapping. Tanpa ini, GET /api/reports tidak bisa
// dipanggil karena periodStart/periodEnd-nya wajib.
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
    .selectDistinct({
      periodStart: financialReports.periodStart,
      periodEnd: financialReports.periodEnd,
    })
    .from(financialReports)
    .where(eq(financialReports.clientId, clientId))
    .orderBy(desc(financialReports.periodStart))

  return NextResponse.json({ periods: rows })
}
