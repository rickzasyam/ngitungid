'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRequireClient } from '@/lib/use-require-client'
import { DateRangePicker } from '@/components/date-range-picker'
import { RevenueTrendChart } from '@/components/dashboard/revenue-trend-chart'
import { PnlOverviewChart } from '@/components/dashboard/pnl-overview-chart'
import { ExpenseBreakdownDonut } from '@/components/dashboard/expense-breakdown-donut'
import { BalanceSheetHealth } from '@/components/dashboard/balance-sheet-health'
import { CashflowWaterfallChart } from '@/components/dashboard/cashflow-waterfall-chart'
import { TopReceiptsBubble } from '@/components/dashboard/top-receipts-bubble'
import { formatRupiahShort } from '@/components/dashboard/dashboard-utils'

import {
  TrendingUp, DollarSign, Monitor, Activity,
  ArrowUpRight, ArrowDownRight, Trophy, Loader2, Inbox,
} from 'lucide-react'

// ── Tipe respons GET /api/dashboard/[clientId] ──────────────
type MonthPoint = { month: string; revenue: number; netProfit: number; grossProfit: number; expenses: number }
type DashboardData = {
  hasData: boolean
  monthly?: MonthPoint[]
  totals?: { revenue: number; netProfit: number; fixedCost: number; varCost: number }
  expenseBreakdown?: { name: string; value: number; color: string }[]
  balanceSheet?: { totalAset: number; aktivaLancar: number; aktivaTetap: number; aktivaLainnya: number; totalHutang: number; totalModal: number } | null
  workingCapital?: { label: string; value: number; icon: string }[]
  cashflow?: { month: string; operating: number; investing: number; funding: number }[]
  topReceipts?: { name: string; amount: number }[]
}

const MONTHS_12 = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

const toYMD = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

// ── KPI CARD ─────────────────────────────────────────────────
function KPICard({
  label, value, avgLabel, changePercent, variant, icon: Icon,
}: {
  label: string; value: string; avgLabel?: string; changePercent?: number
  variant: 'lime' | 'lilac'; icon: React.ElementType
}) {
  const bg = variant === 'lime' ? 'var(--color-accent-primary)' : 'var(--color-accent-secondary)'
  const isPositive = changePercent !== undefined && changePercent >= 0
  const circles = variant === 'lime' ? [
    { size: 140, top: -50, right: -40, bg: 'rgba(26,26,26,0.12)', blend: 'multiply' as const },
    { size: 95, top: -15, right: 15, bg: 'rgba(255,255,255,0.5)', blend: 'overlay' as const },
    { size: 55, top: 25, right: -15, bg: 'rgba(26,26,26,0.18)', blend: 'multiply' as const },
  ] : [
    { size: 140, top: -50, right: -40, bg: 'rgba(255,255,255,0.35)', blend: 'overlay' as const },
    { size: 95, top: -15, right: 15, bg: 'rgba(26,26,26,0.1)', blend: 'multiply' as const },
    { size: 55, top: 25, right: -15, bg: 'rgba(255,255,255,0.45)', blend: 'overlay' as const },
  ]
  return (
    <div className="ng-card-lift relative overflow-hidden rounded-3xl p-5" style={{ background: bg }}>
      {circles.map((c, i) => (
        <div key={i} className="absolute rounded-full" style={{ width: `${c.size}px`, height: `${c.size}px`, top: `${c.top}px`, right: `${c.right}px`, background: c.bg, mixBlendMode: c.blend, zIndex: 0 }} />
      ))}
      <div className="relative" style={{ zIndex: 1 }}>
        <div className="flex items-center justify-between mb-3">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: 'rgba(26,26,26,0.12)' }}>
            <Icon className="w-4 h-4" style={{ color: 'var(--color-accent-primary-fg)' }} />
          </div>
        </div>
        <p className="text-xs font-medium mb-1" style={{ color: 'rgba(26,26,26,0.7)' }}>{label}</p>
        <p className="text-2xl font-bold" style={{ color: 'var(--color-accent-primary-fg)', margin: '0 0 12px' }}>{value}</p>
        {/* Baris bawah SELALU ada (avg kiri + MoM kanan) → keempat card tinggi
            sama walau Fixed/Variable Cost tak punya perbandingan bulan lalu. */}
        <div className="flex items-center justify-between gap-2">
          {avgLabel ? (
            <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 9px', borderRadius: 999, background: 'rgba(26,26,26,0.1)', color: 'rgba(26,26,26,0.72)' }}>
              avg {avgLabel}/bln
            </span>
          ) : <span />}
          {changePercent !== undefined && (
            <div className="flex items-center gap-1 flex-shrink-0">
              {isPositive
                ? <ArrowUpRight className="w-3.5 h-3.5" style={{ color: 'var(--color-accent-primary-fg)' }} />
                : <ArrowDownRight className="w-3.5 h-3.5" style={{ color: 'var(--color-accent-primary-fg)' }} />}
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-accent-primary-fg)' }}>{Math.abs(changePercent).toFixed(1)}%</span>
              <span style={{ fontSize: 10, color: 'rgba(26,26,26,0.55)' }}>vs bln lalu</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── MAIN PAGE ────────────────────────────────────────────────
export default function DashboardPage() {
  const { activeClient, isLoaded } = useRequireClient()
  const clientId = activeClient?.id ?? null
  // Default = TAHUN BERJALAN (bukan hardcode) supaya tidak nyangkut di satu
  // tahun begitu kalender berganti.
  const [dashboardDateRange, setDashboardDateRange] = useState<{ from: Date | undefined; to: Date | undefined } | undefined>(() => {
    const y = new Date().getFullYear()
    return { from: new Date(y, 0, 1), to: new Date(y, 11, 31) }
  })

  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const from = dashboardDateRange?.from
  const to = dashboardDateRange?.to
  const fromKey = from ? toYMD(from) : ''
  const toKey = to ? toYMD(to) : ''

  const load = useCallback(async () => {
    if (!clientId || !fromKey || !toKey) return
    setLoading(true)
    setLoadError(null)
    try {
      const res = await fetch(`/api/dashboard/${clientId}?periodStart=${fromKey}&periodEnd=${toKey}`)
      if (!res.ok) throw new Error()
      setData(await res.json())
    } catch {
      setLoadError('Gagal memuat data dashboard.')
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [clientId, fromKey, toKey])

  useEffect(() => {
    void load()
  }, [load])

  if (!isLoaded || !activeClient) return null

  // ── Turunan dari data API (bentuk sama seperti props chart) ──
  const monthly = data?.monthly ?? []
  const monthsCount = monthly.length

  // Tahun & label periode DITURUNKAN dari periode yang dipilih + bulan yang
  // benar-benar punya data — jangan pernah hardcode di komponen chart.
  // Catatan: data bulanan hanya membawa NAMA bulan (tanpa tahun), jadi rentang
  // yang melintasi pergantian tahun memakai tahun AWAL periode. Untuk presisi
  // per-bulan, API perlu mengirim tahun di tiap titik data.
  const year = (from ?? new Date()).getFullYear()
  const periodLabel = monthsCount === 0
    ? String(year)
    : monthsCount === 1
      ? `${monthly[0].month} ${year}`
      : `${monthly[0].month}–${monthly[monthsCount - 1].month} ${year}`
  const totalRevenue = data?.totals?.revenue ?? 0
  const totalNetProfit = data?.totals?.netProfit ?? 0
  const fixedCostTotal = data?.totals?.fixedCost ?? 0
  const varCostTotal = data?.totals?.varCost ?? 0
  const avg = (v: number) => (monthsCount > 0 ? Math.round(v / monthsCount) : 0)

  // 12-bulan template (null untuk bulan tanpa data) — bentuk yang diharapkan chart
  const monthly12 = MONTHS_12.map(m => {
    const found = monthly.find(d => d.month === m)
    return found
      ? { month: m, revenue: found.revenue, netProfit: found.netProfit, grossProfit: found.grossProfit, expenses: found.expenses }
      : { month: m, revenue: null, netProfit: null, grossProfit: null, expenses: null }
  })

  const pnlOverview = monthly.map(d => ({ month: d.month, pendapatan: d.revenue, biaya: d.expenses }))
  const expenseBreakdown = data?.expenseBreakdown ?? []
  const totalExpenses = expenseBreakdown.reduce((s, e) => s + e.value, 0)
  const balanceSheet = data?.balanceSheet ?? null
  const workingCapital = data?.workingCapital ?? []
  const cashflow = data?.cashflow ?? []
  const topReceipts = data?.topReceipts ?? []

  const last = monthly[monthly.length - 1]
  const prev = monthly[monthly.length - 2]
  const revenueChange = last && prev && prev.revenue ? ((last.revenue - prev.revenue) / prev.revenue) * 100 : undefined
  const profitChange = last && prev && prev.netProfit ? ((last.netProfit - prev.netProfit) / prev.netProfit) * 100 : undefined

  const empty = !loading && (!data?.hasData || monthsCount === 0)

  return (
    <div className="flex-1 p-3 min-w-0 overflow-hidden">
      <div className="h-full rounded-3xl overflow-hidden flex flex-col" style={{ background: 'white', boxShadow: '0 8px 40px rgb(0,0,0,0.4)' }}>

          {/* Header */}
          <div className="flex-shrink-0 px-4 sm:px-6 py-5 border-b flex items-center justify-between" style={{ borderColor: '#f0f0f0' }}>
            <div>
              <h1 className="text-xl font-bold" style={{ color: '#2d2d2d' }}>Dashboard</h1>
              <p className="text-sm mt-0.5" style={{ color: '#6b7280' }}>{activeClient.name} · Ringkasan performa keuangan</p>
            </div>
            <div style={{ width: '280px' }} className="hidden sm:block">
              <DateRangePicker value={dashboardDateRange} onChange={setDashboardDateRange} placeholder="Pilih periode" />
            </div>
          </div>

          {/* Scrollable content */}
          <main className="flex-1 overflow-y-auto" style={{ background: '#f8f8f8' }}>
            {loading ? (
              <div className="flex items-center justify-center gap-2 h-full" style={{ color: '#9ca3af' }}>
                <Loader2 className="w-5 h-5 animate-spin" /><span className="text-sm">Memuat data…</span>
              </div>
            ) : loadError ? (
              <div className="flex items-center justify-center h-full"><p className="text-sm" style={{ color: '#dc2626' }}>{loadError}</p></div>
            ) : empty ? (
              <div className="flex items-center justify-center h-full p-6">
                <div className="text-center max-w-sm">
                  <div className="w-14 h-14 rounded-2xl mx-auto mb-4 flex items-center justify-center" style={{ border: '1.5px dashed rgba(218,241,99,0.9)', background: '#fbfef2' }}>
                    <Inbox className="w-6 h-6" style={{ color: '#8aa32e' }} />
                  </div>
                  <p className="text-sm font-bold mb-1" style={{ color: '#2d2d2d' }}>Belum ada data untuk periode ini</p>
                  <p className="text-xs" style={{ color: '#6b7280' }}>
                    Upload & petakan laporan {activeClient.name} lebih dulu — angka dashboard dihitung dari laporan yang sudah dipetakan ke COA.
                  </p>
                </div>
              </div>
            ) : (
              <div className="p-4 sm:p-6 w-full mx-auto space-y-5">

                {/* 1. KPI Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                  {[
                    { label: 'Total Revenue', value: formatRupiahShort(totalRevenue), avgLabel: formatRupiahShort(avg(totalRevenue)), changePercent: revenueChange, variant: 'lime' as const, icon: DollarSign },
                    { label: 'Net Profit', value: formatRupiahShort(totalNetProfit), avgLabel: formatRupiahShort(avg(totalNetProfit)), changePercent: profitChange, variant: 'lilac' as const, icon: TrendingUp },
                    { label: 'Fixed Cost', value: formatRupiahShort(fixedCostTotal), avgLabel: formatRupiahShort(avg(fixedCostTotal)), variant: 'lilac' as const, icon: Monitor },
                    { label: 'Variable Cost', value: formatRupiahShort(varCostTotal), avgLabel: formatRupiahShort(avg(varCostTotal)), variant: 'lime' as const, icon: Activity },
                  ].map((kpi, i) => (
                    <div key={kpi.label} className="animate-slide-up" style={{ animationDelay: `${i * 75}ms` }}>
                      <KPICard {...kpi} />
                    </div>
                  ))}
                </div>

                {/* 2. Revenue Trend */}
                <div className="ng-rise" style={{ animationDelay: '150ms' }}>
                  <RevenueTrendChart data={monthly12} year={year} periodLabel={periodLabel} />
                </div>

                {/* 3. P&L Overview */}
                <div className="ng-rise" style={{ animationDelay: '220ms' }}>
                  <PnlOverviewChart data={pnlOverview} year={year} />
                </div>

                {/* 4. Expense Breakdown + Top Receipts */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 ng-rise" style={{ animationDelay: '290ms' }}>
                  <ExpenseBreakdownDonut data={expenseBreakdown} totalExpenses={totalExpenses} periodLabel={periodLabel} />
                  <div className="ng-card-lift rounded-3xl p-6" style={{ background: 'white', boxShadow: '0 4px 20px rgba(0,0,0,0.05)', border: '1px solid #f0f0f0' }}>
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: 'linear-gradient(135deg, #7dd3fc 0%, #38bdf8 100%)' }}>
                        <Trophy className="w-4 h-4" style={{ color: '#1a1a1a' }} />
                      </div>
                      <div>
                        <h3 className="text-base font-bold" style={{ color: '#2d2d2d' }}>Top 5 Sumber Penerimaan</h3>
                        <p className="text-xs" style={{ color: '#6b7280' }}>Kontribusi terbesar pada periode ini</p>
                      </div>
                    </div>
                    {topReceipts.length > 0 ? (
                      <TopReceiptsBubble items={topReceipts} total={totalRevenue} compact />
                    ) : (
                      <p className="text-xs py-8 text-center" style={{ color: '#9ca3af' }}>Belum ada baris pendapatan terpetakan.</p>
                    )}
                  </div>
                </div>

                {/* 5. Balance Sheet Health */}
                {balanceSheet ? (
                  <div className="ng-rise" style={{ animationDelay: '360ms' }}>
                    <BalanceSheetHealth balanceSheet={balanceSheet} workingCapitalMetrics={workingCapital} />
                  </div>
                ) : (
                  <div className="ng-rise rounded-3xl p-6" style={{ animationDelay: '360ms', background: 'white', border: '1px solid #f0f0f0' }}>
                    <p className="text-sm font-bold mb-1" style={{ color: '#2d2d2d' }}>Kesehatan Neraca</p>
                    <p className="text-xs" style={{ color: '#9ca3af' }}>Belum ada laporan Neraca terpetakan untuk periode ini.</p>
                  </div>
                )}

                {/* 6. Cash Flow Waterfall */}
                {cashflow.length > 0 && (
                  <div className="ng-rise" style={{ animationDelay: '430ms' }}>
                    <CashflowWaterfallChart data={cashflow} year={year} />
                  </div>
                )}

              </div>
            )}
          </main>
        </div>
      </div>
  )
}
