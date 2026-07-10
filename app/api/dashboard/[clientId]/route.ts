import { NextResponse } from 'next/server'
import { and, asc, eq, gte, inArray, lte } from 'drizzle-orm'
import { db } from '@/lib/db'
import { financialReports, masterCoa, reportLineItems } from '@/lib/db/schema'
import { requireUser } from '@/lib/api/guards'
import {
  aggregateBalanceSheet,
  aggregateCashflow,
  aggregatePnl,
  classifyPnl,
  contributing,
  monthLabel,
  type AggLine,
} from '@/lib/financial-agg'

export const runtime = 'nodejs'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const YMD_RE = /^\d{4}-\d{2}-\d{2}$/

const EXPENSE_COLORS: Record<string, string> = {
  HPP: '#daf163',
  'Biaya Variabel': '#bbb3f3',
  'Biaya Fixed': '#fdba74',
  'Lain-lain': '#7dd3fc',
}

// GET /api/dashboard/[clientId]?periodStart=&periodEnd=
// Semua angka diturunkan on-the-fly dari report_line_items + master_coa
// (baris matched/edited, non-subtotal). Bentuk respons mengikuti props chart
// di app/dashboard/page.tsx supaya wiring = ganti sumber data, bukan redesign.
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

  // Laporan klien dalam rentang (by periodStart), + line item-nya JOIN COA.
  const reports = await db
    .select({
      id: financialReports.id,
      reportType: financialReports.reportType,
      periodStart: financialReports.periodStart,
    })
    .from(financialReports)
    .where(
      and(
        eq(financialReports.clientId, clientId),
        gte(financialReports.periodStart, periodStart),
        lte(financialReports.periodStart, periodEnd)
      )
    )
    .orderBy(asc(financialReports.periodStart))

  if (reports.length === 0) {
    return NextResponse.json({ hasData: false })
  }

  const reportIds = reports.map(r => r.id)
  const items = await db
    .select({
      reportId: reportLineItems.reportId,
      amount: reportLineItems.amount,
      rawName: reportLineItems.rawName,
      isSubtotal: reportLineItems.isSubtotal,
      status: reportLineItems.status,
      kelompok: masterCoa.kelompok,
      subKelompok: masterCoa.subKelompok,
      classCf: masterCoa.classCf,
    })
    .from(reportLineItems)
    .leftJoin(masterCoa, eq(reportLineItems.masterCoaId, masterCoa.id))
    .where(inArray(reportLineItems.reportId, reportIds))

  const linesByReport = new Map<string, AggLine[]>()
  for (const it of items) {
    const arr = linesByReport.get(it.reportId) ?? []
    arr.push({
      amount: Number(it.amount),
      nama: it.rawName,
      kelompok: it.kelompok ?? '',
      subKelompok: it.subKelompok ?? '',
      classCf: it.classCf,
      isSubtotal: it.isSubtotal,
      status: it.status,
    })
    linesByReport.set(it.reportId, arr)
  }
  const linesOf = (id: string) => linesByReport.get(id) ?? []

  // ── P&L per bulan ──
  const pnlReports = reports.filter(r => r.reportType === 'laba_rugi')
  const monthly = pnlReports.map(r => {
    const a = aggregatePnl(linesOf(r.id))
    return {
      month: monthLabel(r.periodStart),
      revenue: a.revenue,
      netProfit: a.netProfit,
      grossProfit: a.grossProfit,
      expenses: a.expenses,
    }
  })
  const pnlTotals = pnlReports.reduce(
    (acc, r) => {
      const a = aggregatePnl(linesOf(r.id))
      acc.revenue += a.revenue
      acc.netProfit += a.netProfit
      acc.hpp += a.hpp
      acc.varCost += a.varCost
      acc.fixedCost += a.fixedCost
      acc.lainLain += a.lainLain
      return acc
    },
    { revenue: 0, netProfit: 0, hpp: 0, varCost: 0, fixedCost: 0, lainLain: 0 }
  )

  // ── Expense breakdown (across range) ──
  const expenseBreakdown = (
    [
      ['HPP', pnlTotals.hpp],
      ['Biaya Variabel', pnlTotals.varCost],
      ['Biaya Fixed', pnlTotals.fixedCost],
      ['Lain-lain', Math.abs(pnlTotals.lainLain)],
    ] as const
  )
    .filter(([, v]) => v > 0)
    .map(([name, value]) => ({ name, value, color: EXPENSE_COLORS[name] ?? '#7dd3fc' }))

  // ── Top receipts: agregasi baris pendapatan (positif) per nama, top 5 ──
  const receipts = new Map<string, number>()
  for (const r of pnlReports) {
    for (const l of contributing(linesOf(r.id))) {
      if (l.amount > 0 && classifyPnl(l.subKelompok) === 'revenue') {
        receipts.set(l.nama, (receipts.get(l.nama) ?? 0) + l.amount)
      }
    }
  }
  const topReceipts = [...receipts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, amount]) => ({ name, amount }))

  // ── Balance sheet: laporan neraca TERBARU dalam rentang (point-in-time) ──
  const neracaReports = reports.filter(r => r.reportType === 'neraca')
  const latestNeraca = neracaReports[neracaReports.length - 1]
  const bs = latestNeraca ? aggregateBalanceSheet(linesOf(latestNeraca.id)) : null

  // ── Cash flow per bulan ──
  const cashflow = reports
    .filter(r => r.reportType === 'arus_kas')
    .map(r => ({ month: monthLabel(r.periodStart), ...aggregateCashflow(linesOf(r.id)) }))

  return NextResponse.json({
    hasData: true,
    monthly,
    totals: {
      revenue: pnlTotals.revenue,
      netProfit: pnlTotals.netProfit,
      fixedCost: pnlTotals.fixedCost,
      varCost: pnlTotals.varCost,
    },
    expenseBreakdown,
    balanceSheet: bs?.balanceSheet ?? null,
    workingCapital: bs?.workingCapital ?? [],
    cashflow,
    topReceipts,
  })
}
