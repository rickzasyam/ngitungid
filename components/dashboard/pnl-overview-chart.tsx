'use client'

import {
  BarChart, Bar, XAxis, YAxis,
  Tooltip, ResponsiveContainer, Cell,
} from 'recharts'
import { DarkTooltip, formatRupiahShort, formatRupiahFull } from './dashboard-utils'
import { BarChart3 } from 'lucide-react'

interface PnlOverviewItem {
  month: string
  pendapatan: number
  biaya: number
}

interface PnlOverviewChartProps {
  data: PnlOverviewItem[]
}

export function PnlOverviewChart({ data }: PnlOverviewChartProps) {
  return (
    <div
      className="rounded-3xl p-6"
      style={{ background: '#222124' }}
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{ background: 'linear-gradient(135deg, #daf163 0%, #c8e000 100%)' }}
          >
            <BarChart3 className="w-4 h-4" style={{ color: '#1a1a1a' }} />
          </div>
          <div>
            <h3 className="text-base font-bold" style={{ color: 'white' }}>Overview Laba Rugi</h3>
            <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.5)' }}>
              Pendapatan vs Total Biaya per bulan
            </p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <span className="rounded-full" style={{ width: '8px', height: '8px', background: '#daf163', display: 'inline-block' }} />
            <span className="text-xs" style={{ color: 'rgba(255,255,255,0.6)' }}>Pendapatan</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="rounded-full" style={{ width: '8px', height: '8px', background: '#bbb3f3', display: 'inline-block' }} />
            <span className="text-xs" style={{ color: 'rgba(255,255,255,0.6)' }}>Biaya</span>
          </div>
        </div>
      </div>
      <div style={{ height: 'clamp(180px, 20vh, 280px)' }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }} barGap={4} barCategoryGap="25%">
            <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: 'rgba(255,255,255,0.4)' }} />
            <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: 'rgba(255,255,255,0.4)' }} tickFormatter={formatRupiahShort} width={64} />
            <Tooltip cursor={false} trigger="hover" content={<DarkTooltip formatter={formatRupiahFull} />} />
            <Bar dataKey="pendapatan" name="Pendapatan" fill="#daf163" radius={[20, 20, 20, 20]} barSize={20}>
              {data.map((_, index) => (
                <Cell
                  key={`pendapatan-${index}`}
                  className="transition-all duration-200 cursor-pointer"
                  style={{ opacity: 1 }}
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
            <Bar dataKey="biaya" name="Biaya" fill="#bbb3f3" radius={[20, 20, 20, 20]} barSize={20}>
              {data.map((_, index) => (
                <Cell
                  key={`biaya-${index}`}
                  className="transition-all duration-200 cursor-pointer"
                  style={{ opacity: 1 }}
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