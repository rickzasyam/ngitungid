'use client'

import { Sparkline } from './sparkline'

export type ToneKey = 'sehat' | 'perhatian' | 'risiko' | 'netral' | 'info'

export const TONES: Record<ToneKey, { fg: string; bg: string; dot: string; bar: string }> = {
  sehat:     { fg: '#15803d', bg: '#dcfce7', dot: '#16a34a', bar: '#16a34a' },
  perhatian: { fg: '#b45309', bg: '#fef3c7', dot: '#d97706', bar: '#f59e0b' },
  risiko:    { fg: '#b91c1c', bg: '#fee2e2', dot: '#dc2626', bar: '#ef4444' },
  netral:    { fg: '#475569', bg: '#eef2f7', dot: '#64748b', bar: '#64748b' },
  info:      { fg: '#1d4ed8', bg: '#dbeafe', dot: '#2563eb', bar: '#3b82f6' },
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
      onClick={onClick}
      style={{
        padding: 15, borderRadius: 13, background: '#fafafa',
        border: '1px solid #efefef', borderLeft: `3px solid ${t.bar}`,
        cursor: 'pointer', transition: 'all 0.15s',
      }}
      onMouseEnter={e => {
        const el = e.currentTarget as HTMLDivElement
        el.style.background = 'white'
        el.style.boxShadow = '0 4px 14px rgba(0,0,0,0.07)'
        el.style.transform = 'translateY(-1px)'
      }}
      onMouseLeave={e => {
        const el = e.currentTarget as HTMLDivElement
        el.style.background = '#fafafa'
        el.style.boxShadow = 'none'
        el.style.transform = 'none'
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: '#6b7280' }}>{label}</span>
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
