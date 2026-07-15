import { NextResponse } from 'next/server'
import { and, asc, eq, gte, inArray, lte } from 'drizzle-orm'
import { db } from '@/lib/db'
import { financialReports, masterCoa, reportLineItems } from '@/lib/db/schema'
import { requireUser } from '@/lib/api/guards'
import { monthLabel } from '@/lib/financial-agg'
import { buildNeracaDetail, type CompareLine } from '@/lib/neraca-compare'

export const runtime = 'nodejs'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const YMD_RE = /^\d{4}-\d{2}-\d{2}$/

// GET /api/analytics/[clientId]/neraca-detail?periodStart=&periodEnd=
// Tabel "Detail Neraca" gaya P&L: satu kolom per checkpoint Neraca ter-mapping
// dalam rentang, saldo akhir per akun (signed), grouped per section. Neraca =
// point-in-time → nilai TIDAK diakumulasi antar periode; kolom "Total" di UI =
// periode terakhir. Terpisah dari filter induk analytics (dipakai bareng Detail
// Laba Rugi lewat filter rentang sendiri). Role-aware.
export async function GET(req: Request, { params }: { params: Promise<{ clientId: string }> }) {
  const g = await requireUser()
  if ('error' in g) return g.error

  const { clientId } = await params
  if (!UUID_RE.test(clientId)) {
    return NextResponse.json({ error: 'clientId tidak valid.' }, { status: 400 })
  }
  if (g.user.role === 'user' && g.user.clientId !== clientId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const url = new URL(req.url)
  const periodStart = url.searchParams.get('periodStart') ?? ''
  const periodEnd = url.searchParams.get('periodEnd') ?? ''
  if (!YMD_RE.test(periodStart) || !YMD_RE.test(periodEnd)) {
    return NextResponse.json({ error: 'Periode tidak valid (YYYY-MM-DD).' }, { status: 400 })
  }

  const neracaReports = await db
    .select({ id: financialReports.id, periodStart: financialReports.periodStart })
    .from(financialReports)
    .where(and(
      eq(financialReports.clientId, clientId),
      eq(financialReports.reportType, 'neraca'),
      gte(financialReports.periodStart, periodStart),
      lte(financialReports.periodStart, periodEnd),
    ))
    .orderBy(asc(financialReports.periodStart))

  const empty = { hasData: false as const, periods: [] as { periodStart: string; label: string }[] }
  if (neracaReports.length === 0) return NextResponse.json(empty)

  const items = await db
    .select({
      reportId: reportLineItems.reportId,
      amount: reportLineItems.amount,
      isSubtotal: reportLineItems.isSubtotal,
      status: reportLineItems.status,
      kode: masterCoa.kode,
      nama: masterCoa.nama,
      kelompok: masterCoa.kelompok,
      subKelompok: masterCoa.subKelompok,
    })
    .from(reportLineItems)
    .innerJoin(masterCoa, eq(reportLineItems.masterCoaId, masterCoa.id))
    .where(inArray(reportLineItems.reportId, neracaReports.map(r => r.id)))

  const linesByReport = new Map<string, CompareLine[]>()
  for (const it of items) {
    if (it.isSubtotal || (it.status !== 'matched' && it.status !== 'edited')) continue
    if (!it.kelompok.toLowerCase().includes('neraca')) continue
    const arr = linesByReport.get(it.reportId) ?? []
    arr.push({ kode: it.kode, nama: it.nama, kelompok: it.kelompok, subKelompok: it.subKelompok, amount: Number(it.amount), isSubtotal: it.isSubtotal, status: it.status })
    linesByReport.set(it.reportId, arr)
  }

  // Hanya checkpoint yang benar-benar ter-mapping (punya baris contributing).
  const mapped = neracaReports.filter(r => (linesByReport.get(r.id)?.length ?? 0) > 0)
  if (mapped.length === 0) return NextResponse.json({ hasData: true, periods: [] })

  const label = (ps: string) => `${monthLabel(ps)} ${ps.slice(0, 4)}`
  const periods = mapped.map(r => ({ periodStart: r.periodStart, label: label(r.periodStart) }))
  const result = buildNeracaDetail(mapped.map(r => linesByReport.get(r.id) ?? []))

  return NextResponse.json({ hasData: true, periods, ...result })
}
