'use client'

// ============================================================
// FORMAT HELPERS
// ============================================================

export const formatRupiahShort = (value: number) => {
  if (value >= 1000000000) return `Rp ${(value / 1000000000).toFixed(1)}M`
  if (value >= 1000000) return `Rp ${(value / 1000000).toFixed(0)}jt`
  return `Rp ${value.toLocaleString('id-ID')}`
}

export const formatRupiahFull = (value: number) => `Rp ${value.toLocaleString('id-ID')}`

// ============================================================
// CUSTOM TOOLTIP — light bg tooltip
// ============================================================

export function CustomTooltip({ active, payload, label, formatter }: {
  active?: boolean
  payload?: Array<{ value: number; color?: string; name?: string }>
  label?: string
  formatter?: (v: number) => string
}) {
  if (!active || !payload || !payload.length) return null
  return (
    <div
      className="rounded-xl px-3 py-2"
      style={{ background: '#222124', boxShadow: '0 8px 24px rgba(0,0,0,0.3)' }}
    >
      <p className="text-xs font-medium mb-1" style={{ color: 'rgba(255,255,255,0.5)' }}>{label} 2026</p>
      {payload.map((entry, i) => (
        <p key={i} className="text-sm font-semibold" style={{ color: entry.color || 'white' }}>
          {entry.name && <span className="font-normal opacity-60 mr-1">{entry.name}:</span>}
          {formatter ? formatter(entry.value) : entry.value}
        </p>
      ))}
    </div>
  )
}

// ============================================================
// DARK TOOLTIP — dark bg tooltip
// ============================================================

export function DarkTooltip({ active, payload, label, formatter }: {
  active?: boolean
  payload?: Array<{ value: number; color?: string; name?: string }>
  label?: string
  formatter?: (v: number) => string
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
          {entry.name && <span className="font-normal mr-1" style={{ color: 'rgba(255,255,255,0.5)' }}>{entry.name}:</span>}
          {formatter ? formatter(entry.value) : entry.value}
        </p>
      ))}
    </div>
  )
}