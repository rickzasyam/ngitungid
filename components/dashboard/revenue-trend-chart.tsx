'use client'

import {
  ComposedChart, Bar, Line, XAxis, YAxis,
  Tooltip, ResponsiveContainer,
} from 'recharts'
import { useRupiah } from '@/lib/preferences-context'
import { TrendingUp } from 'lucide-react'

interface MonthlyDataItem {
  month: string
  revenue: number | null
  netProfit: number | null
  grossProfit: number | null
  expenses: number | null
}

interface RevenueTrendChartProps {
  data: MonthlyDataItem[]
  /** Tahun dari periode yang dipilih — label tooltip. JANGAN hardcode. */
  year: number
  /** Rentang bulan data aktual + tahun, mis. "Jan–Jun 2026". */
  periodLabel: string
}

// Gaya sama dengan DarkTooltip ("Overview Laba Rugi"): label bulan & nama seri
// redup, HANYA nominalnya yang berwarna. Bedanya di sini format per-seri
// (Rupiah untuk bar, % untuk garis NPM).
function CombinedTooltip({ active, payload, label, year }: {
  active?: boolean
  payload?: Array<{ value: number; name?: string; color?: string }>
  label?: string
  year?: number
}) {
  const { rupiah: formatRupiahFull } = useRupiah()
  if (!active || !payload || !payload.length) return null

  return (
    <div
      className="rounded-xl px-3 py-2"
      style={{ background: '#2d2d2d', boxShadow: '0 8px 24px rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.08)' }}
    >
      <p className="text-xs font-medium mb-1.5" style={{ color: 'rgba(255,255,255,0.5)' }}>{label}{year ? ` ${year}` : ''}</p>
      {payload.map((entry, i) => {
        const isNpm = entry.name === 'NPM %'
        // Nominal berwarna warna seri (lime/lilac — kontras di latar gelap).
        // NPM% memakai warna GARIS #374151 yang gelap & nyaru di tooltip gelap,
        // jadi nilainya pakai abu terang khusus supaya terbaca.
        const valueColor = isNpm ? '#cbd5e1' : (entry.color || 'white')
        return (
          <p key={i} className="text-xs font-semibold">
            <span className="font-normal mr-1" style={{ color: 'rgba(255,255,255,0.5)' }}>{entry.name}:</span>
            <span style={{ color: valueColor }}>
              {isNpm ? `${entry.value}%` : formatRupiahFull(entry.value)}
            </span>
          </p>
        )
      })}
    </div>
  )
}

export function RevenueTrendChart({ data, year, periodLabel }: RevenueTrendChartProps) {
  const { rupiahShort: formatRupiahShort } = useRupiah()
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
      className="ng-card-lift rounded-3xl p-6"
      style={{ background: 'white', boxShadow: '0 4px 20px rgba(0,0,0,0.05)', border: '1px solid #f0f0f0' }}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{ background: 'linear-gradient(135deg, #daf163 0%, #c8e000 100%)' }}
          >
            <TrendingUp className="w-4 h-4" style={{ color: '#1a1a1a' }} />
          </div>
          <div>
            <h3 className="text-base font-bold" style={{ color: '#2d2d2d' }}>Tren Pendapatan &amp; Profitabilitas</h3>
            <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
              {periodLabel} · Skala kiri: Rupiah · Skala kanan: Margin %
            </p>
          </div>
        </div>
        {/* Legend */}
        <div className="flex items-center gap-4 flex-shrink-0">
          <div className="flex items-center gap-1.5">
            <span className="rounded-full" style={{ width: '10px', height: '10px', background: '#daf163', display: 'inline-block' }} />
            <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Revenue</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="rounded-full" style={{ width: '10px', height: '10px', background: '#bbb3f3', display: 'inline-block' }} />
            <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Net Profit</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span style={{ width: '16px', height: '2px', background: '#374151', display: 'inline-block', borderRadius: '1px' }} />
            <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>NPM %</span>
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
              tick={{ fontSize: 11, fill: 'var(--color-text-muted)' }}
            />
            <YAxis
              yAxisId="left"
              axisLine={false}
              tickLine={false}
              tickFormatter={formatRupiahShort}
              width={64}
              tick={{ fontSize: 11, fill: 'var(--color-text-muted)' }}
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
            <Tooltip cursor={false} content={<CombinedTooltip year={year} />} />
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
