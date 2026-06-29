'use client'

import {
  ComposedChart, Bar, Line, XAxis, YAxis,
  Tooltip, ResponsiveContainer,
} from 'recharts'
import { formatRupiahShort, formatRupiahFull } from './dashboard-utils'

interface MonthlyDataItem {
  month: string
  revenue: number | null
  netProfit: number | null
  grossProfit: number | null
  expenses: number | null
}

interface RevenueTrendChartProps {
  data: MonthlyDataItem[]
  totalRevenue: number
  monthsCount: number
}

function CombinedTooltip({ active, payload, label }: {
  active?: boolean
  payload?: Array<{ value: number; name?: string; color?: string }>
  label?: string
}) {
  if (!active || !payload || !payload.length) return null

  return (
    <div
      className="rounded-xl px-3 py-2"
      style={{ background: '#2d2d2d', boxShadow: '0 8px 24px rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.08)' }}
    >
      <p className="text-xs font-medium mb-1.5" style={{ color: 'rgba(255,255,255,0.5)' }}>{label} 2026</p>
      {payload.map((entry, i) => (
        <p key={i} className="text-xs font-semibold" style={{ color: entry.color || 'white' }}>
          {entry.name}:{' '}
          {entry.name === 'NPM %'
            ? `${entry.value}%`
            : formatRupiahFull(entry.value)}
        </p>
      ))}
    </div>
  )
}

export function RevenueTrendChart({ data, totalRevenue, monthsCount }: RevenueTrendChartProps) {
  const chartData = data
    .filter(d => d.revenue !== null)
    .map(d => ({
      month: d.month,
      revenue: d.revenue,
      netProfit: d.netProfit,
      netMargin: d.revenue ? Math.round((d.netProfit! / d.revenue) * 1000) / 10 : null,
    }))

  return (
    <div
      className="rounded-3xl p-6"
      style={{ background: 'white', boxShadow: '0 4px 20px rgba(0,0,0,0.05)', border: '1px solid #f0f0f0' }}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-base font-bold" style={{ color: '#2d2d2d' }}>Tren Pendapatan &amp; Profitabilitas</h3>
          <p className="text-xs mt-0.5" style={{ color: '#6b7280' }}>
            Jan–Jun 2026 · Skala kiri: Rupiah · Skala kanan: Margin %
          </p>
        </div>
        {/* Legend */}
        <div className="flex items-center gap-4 flex-shrink-0">
          <div className="flex items-center gap-1.5">
            <span className="rounded-full" style={{ width: '10px', height: '10px', background: '#daf163', display: 'inline-block' }} />
            <span className="text-xs" style={{ color: '#6b7280' }}>Revenue</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="rounded-full" style={{ width: '10px', height: '10px', background: '#bbb3f3', display: 'inline-block' }} />
            <span className="text-xs" style={{ color: '#6b7280' }}>Net Profit</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span style={{ width: '16px', height: '2px', background: '#374151', display: 'inline-block', borderRadius: '1px' }} />
            <span className="text-xs" style={{ color: '#6b7280' }}>NPM %</span>
          </div>
        </div>
      </div>

      <div style={{ height: 'clamp(180px, 22vh, 300px)' }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={chartData}
            margin={{ top: 28, right: 48, left: 0, bottom: 0 }}
            barGap={6}
            barCategoryGap="30%"
          >
            <XAxis
              dataKey="month"
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 11, fill: '#9ca3af' }}
            />
            <YAxis
              yAxisId="left"
              axisLine={false}
              tickLine={false}
              tickFormatter={formatRupiahShort}
              width={64}
              tick={{ fontSize: 11, fill: '#9ca3af' }}
            />
            <YAxis
              yAxisId="right"
              orientation="right"
              axisLine={false}
              tickLine={false}
              tickFormatter={(v) => `${v}%`}
              domain={[0, 31]}
              ticks={[10, 20, 30]}
              width={36}
              tick={{ fontSize: 11, fill: 'rgba(55,65,81,0.5)' }}
            />
            <Tooltip cursor={false} content={<CombinedTooltip />} />
            <Bar yAxisId="left" dataKey="revenue" name="Revenue" fill="#daf163" radius={[11, 11, 11, 11]} barSize={22} />
            <Bar yAxisId="left" dataKey="netProfit" name="Net Profit" fill="#bbb3f3" radius={[11, 11, 11, 11]} barSize={22} />
            <Line
              yAxisId="right"
              type="monotone"
              dataKey="netMargin"
              name="NPM %"
              stroke="#374151"
              strokeWidth={2}
              connectNulls={false}
              dot={{ r: 4, fill: '#374151', strokeWidth: 2, stroke: 'white' }}
              activeDot={{ r: 6, fill: '#374151' }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
