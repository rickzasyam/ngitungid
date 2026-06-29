'use client'

import {
  BarChart, Bar, XAxis, YAxis,
  Tooltip, ResponsiveContainer, ReferenceLine, Cell,
} from 'recharts'
import { formatRupiahShort } from './dashboard-utils'
import { ArrowLeftRight } from 'lucide-react'

interface CashflowItem {
  month: string
  operating: number
  investing: number
  funding: number
}

interface CashflowWaterfallChartProps {
  data: CashflowItem[]
}

// Unified short formatter: handles positive, negative, and zero consistently
function formatRupiah(value: number): string {
  const abs = Math.abs(value)
  let formatted: string
  if (abs >= 1_000_000_000) {
    formatted = `Rp ${(abs / 1_000_000_000).toFixed(0)} miliar`
  } else if (abs >= 1_000_000) {
    formatted = `Rp ${(abs / 1_000_000).toFixed(0)}jt`
  } else if (abs >= 1_000) {
    formatted = `Rp ${(abs / 1_000).toFixed(0)}rb`
  } else {
    formatted = `Rp ${abs}`
  }
  return value < 0 ? `-${formatted}` : formatted
}

function CashflowTooltip({ active, payload, label }: {
  active?: boolean
  payload?: Array<{ value: number; color?: string; name?: string }>
  label?: string
}) {
  if (!active || !payload || !payload.length) return null

  return (
    <div
      className="rounded-xl px-3 py-2"
      style={{ background: '#2d2d2d', boxShadow: '0 8px 24px rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.1)' }}
    >
      <p className="text-xs font-medium mb-1" style={{ color: 'rgba(255,255,255,0.5)' }}>{label} 2026</p>
      {payload.map((entry, i) => (
        <p key={i} className="text-sm font-semibold" style={{ color: entry.color || 'white' }}>
          {entry.name}: {formatRupiah(entry.value)}
        </p>
      ))}
    </div>
  )
}

export function CashflowWaterfallChart({ data }: CashflowWaterfallChartProps) {
  return (
    <div
      className="rounded-3xl p-6"
      style={{ background: '#222124' }}
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{ background: '#7dd3fc' }}
          >
            <ArrowLeftRight className="w-4 h-4" style={{ color: '#1a1a1a' }} />
          </div>
          <div>
            <h3 className="text-base font-bold" style={{ color: 'white' }}>Arus Kas per Aktivitas</h3>
            <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.5)' }}>
              Operating · Investing · Funding
            </p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          {[
            { label: 'Operating', color: '#daf163' },
            { label: 'Investing', color: '#bbb3f3' },
            { label: 'Funding', color: '#f20054' },
          ].map(l => (
            <div key={l.label} className="flex items-center gap-1.5">
              <span className="rounded-full" style={{ width: '8px', height: '8px', background: l.color, display: 'inline-block' }} />
              <span className="text-xs" style={{ color: 'rgba(255,255,255,0.6)' }}>{l.label}</span>
            </div>
          ))}
        </div>
      </div>
      <div style={{ height: 'clamp(180px, 20vh, 280px)' }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }} barSize={18} barGap={4} barCategoryGap="30%">
            <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: 'rgba(255,255,255,0.4)' }} />
            <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: 'rgba(255,255,255,0.4)' }} tickFormatter={formatRupiah} width={64} />
            <ReferenceLine y={0} stroke="#ffffff" strokeOpacity={0.25} />
            <Tooltip cursor={false} trigger="hover" content={<CashflowTooltip />} />
            <Bar dataKey="operating" name="Operating" fill="#daf163" radius={[8, 8, 8, 8]}>
              {data.map((_, index) => (
                <Cell
                  key={`operating-${index}`}
                  onMouseEnter={e => {
                    const el = e.target as SVGElement
                    el.style.opacity = '0.9'
                    el.style.stroke = 'white'
                    el.style.strokeWidth = '2'
                  }}
                  onMouseLeave={e => {
                    const el = e.target as SVGElement
                    el.style.opacity = '1'
                    el.style.stroke = 'none'
                    el.style.strokeWidth = '0'
                  }}
                />
              ))}
            </Bar>
            <Bar dataKey="investing" name="Investing" fill="#bbb3f3" radius={[8, 8, 8, 8]}>
              {data.map((_, index) => (
                <Cell
                  key={`investing-${index}`}
                  onMouseEnter={e => {
                    const el = e.target as SVGElement
                    el.style.opacity = '0.9'
                    el.style.stroke = 'white'
                    el.style.strokeWidth = '2'
                  }}
                  onMouseLeave={e => {
                    const el = e.target as SVGElement
                    el.style.opacity = '1'
                    el.style.stroke = 'none'
                    el.style.strokeWidth = '0'
                  }}
                />
              ))}
            </Bar>
            <Bar dataKey="funding" name="Funding" fill="#f20054" radius={[8, 8, 8, 8]}>
              {data.map((_, index) => (
                <Cell
                  key={`funding-${index}`}
                  onMouseEnter={e => {
                    const el = e.target as SVGElement
                    el.style.opacity = '0.9'
                    el.style.stroke = 'white'
                    el.style.strokeWidth = '2'
                  }}
                  onMouseLeave={e => {
                    const el = e.target as SVGElement
                    el.style.opacity = '1'
                    el.style.stroke = 'none'
                    el.style.strokeWidth = '0'
                  }}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}