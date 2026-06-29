'use client'

import { TrendingDown } from 'lucide-react'
import { formatRupiahShort } from './dashboard-utils'

interface ExpenseItem {
  name: string
  value: number
  color: string
}

interface LastMonthData {
  revenue: number
  netProfit: number
}

interface QuickInsightsProps {
  insights: {
    lastMonth: LastMonthData
    revenueChange: number
    profitChange: number
    avgNetMargin: number
    avgMonthlyRevenue: number
    avgMonthlyExpense: number
    totalExpenses: number
    topExpenses: ExpenseItem[]
  }
}

export function QuickInsights({ insights }: QuickInsightsProps) {
  const { lastMonth, revenueChange, profitChange, avgNetMargin, avgMonthlyRevenue, avgMonthlyExpense, totalExpenses, topExpenses } = insights

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

      {/* Card 1: Revenue bulan ini */}
      <div
        className="rounded-2xl p-4"
        style={{ background: 'white', border: '1px solid #f0f0f0', boxShadow: '0 2px 8px rgba(0,0,0,0.03)' }}
      >
        <p className="text-xs mb-1.5" style={{ color: '#9ca3af' }}>Revenue bulan ini</p>
        <div className="flex items-center justify-between">
          <p className="text-sm font-bold" style={{ color: '#2d2d2d' }}>
            {formatRupiahShort(lastMonth.revenue)}
          </p>
          <div className="flex items-center gap-0.5">
            <TrendingDown className="w-3 h-3" style={{ color: '#dc2626' }} />
            <span className="text-xs font-semibold" style={{ color: '#dc2626' }}>
              {Math.abs(revenueChange).toFixed(1)}%
            </span>
          </div>
        </div>
        <p className="text-[10px] mt-1" style={{ color: '#9ca3af' }}>vs bulan sebelumnya</p>
      </div>

      {/* Card 2: Profit bulan ini */}
      <div
        className="rounded-2xl p-4"
        style={{ background: 'white', border: '1px solid #f0f0f0', boxShadow: '0 2px 8px rgba(0,0,0,0.03)' }}
      >
        <p className="text-xs mb-1.5" style={{ color: '#9ca3af' }}>Profit bulan ini</p>
        <div className="flex items-center justify-between">
          <p className="text-sm font-bold" style={{ color: '#2d2d2d' }}>
            {formatRupiahShort(lastMonth.netProfit)}
          </p>
          <div className="flex items-center gap-0.5">
            <TrendingDown className="w-3 h-3" style={{ color: '#dc2626' }} />
            <span className="text-xs font-semibold" style={{ color: '#dc2626' }}>
              {Math.abs(profitChange).toFixed(1)}%
            </span>
          </div>
        </div>
        <p className="text-[10px] mt-1" style={{ color: '#9ca3af' }}>vs bulan sebelumnya</p>
      </div>

      {/* Card 3: Rata-rata margin */}
      <div
        className="rounded-2xl p-4"
        style={{ background: 'white', border: '1px solid #f0f0f0', boxShadow: '0 2px 8px rgba(0,0,0,0.03)' }}
      >
        <p className="text-xs mb-1.5" style={{ color: '#9ca3af' }}>Rata-rata margin 6 bulan</p>
        <p className="text-sm font-bold" style={{ color: '#2d2d2d' }}>
          {avgNetMargin.toFixed(1)}%
        </p>
        <p className="text-[10px] mt-1" style={{ color: '#9ca3af' }}>Net profit margin</p>
      </div>

      {/* Card 4: Burn vs Revenue Run-rate */}
      <div
        className="rounded-2xl p-4"
        style={{ background: 'white', border: '1px solid #f0f0f0', boxShadow: '0 2px 8px rgba(0,0,0,0.03)' }}
      >
        <p className="text-xs mb-2" style={{ color: '#9ca3af' }}>Burn vs Revenue Run-rate</p>
        <div className="space-y-1.5">
          <div>
            <div className="flex items-center justify-between mb-0.5">
              <span className="text-[10px]" style={{ color: '#6b7280' }}>Avg Revenue/bln</span>
              <span className="text-[10px] font-semibold" style={{ color: '#2d2d2d' }}>
                {formatRupiahShort(avgMonthlyRevenue)}
              </span>
            </div>
            <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ background: '#f0f0f0' }}>
              <div className="h-full rounded-full" style={{ width: '100%', background: '#daf163' }} />
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between mb-0.5">
              <span className="text-[10px]" style={{ color: '#6b7280' }}>Avg Expense/bln</span>
              <span className="text-[10px] font-semibold" style={{ color: '#2d2d2d' }}>
                {formatRupiahShort(avgMonthlyExpense)}
              </span>
            </div>
            <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ background: '#f0f0f0' }}>
              <div
                className="h-full rounded-full"
                style={{
                  width: `${(avgMonthlyExpense / avgMonthlyRevenue) * 100}%`,
                  background: '#bbb3f3',
                }}
              />
            </div>
          </div>
        </div>
        <p className="text-[10px] mt-2" style={{ color: '#9ca3af' }}>
          Rasio biaya: {((avgMonthlyExpense / avgMonthlyRevenue) * 100).toFixed(0)}% dari revenue
        </p>
      </div>

      {/* Card 5: Top 3 Kategori Biaya */}
      <div
        className="rounded-2xl p-4"
        style={{ background: 'white', border: '1px solid #f0f0f0', boxShadow: '0 2px 8px rgba(0,0,0,0.03)' }}
      >
        <p className="text-xs mb-2" style={{ color: '#9ca3af' }}>Top 3 Kategori Biaya</p>
        <div className="space-y-2">
          {topExpenses.map((item, idx) => (
            <div key={item.name} className="flex items-center gap-2">
              <span
                className="text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0"
                style={{ background: item.color, color: '#222124' }}
              >
                {idx + 1}
              </span>
              <span className="text-xs flex-1 truncate" style={{ color: '#6b7280' }}>{item.name}</span>
              <span className="text-xs font-semibold flex-shrink-0" style={{ color: '#2d2d2d' }}>
                {((item.value / totalExpenses) * 100).toFixed(0)}%
              </span>
            </div>
          ))}
        </div>
      </div>

    </div>
  )
}