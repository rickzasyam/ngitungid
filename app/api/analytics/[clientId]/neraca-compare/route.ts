import { NextResponse } from 'next/server'
import { and, asc, eq, inArray } from 'drizzle-orm'
import { db } from '@/lib/db'
import { financialReports, masterCoa, reportLineItems } from '@/lib/db/schema'
import { requireUser } from '@/lib/api/guards'
import { monthLabel } from '@/lib/financial-agg'
import { buildNeracaCompare, type CompareLine } from '@/lib/neraca-compare'

export const runtime = 'nodejs'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const YMD_RE = /^\d{4}-\d{2}-\d{2}$/

// GET /api/analytics/[clientId]/neraca-compare?a=&b=
// Komparasi Neraca per akun antara dua checkpoint (a/b = periodStart laporan
// neraca). Tanpa a/b → default dua checkpoint TER-MAPPING terbaru. Checkpoint
// = laporan neraca yang punya ≥1 baris contributing (matched/edited,
// non-subtotal, ter-mapping ke COA berkelompok Neraca) — neraca yang belum
// di-mapping tidak ditawarkan (membandingkan nol tidak bermakna).
// Endpoint SENGAJA terpisah dari /ratios: butuh pasangan checkpoint pilihan
// user (bukan turunan rentang), dan ganti pasangan tidak perlu re-agregasi
// seluruh payload rasio. Menutup item roadmap "/compare" untuk sisi Neraca.
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
  const aParam = url.searchParams.get('a')
  const bParam = url.searchParams.get('b')
  if ((aParam && !YMD_RE.test(aParam)) || (bParam && !YMD_RE.test(bParam))) {
    return NextResponse.json({ error: 'Periode tidak valid (YYYY-MM-DD).' }, { status: 400 })
  }

  const neracaReports = await db
    .select({ id: financialReports.id, periodStart: financialReports.periodStart })
    .from(financialReports)
    .where(and(eq(financialReports.clientId, clientId), eq(financialReports.reportType, 'neraca')))
    .orderBy(asc(financialReports.periodStart))

  const empty = { hasData: false as const, checkpoints: [] as { periodStart: string; label: string }[], a: null, b: null }
  if (neracaReports.length === 0) return NextResponse.json(empty)

  // innerJoin master_coa → baris unmapped (masterCoaId null) otomatis gugur.
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

  const linesOf = new Map<string, CompareLine[]>()
  for (const it of items) {
    if (it.isSubtotal || (it.status !== 'matched' && it.status !== 'edited')) continue
    if (!it.kelompok.toLowerCase().includes('neraca')) continue
    const arr = linesOf.get(it.reportId) ?? []
    arr.push({ kode: it.kode, nama: it.nama, kelompok: it.kelompok, subKelompok: it.subKelompok, amount: Number(it.amount), isSubtotal: it.isSubtotal, status: it.status })
    linesOf.set(it.reportId, arr)
  }

  const label = (ps: string) => `${monthLabel(ps)} ${ps.slice(0, 4)}`
  const mapped = neracaReports.filter(r => (linesOf.get(r.id)?.length ?? 0) > 0)
  const checkpoints = mapped.map(r => ({ periodStart: r.periodStart, label: label(r.periodStart) }))
  if (mapped.length === 0) return NextResponse.json(empty)

  // <2 checkpoint → tidak ada yang bisa dibandingkan; UI tampilkan state jelas.
  if (mapped.length < 2 && !(aParam && bParam)) {
    return NextResponse.json({ hasData: true, checkpoints, a: null, b: null })
  }

  const findCp = (ps: string) => mapped.find(r => r.periodStart === ps)
  const repA = aParam ? findCp(aParam) : mapped[mapped.length - 2]
  const repB = bParam ? findCp(bParam) : mapped[mapped.length - 1]
  if (!repA || !repB) {
    return NextResponse.json({ error: 'Periode bukan checkpoint Neraca ter-mapping untuk klien ini.' }, { status: 400 })
  }

  const result = buildNeracaCompare(linesOf.get(repA.id) ?? [], linesOf.get(repB.id) ?? [])

  return NextResponse.json({
    hasData: true,
    checkpoints,
    a: repA.periodStart,
    b: repB.periodStart,
    labelA: label(repA.periodStart),
    labelB: label(repB.periodStart),
    ...result,
  })
}
