'use client'

import { useState } from 'react'

interface ReceiptItem {
  name: string
  amount: number
}

interface TopReceiptsBubbleProps {
  items: ReceiptItem[]
  compact?: boolean
  // Total SEMUA pendapatan (net) — penyebut ratio %. Tanpa ini, fallback ke
  // jumlah item positif. Ratio lama salah karena dibagi item terbesar (top-1
  // selalu 100%); yang benar = nominal ÷ total pendapatan.
  total?: number
}

const RANK_STYLES = [
  { size: 144, top: 20, left: 70, bg: '#bbb3f3', text: '#222124', zIndex: 10, fontSize: 'text-xl' },
  { size: 112, top: 75, left: 165, bg: '#222124', text: '#ffffff', zIndex: 20, fontSize: 'text-lg' },
  { size: 96, top: 15, left: 195, bg: '#daf163', text: '#222124', zIndex: 30, fontSize: 'text-base' },
  { size: 80, top: 120, left: 90, bg: '#93c5fd', text: '#222124', zIndex: 40, fontSize: 'text-sm' },
  { size: 64, top: 135, left: 215, bg: '#f3f4f6', text: '#222124', zIndex: 50, fontSize: 'text-xs', border: '#e5e5e5' },
]

const COMPACT_FONT_MAP: Record<string, string> = {
  'text-xl': 'text-lg',
  'text-lg': 'text-base',
  'text-base': 'text-sm',
  'text-sm': 'text-xs',
  'text-xs': 'text-xs',
}

const formatCompact = (amount: number) => {
  if (amount >= 1000000000) return `${(amount / 1000000000).toFixed(1)}M`
  if (amount >= 1000000) return `${(amount / 1000000).toFixed(0)}jt`
  return amount.toLocaleString('id-ID')
}

// Warna aksen tooltip = warna bubble, kecuali bubble netral (gelap / abu terang)
// yang tidak terbaca di atas latar tooltip gelap → putih.
const tooltipAccent = (bg: string) => (bg === '#222124' || bg === '#f3f4f6' ? '#ffffff' : bg)

export function TopReceiptsBubble({ items, compact = false, total }: TopReceiptsBubbleProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)

  const positiveItems = items.filter(item => item.amount > 0)
  const sorted = [...positiveItems].sort((a, b) => b.amount - a.amount)
  const top5 = sorted.slice(0, 5)

  if (top5.length === 0) {
    return (
      <div className="flex items-center justify-center h-40">
        <p className="text-sm" style={{ color: '#9ca3af' }}>Belum ada data penerimaan</p>
      </div>
    )
  }

  // Penyebut ratio: total pendapatan (net) bila diberikan, kalau tidak jatuh ke
  // jumlah semua item positif. Bar & label sama-sama pakai ini supaya konsisten.
  const denom = total && total > 0 ? total : sorted.reduce((s, i) => s + i.amount, 0)
  const scale = compact ? 0.65 : 1
  const canvasWidth = compact ? 195 : 300
  const canvasHeight = compact ? 143 : 220

  return (
    <div className={compact ? 'flex flex-col gap-4' : 'flex items-center gap-8'}>
      {/* Bubble cluster canvas */}
      <div className="relative flex-shrink-0" style={{ width: `${canvasWidth}px`, height: `${canvasHeight}px` }}>
        {top5.map((item, index) => {
          const style = RANK_STYLES[index]
          const scaledSize = Math.round(style.size * scale)
          const scaledTop = Math.round(style.top * scale)
          const scaledLeft = Math.round(style.left * scale)
          const baseFont = compact ? (COMPACT_FONT_MAP[style.fontSize] || style.fontSize) : style.fontSize

          return (
            <div
              key={item.name}
              className="absolute rounded-full flex items-center justify-center border-2 transition-transform duration-300 hover:scale-105 hover:z-50"
              style={{
                width: `${scaledSize}px`,
                height: `${scaledSize}px`,
                top: `${scaledTop}px`,
                left: `${scaledLeft}px`,
                background: style.bg,
                borderColor: style.border ?? '#ffffff',
                zIndex: style.zIndex,
                boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
              }}
              onMouseEnter={() => setHoveredIndex(index)}
              onMouseLeave={() => setHoveredIndex(null)}
            >
              <span className={`font-bold ${baseFont}`} style={{ color: style.text }}>
                {formatCompact(item.amount)}
              </span>
            </div>
          )
        })}

        {/* Hover tooltip — aksen warna mengikuti bubble (konsisten dgn tooltip lain) */}
        {hoveredIndex !== null && (() => {
          const style = RANK_STYLES[hoveredIndex]
          const accent = tooltipAccent(style.bg)
          const item = top5[hoveredIndex]
          const pct = denom > 0 ? (item.amount / denom) * 100 : 0
          return (
            <div
              className="absolute rounded-xl px-3 py-2 pointer-events-none z-[100]"
              style={{
                top: `${style.top * scale - 58}px`,
                left: `${style.left * scale}px`,
                background: '#222124',
                boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
                whiteSpace: 'nowrap',
                borderTop: `2px solid ${accent}`,
              }}
            >
              <div className="flex items-center gap-1.5 mb-0.5">
                <span className="rounded-full flex-shrink-0" style={{ width: 7, height: 7, background: style.bg, border: style.border ? `1px solid ${style.border}` : 'none' }} />
                <p className="text-xs font-semibold" style={{ color: 'white' }}>{item.name}</p>
              </div>
              <p className="text-sm font-bold" style={{ color: accent }}>
                Rp {item.amount.toLocaleString('id-ID')}
              </p>
              <p className="text-[10px]" style={{ color: 'rgba(255,255,255,0.5)' }}>
                {pct.toFixed(1)}% dari total pendapatan
              </p>
            </div>
          )
        })()}
      </div>

      {/* Legend with percentage bars — % = nominal ÷ total pendapatan */}
      <div className={compact ? 'space-y-2' : 'flex-1 min-w-0 space-y-3'}>
        {top5.map((item, index) => {
          const style = RANK_STYLES[index]
          const pct = denom > 0 ? (item.amount / denom) * 100 : 0
          return (
            <div key={item.name} className="space-y-1">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className="rounded-full flex-shrink-0"
                    style={{
                      width: '8px',
                      height: '8px',
                      background: style.bg,
                      border: style.border ? `1px solid ${style.border}` : 'none',
                    }}
                  />
                  <span className="text-xs truncate" style={{ color: '#6b7280' }}>{item.name}</span>
                </div>
                <span className="text-xs font-semibold flex-shrink-0" style={{ color: '#222124' }}>
                  {pct.toFixed(1)}%
                </span>
              </div>
              <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ background: '#f0f0f0' }}>
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{ width: `${Math.min(100, pct)}%`, background: style.bg }}
                />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
