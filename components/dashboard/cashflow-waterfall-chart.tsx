'use client'

import {
  BarChart, Bar, XAxis, YAxis,
  Tooltip, ResponsiveContainer, ReferenceLine, Cell,
} from 'recharts'
import { ArrowLeftRight } from 'lucide-react'
import { DarkTooltip } from './dashboard-utils'
import { useRupiah } from '@/lib/preferences-context'

interface CashflowItem {
  month: string
  operating: number
  investing: number
  funding: number
}

interface CashflowWaterfallChartProps {
  data: CashflowItem[]
  /** Tahun dari periode yang dipilih — label tooltip. JANGAN hardcode. */
  year: number
}

export function CashflowWaterfallChart({ data, year }: CashflowWaterfallChartProps) {
  // Dulu ada formatter ringkas lokal di file ini yang mengeraskan 'Rp' + satuan
  // Indonesia. Sekarang dari lib/format.ts lewat useRupiah(), jadi setelan
  // Currency Format user akhirnya berpengaruh di sumbu & tooltip grafik ini.
  const { rupiahShort: formatRupiah } = useRupiah()
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
            { label: 'Funding', color: '#7dd3fc' },
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
            <Tooltip cursor={false} trigger="hover" content={<DarkTooltip year={year} formatter={formatRupiah} />} />
            <Bar dataKey="operating" name="Operating" fill="#daf163" radius={[8, 8, 8, 8]}>
              {data.map((_, index) => (
                <Cell key={`operating-${index}`} className="ng-bar-cell" />
              ))}
            </Bar>
            <Bar dataKey="investing" name="Investing" fill="#bbb3f3" radius={[8, 8, 8, 8]}>
              {data.map((_, index) => (
                <Cell key={`investing-${index}`} className="ng-bar-cell" />
              ))}
            </Bar>
            <Bar dataKey="funding" name="Funding" fill="#7dd3fc" radius={[8, 8, 8, 8]}>
              {data.map((_, index) => (
                <Cell key={`funding-${index}`} className="ng-bar-cell" />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}