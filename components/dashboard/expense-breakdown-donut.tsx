'use client'

import {
  PieChart, Pie, Cell,
  Tooltip, ResponsiveContainer,
} from 'recharts'
import { PieTooltip, formatRupiahShort } from './dashboard-utils'
import { PieChart as PieChartIcon } from 'lucide-react'

interface ExpenseItem {
  name: string
  value: number
  color: string
}

interface ExpenseBreakdownDonutProps {
  data: ExpenseItem[]
  totalExpenses: number
  /** Rentang periode data aktual, mis. "Jan–Jun 2026". Komposisi ini agregat
   *  SELURUH periode terpilih — dulu salah tertulis "Bulan Januari 2026". */
  periodLabel: string
}

export function ExpenseBreakdownDonut({ data, totalExpenses, periodLabel }: ExpenseBreakdownDonutProps) {
  return (
    <div
      className="ng-card-lift rounded-3xl p-6"
      style={{ background: 'white', boxShadow: '0 4px 20px rgba(0,0,0,0.05)', border: '1px solid #f0f0f0' }}
    >
      <div className="flex items-center gap-3 mb-4">
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ background: 'linear-gradient(135deg, #bbb3f3 0%, #a5b4fc 100%)' }}
        >
          <PieChartIcon className="w-4 h-4" style={{ color: '#1a1a1a' }} />
        </div>
        <div>
          <h3 className="text-base font-bold" style={{ color: '#2d2d2d' }}>Komposisi Biaya</h3>
          <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{periodLabel}</p>
        </div>
      </div>
      <div className="flex items-center gap-6">
        <div style={{ width: '140px', height: '140px', flexShrink: 0, position: 'relative' }}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={data} dataKey="value" innerRadius={45} outerRadius={68} paddingAngle={4} cornerRadius={4}>
                {data.map((entry, i) => (
                  <Cell key={i} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip wrapperStyle={{ zIndex: 50 }} content={<PieTooltip total={totalExpenses} totalLabel="total biaya" />} />
            </PieChart>
          </ResponsiveContainer>
          <div className="absolute inset-0 flex flex-col items-center justify-center" style={{ pointerEvents: 'none' }}>
            <p className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>Total</p>
            <p className="text-xs font-bold" style={{ color: '#2d2d2d' }}>{formatRupiahShort(totalExpenses)}</p>
          </div>
        </div>
        <div className="flex-1 space-y-2.5">
          {data.map(item => (
            <div key={item.name} className="flex items-center gap-2">
              <span className="rounded-full flex-shrink-0" style={{ width: '8px', height: '8px', background: item.color }} />
              <span className="text-xs flex-1" style={{ color: 'var(--color-text-muted)' }}>{item.name}</span>
              <span className="text-xs font-semibold" style={{ color: '#2d2d2d' }}>
                {((item.value / totalExpenses) * 100).toFixed(0)}%
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}