import { NextResponse } from 'next/server'
import { and, asc, desc, eq, gte, inArray, lt, lte } from 'drizzle-orm'
import { db } from '@/lib/db'
import { financialReports, masterCoa, reportLineItems } from '@/lib/db/schema'
import { requireUser } from '@/lib/api/guards'
import { aggregateBalanceSheet, aggregatePnl, monthLabel, type AggLine } from '@/lib/financial-agg'

export const runtime = 'nodejs'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const YMD_RE = /^\d{4}-\d{2}-\d{2}$/

const safeDiv = (a: number, b: number) => (b === 0 ? 0 : a / b)

// GET /api/analytics/[clientId]/ratios?periodStart=&periodEnd=
// Mengembalikan seri bulanan P&L + neraca (bentuk yang dipakai app/analytics),
// PLUS rasio keuangan siap-pakai atas seluruh rentang. Semua diturunkan dari
// report_line_items + master_coa (baris matched/edited, non-subtotal).
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

  const reports = await db
    .select({ id: financialReports.id, reportType: financialReports.reportType, periodStart: financialReports.periodStart })
    .from(financialReports)
    .where(
      and(
        eq(financialReports.clientId, clientId),
        gte(financialReports.periodStart, periodStart),
        lte(financialReports.periodStart, periodEnd)
      )
    )
    .orderBy(asc(financialReports.periodStart))

  if (reports.length === 0) return NextResponse.json({ hasData: false })

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
    .where(inArray(reportLineItems.reportId, reports.map(r => r.id)))

  const by = new Map<string, AggLine[]>()
  for (const it of items) {
    const a = by.get(it.reportId) ?? []
    a.push({ amount: Number(it.amount), nama: it.rawName, kelompok: it.kelompok ?? '', subKelompok: it.subKelompok ?? '', classCf: it.classCf, isSubtotal: it.isSubtotal, status: it.status })
    by.set(it.reportId, a)
  }
  const linesOf = (id: string) => by.get(id) ?? []

  // Seri bulanan P&L — bentuk { m, rev, np, gp, exp } seperti analytics page.
  const monthly = reports
    .filter(r => r.reportType === 'laba_rugi')
    .map(r => {
      const a = aggregatePnl(linesOf(r.id))
      return { m: monthLabel(r.periodStart), rev: a.revenue, np: a.netProfit, gp: a.grossProfit, exp: a.expenses }
    })

  const neraca = reports.filter(r => r.reportType === 'neraca')
  const bsAgg = neraca.length ? aggregateBalanceSheet(linesOf(neraca[neraca.length - 1].id)) : null
  const bs = bsAgg
    ? {
        aktivaLancar: bsAgg.balanceSheet.aktivaLancar,
        hutangLancar: bsAgg.hutangLancar,
        persediaan: bsAgg.persediaan,
        kas: bsAgg.kas,
        piutang: bsAgg.piutang,
        totalModal: bsAgg.balanceSheet.totalModal,
        totalAset: bsAgg.balanceSheet.totalAset,
        totalHutang: bsAgg.balanceSheet.totalHutang,
      }
    : null

  // Beginning balance: laporan Neraca TERAKHIR sebelum neraca pertama dalam
  // rentang (query terpisah, tanpa filter rentang). Dipakai untuk rata-rata
  // (awal+akhir) di DPO/ROE/ROA. Kalau tidak ada (klien baru, belum ada periode
  // sebelumnya) → fallback ke ending balance, jadi avg otomatis = ending.
  let beginBsAgg = bsAgg
  if (bsAgg && neraca.length > 0) {
    const [prevNeraca] = await db
      .select({ id: financialReports.id })
      .from(financialReports)
      .where(
        and(
          eq(financialReports.clientId, clientId),
          eq(financialReports.reportType, 'neraca'),
          lt(financialReports.periodStart, neraca[0].periodStart)
        )
      )
      .orderBy(desc(financialReports.periodStart))
      .limit(1)
    if (prevNeraca) {
      const prevItems = await db
        .select({
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
        .where(eq(reportLineItems.reportId, prevNeraca.id))
      const prevLines: AggLine[] = prevItems.map(it => ({
        amount: Number(it.amount),
        nama: it.rawName,
        kelompok: it.kelompok ?? '',
        subKelompok: it.subKelompok ?? '',
        classCf: it.classCf,
        isSubtotal: it.isSubtotal,
        status: it.status,
      }))
      beginBsAgg = aggregateBalanceSheet(prevLines)
    }
  }

  // Rasio atas seluruh rentang (annualisasi pakai jumlah bulan × 30.4 hari).
  const totRev = monthly.reduce((s, d) => s + d.rev, 0)
  const totGP = monthly.reduce((s, d) => s + d.gp, 0)
  const totNP = monthly.reduce((s, d) => s + d.np, 0)
  const totExp = monthly.reduce((s, d) => s + d.exp, 0)
  const totHPP = totRev - totGP
  const totOI = totGP - totExp
  const days = Math.max(1, monthly.length) * 30.4

  // Rata-rata (awal+akhir) untuk stok balance yang dibandingkan ke flow periode.
  const avgTotalModal = bsAgg && beginBsAgg ? (beginBsAgg.balanceSheet.totalModal + bsAgg.balanceSheet.totalModal) / 2 : 0
  const avgTotalAset = bsAgg && beginBsAgg ? (beginBsAgg.balanceSheet.totalAset + bsAgg.balanceSheet.totalAset) / 2 : 0
  const avgHutangUsaha = bsAgg && beginBsAgg ? (beginBsAgg.hutangUsaha + bsAgg.hutangUsaha) / 2 : 0

  const ratios = bs
    ? {
        cr: safeDiv(bs.aktivaLancar, bs.hutangLancar),
        qr: safeDiv(bs.aktivaLancar - bs.persediaan, bs.hutangLancar),
        cashR: safeDiv(bs.kas, bs.hutangLancar),
        der: safeDiv(bs.totalHutang, bs.totalModal),
        wc: bs.aktivaLancar - bs.hutangLancar,
        gpm: safeDiv(totGP, totRev) * 100,
        npm: safeDiv(totNP, totRev) * 100,
        opm: safeDiv(totOI, totRev) * 100,
        roe: safeDiv(totNP, avgTotalModal) * 100, // rata-rata ekuitas
        roa: safeDiv(totNP, avgTotalAset) * 100, // rata-rata aset
        dso: safeDiv(bs.piutang, totRev) * days,
        dio: safeDiv(bs.persediaan * days, totHPP), // basis HPP, bukan pendapatan
        dpo: safeDiv(avgHutangUsaha * days, totHPP), // rata-rata hutang usaha, basis HPP
        invTurn: safeDiv(totHPP, bs.persediaan) * (365 / days), // basis HPP
        assetTurn: safeDiv(totRev, bs.totalAset) * (365 / days),
      }
    : null

  return NextResponse.json({ hasData: true, monthly, bs, ratios })
}
