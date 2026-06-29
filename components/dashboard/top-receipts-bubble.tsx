'use client'

import { useState } from 'react'

interface ReceiptItem {
  name: string
  amount: number
}

interface TopReceiptsBubbleProps {
  items: ReceiptItem[]
  compact?: boolean
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

export function TopReceiptsBubble({ items, compact = false }: TopReceiptsBubbleProps) {
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

  const maxAmount = top5[0].amount
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

        {/* Hover tooltip */}
        {hoveredIndex !== null && (
          <div
            className="absolute rounded-xl px-3 py-2 pointer-events-none z-[100]"
            style={{
              top: `${RANK_STYLES[hoveredIndex].top * scale - 50}px`,
              left: `${RANK_STYLES[hoveredIndex].left * scale}px`,
              background: '#222124',
              boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
              whiteSpace: 'nowrap',
            }}
          >
            <p className="text-xs font-semibold" style={{ color: 'white' }}>
              {top5[hoveredIndex].name}
            </p>
            <p className="text-xs" style={{ color: 'rgba(255,255,255,0.6)' }}>
              Rp {top5[hoveredIndex].amount.toLocaleString('id-ID')}
            </p>
          </div>
        )}
      </div>

      {/* Legend with percentage bars */}
      <div className={compact ? 'space-y-2' : 'flex-1 min-w-0 space-y-3'}>
        {top5.map((item, index) => {
          const style = RANK_STYLES[index]
          const percentOfTop = (item.amount / maxAmount) * 100
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
                  {percentOfTop.toFixed(0)}%
                </span>
              </div>
              <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ background: '#f0f0f0' }}>
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{ width: `${percentOfTop}%`, background: style.bg }}
                />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}