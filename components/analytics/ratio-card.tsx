'use client'

import { Sparkline } from './sparkline'

export type ToneKey = 'sehat' | 'perhatian' | 'risiko' | 'netral' | 'info'

export const TONES: Record<ToneKey, { fg: string; bg: string; dot: string; bar: string }> = {
  sehat:     { fg: '#15803d', bg: '#dcfce7', dot: '#16a34a', bar: '#16a34a' },
  perhatian: { fg: '#b45309', bg: '#fef3c7', dot: '#d97706', bar: '#f59e0b' },
  risiko:    { fg: '#b91c1c', bg: '#fee2e2', dot: '#dc2626', bar: '#ef4444' },
  netral:    { fg: '#475569', bg: '#eef2f7', dot: '#64748b', bar: '#64748b' },
  info:      { fg: '#0369a1', bg: '#f0f9ff', dot: '#0284c7', bar: '#7dd3fc' },
}

export function Pill({ tone, label }: { tone: ToneKey; label: string }) {
  const t = TONES[tone]
  return (
    <span
      style={{
        fontSize: 10, fontWeight: 700, color: t.fg, background: t.bg,
        padding: '2px 9px', borderRadius: 99, whiteSpace: 'nowrap',
      }}
    >
      {label}
    </span>
  )
}

export function RatioCard({
  label, value, tone, status, formula, benchmark, trend, onClick,
}: {
  label: string
  value: string
  tone: ToneKey
  status: string
  formula: string
  benchmark: string
  trend: number[]
  onClick: () => void
}) {
  const t = TONES[tone]
  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`${label}: ${value}, status ${status}. Buka detail analisis.`}
      onClick={onClick}
      onKeyDown={e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onClick()
        }
      }}
      className="ng-tile focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-accent-primary)"
      style={{
        padding: 15, borderRadius: 13,
        border: '1px solid #efefef',
        cursor: 'pointer',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
          <span aria-hidden="true" style={{ width: 7, height: 7, borderRadius: '50%', background: t.dot, flexShrink: 0 }} />
          <span style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</span>
        </div>
        <Pill tone={tone} label={status} />
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 8 }}>
        <span style={{ fontSize: 26, fontWeight: 700, color: '#1f2430', letterSpacing: '-0.5px' }}>{value}</span>
        <Sparkline values={trend} color={t.bar} width={64} height={22} />
      </div>
      <div style={{ borderTop: '1px solid #eee', marginBottom: 6 }} />
      <div style={{ fontFamily: 'monospace', fontSize: 9.5, color: '#9ca3af', marginBottom: 4 }}>{formula}</div>
      <div style={{ fontSize: 10, color: '#6b7280', lineHeight: 1.4 }}>
        <span style={{ fontWeight: 700, color: t.fg }}>Benchmark {benchmark}.</span>
        {' '}Klik untuk detail analisis.
      </div>
    </div>
  )
}
