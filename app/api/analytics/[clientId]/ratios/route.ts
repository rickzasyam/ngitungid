import { NextResponse } from 'next/server'
import { and, asc, desc, eq, gte, inArray, lt, lte } from 'drizzle-orm'
import { db } from '@/lib/db'
import { financialReports, masterCoa, reportLineItems } from '@/lib/db/schema'
import { requireUser } from '@/lib/api/guards'
import { aggregateBalanceSheet, aggregatePnl, classifyPnl, contributing, monthLabel, type AggLine } from '@/lib/financial-agg'

export const runtime = 'nodejs'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const YMD_RE = /^\d{4}-\d{2}-\d{2}$/

const safeDiv = (a: number, b: number) => (b === 0 ? 0 : a / b)

type BsAgg = ReturnType<typeof aggregateBalanceSheet>

// GET /api/analytics/[clientId]/ratios?periodStart=&periodEnd=
// Seri bulanan P&L + neraca + rasio siap-pakai + trendArrays (nilai rasio
// KUMULATIF di tiap checkpoint Neraca dalam rentang). Semua diturunkan dari
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
    .select({ id: financialReports.id, reportType: financialReports.reportType, periodStart: financialReports.periodStart, periodEnd: financialReports.periodEnd })
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

  const pnlReports = reports.filter(r => r.reportType === 'laba_rugi')
  const neracaReports = reports.filter(r => r.reportType === 'neraca')
  // Precompute agregat per laporan (dipakai berulang oleh windowRatios).
  const pnlAggOf = new Map(pnlReports.map(r => [r.id, aggregatePnl(linesOf(r.id))]))
  const bsAggOf = new Map(neracaReports.map(r => [r.id, aggregateBalanceSheet(linesOf(r.id))]))

  // Seri bulanan P&L — bentuk { m, rev, np, gp, exp } seperti analytics page.
  const monthly = pnlReports.map(r => {
    const a = pnlAggOf.get(r.id)!
    return { m: monthLabel(r.periodStart), rev: a.revenue, np: a.netProfit, gp: a.grossProfit, exp: a.expenses }
  })

  // Beginning balance = Neraca TERAKHIR SEBELUM rentang (query terpisah).
  // SAMA untuk semua checkpoint (periodStart rentang tetap). null bila tak ada.
  let beginBsAgg: BsAgg | null = null
  if (neracaReports.length > 0) {
    const [prev] = await db
      .select({ id: financialReports.id })
      .from(financialReports)
      .where(and(eq(financialReports.clientId, clientId), eq(financialReports.reportType, 'neraca'), lt(financialReports.periodStart, neracaReports[0].periodStart)))
      .orderBy(desc(financialReports.periodStart))
      .limit(1)
    if (prev) {
      const prevItems = await db
        .select({ amount: reportLineItems.amount, rawName: reportLineItems.rawName, isSubtotal: reportLineItems.isSubtotal, status: reportLineItems.status, kelompok: masterCoa.kelompok, subKelompok: masterCoa.subKelompok, classCf: masterCoa.classCf })
        .from(reportLineItems)
        .leftJoin(masterCoa, eq(reportLineItems.masterCoaId, masterCoa.id))
        .where(eq(reportLineItems.reportId, prev.id))
      beginBsAgg = aggregateBalanceSheet(prevItems.map(it => ({ amount: Number(it.amount), nama: it.rawName, kelompok: it.kelompok ?? '', subKelompok: it.subKelompok ?? '', classCf: it.classCf, isSubtotal: it.isSubtotal, status: it.status })))
    }
  }

  // Rasio KUMULATIF dari awal rentang sampai `windowEnd`. Reuse persis rumus
  // yang sama untuk main-ratios & tiap titik trend (menghindari algoritma paralel).
  function windowRatios(windowEnd: string) {
    const pnlW = pnlReports.filter(r => r.periodStart <= windowEnd)
    const nerW = neracaReports.filter(r => r.periodStart <= windowEnd)
    const endBs = nerW.length ? bsAggOf.get(nerW[nerW.length - 1].id)! : null

    const totRev = pnlW.reduce((s, r) => s + pnlAggOf.get(r.id)!.revenue, 0)
    const totGP = pnlW.reduce((s, r) => s + pnlAggOf.get(r.id)!.grossProfit, 0)
    const totNP = pnlW.reduce((s, r) => s + pnlAggOf.get(r.id)!.netProfit, 0)
    const totExp = pnlW.reduce((s, r) => s + pnlAggOf.get(r.id)!.expenses, 0)
    const totHPP = totRev - totGP
    const totOI = totGP - totExp
    const days = Math.max(1, pnlW.length) * 30.4

    if (!endBs) return { ratios: null, bs: null, totRev, totGP, totNP }

    const bs = {
      aktivaLancar: endBs.balanceSheet.aktivaLancar,
      hutangLancar: endBs.hutangLancar,
      persediaan: endBs.persediaan,
      kas: endBs.kas,
      piutang: endBs.piutang,
      totalModal: endBs.balanceSheet.totalModal,
      totalAset: endBs.balanceSheet.totalAset,
      totalHutang: endBs.balanceSheet.totalHutang,
    }
    // Beginning = opening rentang (atau ending window kalau tak ada) → avg.
    const begin = beginBsAgg ?? endBs
    const avgTotalModal = (begin.balanceSheet.totalModal + endBs.balanceSheet.totalModal) / 2
    const avgTotalAset = (begin.balanceSheet.totalAset + endBs.balanceSheet.totalAset) / 2
    const avgHutangUsaha = (begin.hutangUsaha + endBs.hutangUsaha) / 2

    const ratios = {
      cr: safeDiv(bs.aktivaLancar, bs.hutangLancar),
      qr: safeDiv(bs.aktivaLancar - bs.persediaan, bs.hutangLancar),
      cashR: safeDiv(bs.kas, bs.hutangLancar),
      der: safeDiv(bs.totalHutang, bs.totalModal),
      wc: bs.aktivaLancar - bs.hutangLancar,
      gpm: safeDiv(totGP, totRev) * 100,
      npm: safeDiv(totNP, totRev) * 100,
      opm: safeDiv(totOI, totRev) * 100,
      roe: safeDiv(totNP, avgTotalModal) * 100,
      roa: safeDiv(totNP, avgTotalAset) * 100,
      dso: safeDiv(bs.piutang, totRev) * days,
      dio: safeDiv(bs.persediaan * days, totHPP),
      dpo: safeDiv(avgHutangUsaha * days, totHPP),
      invTurn: safeDiv(totHPP, bs.persediaan) * (365 / days),
      assetTurn: safeDiv(totRev, bs.totalAset) * (365 / days),
    }
    return { ratios, bs, totRev, totGP, totNP }
  }

  const main = windowRatios(periodEnd)

  // Breakdown akun P&L (kumulatif seluruh rentang) untuk tabel Detail Laba Rugi.
  // Group by (subKelompok, nama akun) → jumlah lintas laporan P&L. Revenue
  // signed (retur/potongan mengurangi), HPP/opex abs (searah dgn aggregatePnl).
  type BdCat = 'revenue' | 'hpp' | 'opex'
  const bdCatOf = (sub: string): BdCat | null => {
    const c = classifyPnl(sub)
    return c === 'revenue' ? 'revenue' : c === 'hpp' ? 'hpp' : (c === 'varCost' || c === 'fixedCost') ? 'opex' : null
  }
  const bdMap: Record<BdCat, Map<string, { name: string; subKelompok: string; amount: number }>> = { revenue: new Map(), hpp: new Map(), opex: new Map() }
  for (const r of pnlReports) {
    for (const l of contributing(linesOf(r.id))) {
      if (!(l.kelompok ?? '').toLowerCase().includes('laba')) continue
      const cat = bdCatOf(l.subKelompok)
      if (!cat) continue
      const key = `${l.subKelompok}||${l.nama}`
      const cur = bdMap[cat].get(key) ?? { name: l.nama, subKelompok: l.subKelompok, amount: 0 }
      cur.amount += l.amount
      bdMap[cat].set(key, cur)
    }
  }
  const bdArr = (cat: BdCat) => [...bdMap[cat].values()]
    .map(v => ({ name: v.name, subKelompok: v.subKelompok, amount: cat === 'revenue' ? v.amount : Math.abs(v.amount) }))
    .sort((a, b) => a.subKelompok.localeCompare(b.subKelompok) || b.amount - a.amount)
  const pnlBreakdown = { revenue: bdArr('revenue'), hpp: bdArr('hpp'), opex: bdArr('opex') }

  // trendArrays: satu titik per checkpoint Neraca dalam rentang (kumulatif).
  // Shape = TrendArrays (components/analytics/metric-drawer.tsx).
  // trendMonths: label bulan tiap checkpoint (sejajar dgn tiap titik trendArrays)
  // → dipakai sbg sumbu-x TrendBars di drawer supaya label akurat, tidak
  // diasumsikan sama dgn `monthly` (jumlah laporan P&L vs Neraca bisa beda).
  const ta = {
    rev: [] as number[], gp: [] as number[], np: [] as number[],
    gpm: [] as number[], npm: [] as number[], opm: [] as number[],
    roe: [] as number[], roa: [] as number[], dso: [] as number[], dio: [] as number[],
    dpo: [] as number[], invTurn: [] as number[], assetTurn: [] as number[], ccc: [] as number[],
    cr: [] as number[], qr: [] as number[], cashR: [] as number[], der: [] as number[], wc: [] as number[],
  }
  const trendMonths: string[] = []
  for (const c of neracaReports) {
    const w = windowRatios(c.periodEnd)
    if (!w.ratios) continue
    trendMonths.push(monthLabel(c.periodStart))
    ta.rev.push(w.totRev); ta.gp.push(w.totGP); ta.np.push(w.totNP)
    ta.gpm.push(w.ratios.gpm); ta.npm.push(w.ratios.npm); ta.opm.push(w.ratios.opm)
    ta.roe.push(w.ratios.roe); ta.roa.push(w.ratios.roa)
    ta.dso.push(w.ratios.dso); ta.dio.push(w.ratios.dio); ta.dpo.push(w.ratios.dpo)
    ta.invTurn.push(w.ratios.invTurn); ta.assetTurn.push(w.ratios.assetTurn)
    ta.ccc.push(w.ratios.dio + w.ratios.dso - w.ratios.dpo)
    ta.cr.push(w.ratios.cr); ta.qr.push(w.ratios.qr); ta.cashR.push(w.ratios.cashR)
    ta.der.push(w.ratios.der); ta.wc.push(w.ratios.wc)
  }

  return NextResponse.json({ hasData: true, monthly, bs: main.bs, ratios: main.ratios, trendArrays: ta, trendMonths, pnlBreakdown })
}
