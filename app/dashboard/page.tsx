'use client'

import { useState } from 'react'
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
  ArrowUpRight, ArrowDownRight, Trophy,
} from 'lucide-react'

// ============================================================
// MOCK DATA
// ============================================================

const MONTHLY_DATA = [
  { month: 'Jan', revenue: 485086931, netProfit: 127635672, grossProfit: 284632728, expenses: 153404036 },
  { month: 'Feb', revenue: 512340000, netProfit: 141200000, grossProfit: 298500000, expenses: 157300000 },
  { month: 'Mar', revenue: 498750000, netProfit: 118900000, grossProfit: 275600000, expenses: 156700000 },
  { month: 'Apr', revenue: 567890000, netProfit: 165400000, grossProfit: 320100000, expenses: 154700000 },
  { month: 'May', revenue: 601230000, netProfit: 178300000, grossProfit: 342800000, expenses: 164500000 },
  { month: 'Jun', revenue: 589450000, netProfit: 169800000, grossProfit: 335200000, expenses: 165400000 },
  { month: 'Jul', revenue: null, netProfit: null, grossProfit: null, expenses: null },
  { month: 'Aug', revenue: null, netProfit: null, grossProfit: null, expenses: null },
  { month: 'Sep', revenue: null, netProfit: null, grossProfit: null, expenses: null },
  { month: 'Oct', revenue: null, netProfit: null, grossProfit: null, expenses: null },
  { month: 'Nov', revenue: null, netProfit: null, grossProfit: null, expenses: null },
  { month: 'Dec', revenue: null, netProfit: null, grossProfit: null, expenses: null },
]

const EXPENSE_BREAKDOWN = [
  { name: 'HPP', value: 200454203, color: '#daf163' },
  { name: 'Biaya Variabel', value: 124303362, color: '#bbb3f3' },
  { name: 'Biaya Fixed', value: 29100674, color: '#fdba74' },
  { name: 'Lain-lain', value: 3593020, color: '#7dd3fc' },
]

const PNL_OVERVIEW = MONTHLY_DATA.filter(d => d.revenue !== null).map(d => ({
  month: d.month,
  pendapatan: d.revenue,
  biaya: d.expenses,
}))

const BALANCE_SHEET = {
  totalAset: 1466658050,
  aktivaLancar: 1397767344,
  aktivaTetap: 63690706,
  aktivaLainnya: 5200000,
  totalHutang: 42142100,
  totalModal: 1419315950,
}

const WORKING_CAPITAL_METRICS = [
  { label: 'Kas & Setara Kas', value: 75254490, icon: 'cash' },
  { label: 'Piutang Usaha', value: 66794049, icon: 'receivable' },
  { label: 'Biaya Dibayar Dimuka', value: 28390782, icon: 'prepaid' },
  { label: 'Persediaan', value: 1214633693, icon: 'inventory' },
]

const CASHFLOW_DATA = [
  { month: 'Jan', operating: 68680558, investing: -4700000, funding: 109500 },
  { month: 'Feb', operating: 72100000, investing: -2100000, funding: 0 },
  { month: 'Mar', operating: 61500000, investing: -1800000, funding: 5000000 },
  { month: 'Apr', operating: 89200000, investing: -3200000, funding: 0 },
  { month: 'May', operating: 95600000, investing: -6500000, funding: 0 },
  { month: 'Jun', operating: 87300000, investing: -2900000, funding: 0 },
]

// Top 5 sumber penerimaan bulan berjalan — per channel penjualan
const TOP_RECEIPTS = [
  { name: 'Penjualan Shopee', amount: 245000000 },
  { name: 'Penjualan Tiktok', amount: 156000000 },
  { name: 'Penjualan Offline', amount: 98000000 },
  { name: 'Website Sendiri', amount: 62000000 },
  { name: 'Marketplace Lain', amount: 28000000 },
]

// ============================================================
// DERIVED CALCULATIONS
// ============================================================

const monthsWithData = MONTHLY_DATA.filter(d => d.revenue !== null)
const totalRevenue = monthsWithData.reduce((sum, d) => sum + (d.revenue ?? 0), 0)
const totalNetProfit = monthsWithData.reduce((sum, d) => sum + (d.netProfit ?? 0), 0)

const totalOpExp = monthsWithData.reduce((sum, d) => sum + (d.expenses ?? 0), 0)
const fixedCostTotal  = Math.round(totalOpExp * 0.185)
const varCostTotal    = Math.round(totalOpExp * 0.792)
const avgFixedCost    = Math.round(fixedCostTotal / monthsWithData.length)
const avgVarCost      = Math.round(varCostTotal / monthsWithData.length)

const lastMonth = monthsWithData[monthsWithData.length - 1]
const prevMonth = monthsWithData[monthsWithData.length - 2]
const revenueChange = ((lastMonth.revenue! - prevMonth.revenue!) / prevMonth.revenue!) * 100
const profitChange = ((lastMonth.netProfit! - prevMonth.netProfit!) / prevMonth.netProfit!) * 100

const totalExpenses = EXPENSE_BREAKDOWN.reduce((sum, e) => sum + e.value, 0)

// ============================================================
// KPI CARD — Inline (responsive grid)
// ============================================================

function KPICard({
  label,
  value,
  avgLabel,
  changePercent,
  variant,
  icon: Icon,
}: {
  label: string
  value: string
  avgLabel?: string
  changePercent?: number
  variant: 'lime' | 'lilac'
  icon: React.ElementType
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
        <p className="text-xs font-medium mb-1" style={{ color: 'rgba(26,26,26,0.65)' }}>{label}</p>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: '6px' }}>
          <p className="text-2xl font-bold" style={{ color: 'var(--color-accent-primary-fg)', margin: 0 }}>{value}</p>
          {avgLabel && (
            <p style={{ fontSize: '10px', color: 'rgba(26,26,26,0.45)', marginBottom: '3px' }}>
              avg {avgLabel}/bln
            </p>
          )}
        </div>
        {changePercent !== undefined && (
          <div className="flex items-center gap-1">
            {isPositive ? <ArrowUpRight className="w-3 h-3" style={{ color: 'var(--color-accent-primary-fg)' }} /> : <ArrowDownRight className="w-3 h-3" style={{ color: 'var(--color-accent-primary-fg)' }} />}
            <span className="text-xs font-semibold" style={{ color: 'var(--color-accent-primary-fg)' }}>{Math.abs(changePercent).toFixed(1)}%</span>
            <span className="text-xs" style={{ color: 'rgba(26,26,26,0.55)' }}>vs bulan lalu</span>
          </div>
        )}
      </div>
    </div>
  )
}

// ============================================================
// MAIN PAGE
// ============================================================

export default function DashboardPage() {
  const { activeClient, isLoaded } = useRequireClient()
  const [dashboardDateRange, setDashboardDateRange] = useState<{ from: Date | undefined; to: Date | undefined } | undefined>({
    from: new Date(2026, 0, 1),
    to: new Date(2026, 5, 30),
  })

  if (!isLoaded || !activeClient) return null

  return (
    <div className="flex-1 p-3 min-w-0 overflow-hidden">
      <div className="h-full rounded-3xl overflow-hidden flex flex-col" style={{ background: 'white', boxShadow: '0 8px 40px rgb(0,0,0,0.4)' }}>

          {/* Header */}
          <div className="flex-shrink-0 px-4 sm:px-6 py-5 border-b flex items-center justify-between" style={{ borderColor: '#f0f0f0' }}>
            <div>
              <h1 className="text-xl font-bold" style={{ color: '#2d2d2d' }}>Dashboard</h1>
              <p className="text-sm mt-0.5" style={{ color: '#6b7280' }}>
                {activeClient.name} · Ringkasan performa keuangan
              </p>
            </div>
            <div style={{ width: '280px' }} className="hidden sm:block">
              <DateRangePicker value={dashboardDateRange} onChange={setDashboardDateRange} placeholder="Pilih periode" />
            </div>
          </div>

          {/* Scrollable content */}
          <main className="flex-1 overflow-y-auto" style={{ background: '#f8f8f8' }}>
            <div className="p-4 sm:p-6 w-full mx-auto space-y-5">

              {/* 1. KPI Cards — responsive: 1 → 2 → 4 columns, stagger entrance */}
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                {[
                  { label: 'Total Revenue (YTD)', value: formatRupiahShort(totalRevenue), avgLabel: formatRupiahShort(Math.round(totalRevenue / monthsWithData.length)), changePercent: revenueChange, variant: 'lime' as const, icon: DollarSign },
                  { label: 'Net Profit (YTD)', value: formatRupiahShort(totalNetProfit), avgLabel: formatRupiahShort(Math.round(totalNetProfit / monthsWithData.length)), changePercent: profitChange, variant: 'lilac' as const, icon: TrendingUp },
                  { label: 'Fixed Cost (YTD)', value: formatRupiahShort(fixedCostTotal), avgLabel: formatRupiahShort(avgFixedCost), variant: 'lilac' as const, icon: Monitor },
                  { label: 'Variable Cost (YTD)', value: formatRupiahShort(varCostTotal), avgLabel: formatRupiahShort(avgVarCost), variant: 'lime' as const, icon: Activity },
                ].map((kpi, i) => (
                  <div key={kpi.label} className="animate-slide-up" style={{ animationDelay: `${i * 75}ms` }}>
                    <KPICard {...kpi} />
                  </div>
                ))}
              </div>

              {/* 2. Revenue Trend */}
              <div className="ng-rise" style={{ animationDelay: '150ms' }}>
                <RevenueTrendChart data={MONTHLY_DATA} totalRevenue={totalRevenue} monthsCount={monthsWithData.length} />
              </div>

              {/* 3. P&L Overview */}
              <div className="ng-rise" style={{ animationDelay: '220ms' }}>
                <PnlOverviewChart data={PNL_OVERVIEW} />
              </div>

              {/* 4. Expense Breakdown + Balance Sheet — side-by-side */}
              <div className="grid grid-cols-1 lg:grid-cols-[2fr_3fr] gap-5 ng-rise" style={{ animationDelay: '290ms' }}>
                <ExpenseBreakdownDonut data={EXPENSE_BREAKDOWN} totalExpenses={totalExpenses} />
                <BalanceSheetHealth balanceSheet={BALANCE_SHEET} workingCapitalMetrics={WORKING_CAPITAL_METRICS} />
              </div>

              {/* 5. Top 5 Sumber Penerimaan — komposisi penerimaan, berdekatan dengan Expense Breakdown */}
              <div
                className="ng-card-lift rounded-3xl p-6 ng-rise"
                style={{ animationDelay: '360ms', background: 'white', boxShadow: '0 4px 20px rgba(0,0,0,0.05)', border: '1px solid #f0f0f0' }}
              >
                <div className="flex items-center gap-3 mb-4">
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                    style={{ background: 'linear-gradient(135deg, #7dd3fc 0%, #38bdf8 100%)' }}
                  >
                    <Trophy className="w-4 h-4" style={{ color: '#1a1a1a' }} />
                  </div>
                  <div>
                    <h3 className="text-base font-bold" style={{ color: '#2d2d2d' }}>Top 5 Sumber Penerimaan</h3>
                    <p className="text-xs" style={{ color: '#6b7280' }}>Kontribusi terbesar bulan berjalan</p>
                  </div>
                </div>
                <TopReceiptsBubble items={TOP_RECEIPTS} />
              </div>

              {/* 6. Cash Flow Waterfall */}
              <div className="ng-rise" style={{ animationDelay: '430ms' }}>
                <CashflowWaterfallChart data={CASHFLOW_DATA} />
              </div>

            </div>
          </main>
        </div>
      </div>
  )
}