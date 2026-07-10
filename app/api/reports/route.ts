import { NextResponse } from 'next/server'
import { and, asc, eq, inArray, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { financialReports, reportLineItems } from '@/lib/db/schema'
import { requireUser } from '@/lib/api/guards'

export const runtime = 'nodejs'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const YMD_RE = /^\d{4}-\d{2}-\d{2}$/

// GET /api/reports?clientId=&periodStart=&periodEnd=
// Laporan (per tipe) + line item-nya untuk satu "sesi" (klien + periode).
// Feeds extraction-review. Role-aware: admin klien mana pun, user hanya miliknya.
export async function GET(req: Request) {
  const g = await requireUser()
  if ('error' in g) return g.error

  const url = new URL(req.url)
  const clientId = url.searchParams.get('clientId') ?? ''
  const periodStart = url.searchParams.get('periodStart') ?? ''
  const periodEnd = url.searchParams.get('periodEnd') ?? ''

  if (!UUID_RE.test(clientId)) {
    return NextResponse.json({ error: 'clientId tidak valid.' }, { status: 400 })
  }
  if (!YMD_RE.test(periodStart) || !YMD_RE.test(periodEnd)) {
    return NextResponse.json({ error: 'Periode tidak valid.' }, { status: 400 })
  }
  if (g.user.role === 'user' && g.user.clientId !== clientId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const reports = await db
    .select({
      id: financialReports.id,
      reportType: financialReports.reportType,
      periodStart: financialReports.periodStart,
      periodEnd: financialReports.periodEnd,
      sourceFileName: financialReports.sourceFileName,
      status: financialReports.status,
      extractedAt: financialReports.extractedAt,
      hasPdf: sql<boolean>`${financialReports.sourcePdf} is not null`,
    })
    .from(financialReports)
    .where(
      and(
        eq(financialReports.clientId, clientId),
        eq(financialReports.periodStart, periodStart),
        eq(financialReports.periodEnd, periodEnd)
      )
    )
    .orderBy(asc(financialReports.reportType))

  const reportIds = reports.map(r => r.id)
  const items = reportIds.length
    ? await db
        .select({
          id: reportLineItems.id,
          reportId: reportLineItems.reportId,
          rawName: reportLineItems.rawName,
          amount: reportLineItems.amount,
          isSubtotal: reportLineItems.isSubtotal,
          confidence: reportLineItems.confidence,
          status: reportLineItems.status,
          editedName: reportLineItems.editedName,
          masterCoaId: reportLineItems.masterCoaId,
          suggestedCoaId: reportLineItems.suggestedCoaId,
        })
        .from(reportLineItems)
        .where(inArray(reportLineItems.reportId, reportIds))
        .orderBy(asc(reportLineItems.lineOrder))
    : []

  const byReport = new Map<string, typeof items>()
  for (const it of items) {
    const arr = byReport.get(it.reportId) ?? []
    arr.push(it)
    byReport.set(it.reportId, arr)
  }

  return NextResponse.json({
    reports: reports.map(r => ({
      ...r,
      lineItems: (byReport.get(r.id) ?? []).map(it => ({
        id: it.id,
        rawName: it.rawName,
        amount: Number(it.amount),
        isSubtotal: it.isSubtotal,
        confidence: it.confidence ?? 0,
        status: it.status,
        editedName: it.editedName ?? undefined,
        // ID mentah — /coa-mapping me-resolve nama/kode-nya lewat daftar
        // Master COA yang sudah di-fetch terpisah, jadi tidak perlu join.
        masterCoaId: it.masterCoaId,
        suggestedCoaId: it.suggestedCoaId,
        // Dua field di bawah dipakai extraction-review (bentuk string, bukan id).
        // Belum diisi sampai Phase 2.5 — jangan dihapus, UI-nya masih baca ini.
        suggestedCOA: null,
        masterCOACode: null,
      })),
    })),
  })
}
