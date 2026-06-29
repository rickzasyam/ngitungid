'use client'

import {
  PieChart, Pie, Cell,
  Tooltip, ResponsiveContainer,
} from 'recharts'
import { CustomTooltip, formatRupiahShort, formatRupiahFull } from './dashboard-utils'

interface ExpenseItem {
  name: string
  value: number
  color: string
}

interface ExpenseBreakdownDonutProps {
  data: ExpenseItem[]
  totalExpenses: number
}

export function ExpenseBreakdownDonut({ data, totalExpenses }: ExpenseBreakdownDonutProps) {
  return (
    <div
      className="rounded-3xl p-6"
      style={{ background: 'white', boxShadow: '0 4px 20px rgba(0,0,0,0.05)', border: '1px solid #f0f0f0' }}
    >
      <h3 className="text-base font-bold mb-0.5" style={{ color: '#2d2d2d' }}>Komposisi Biaya</h3>
      <p className="text-xs mb-4" style={{ color: '#6b7280' }}>Bulan Januari 2026</p>
      <div className="flex items-center gap-6">
        <div style={{ width: '140px', height: '140px', flexShrink: 0, position: 'relative' }}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={data} dataKey="value" innerRadius={45} outerRadius={68} paddingAngle={4} cornerRadius={4}>
                {data.map((entry, i) => (
                  <Cell key={i} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip wrapperStyle={{ zIndex: 50 }} content={<CustomTooltip formatter={formatRupiahFull} />} />
            </PieChart>
          </ResponsiveContainer>
          <div className="absolute inset-0 flex flex-col items-center justify-center" style={{ pointerEvents: 'none' }}>
            <p className="text-[10px]" style={{ color: '#9ca3af' }}>Total</p>
            <p className="text-xs font-bold" style={{ color: '#2d2d2d' }}>{formatRupiahShort(totalExpenses)}</p>
          </div>
        </div>
        <div className="flex-1 space-y-2.5">
          {data.map(item => (
            <div key={item.name} className="flex items-center gap-2">
              <span className="rounded-full flex-shrink-0" style={{ width: '8px', height: '8px', background: item.color }} />
              <span className="text-xs flex-1" style={{ color: '#6b7280' }}>{item.name}</span>
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