'use client'

import { EyeOff } from 'lucide-react'
import { Sparkline } from './sparkline'

export type ToneKey = 'sehat' | 'perhatian' | 'risiko' | 'netral' | 'info'

export const TONES: Record<ToneKey, { fg: string; bg: string; dot: string; bar: string }> = {
  sehat:     { fg: '#15803d', bg: '#dcfce7', dot: '#16a34a', bar: '#16a34a' },
  perhatian: { fg: '#b45309', bg: '#fef3c7', dot: '#d97706', bar: '#f59e0b' },
  risiko:    { fg: '#b91c1c', bg: '#fee2e2', dot: '#dc2626', bar: '#ef4444' },
  netral:    { fg: '#475569', bg: '#eef2f7', dot: '#64748b', bar: '#64748b' },
  info:      { fg: '#0369a1', bg: '#f0f9ff', dot: '#0284c7', bar: '#7dd3fc' },
}

// Label status generik dari tone (satu sumber). Dipilih supaya pill SELALU
// jujur & konsisten dgn warna dot — tanpa nuansa arah editorial lama
// ("Terlalu Tinggi"/"Konservatif") yang di-tune ke angka mock.
export const STATUS_LABEL: Record<ToneKey, string> = {
  sehat: 'Sehat',
  perhatian: 'Perlu Perhatian',
  risiko: 'Berisiko',
  netral: 'Stabil',
  info: 'Info',
}
export const statusFromTone = (t: ToneKey): string => STATUS_LABEL[t]

// Teks benchmark JUJUR sesuai model penilaian final (satu sumber, dipakai
// RatioCard di halaman & registry drawer). Absolut → nilai ambang THRESHOLDS;
// trend-based → arah ("Tren naik"/"Semakin pendek"); info-only → referensi.
// Keys = namespace kartu/drawer (cash/invturn/assetturn, bukan camelCase).
export const BENCHMARK: Record<string, string> = {
  cr: '1,2 – 2,0',
  qr: '> 1,0',
  cash: '> 0,3',
  der: '≤ 0,7',
  wc: 'Positif',
  ccc: 'Semakin pendek',
  roe: '> 15%',
  roa: '> 7%',
  gpm: 'Tren naik',
  npm: '> 10%',
  opm: 'Tren naik',
  dso: 'Semakin pendek',
  dio: 'Semakin pendek',
  dpo: '30 – 60 hari',
  invturn: '8 – 12×',
  assetturn: 'Tren naik',
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
  label, value, tone, status, formula, benchmark, trend, onClick, hiddenFromClient = false,
}: {
  label: string
  value: string
  tone: ToneKey
  status: string
  formula: string
  benchmark: string
  trend: number[]
  onClick: () => void
  /** Metrik ini dimatikan di Settings → tidak tampil ke klien. Hanya pernah
   *  true untuk staf: klien tidak melihat kartunya sama sekali. */
  hiddenFromClient?: boolean
}) {
  const t = TONES[tone]
  return (
    <div
      role="button"
      tabIndex={0}
      // Penanda ikut di accessible name, bukan cuma visual.
      aria-label={`${label}: ${value}, status ${status}.${hiddenFromClient ? ' Tidak tampil ke klien.' : ''} Buka detail analisis.`}
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
          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</span>
        </div>
        <Pill tone={tone} label={status} />
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 8 }}>
        <span style={{ fontSize: 26, fontWeight: 700, color: '#1f2430', letterSpacing: '-0.5px' }}>{value}</span>
        <Sparkline values={trend} color={t.bar} width={64} height={22} />
      </div>
      {/* Penanda "tidak tampil ke klien" — SENGAJA berupa pill, bukan meredupkan
          kartu. Angkanya justru sedang diperiksa akuntan, jadi menurunkan
          keterbacaannya berisiko salah baca; opacity juga akan bertabrakan
          dengan sistem tone (risiko/perhatian/sehat) yang sudah memakai warna —
          kartu "risiko" yang diredupkan terlihat seolah sudah beres. */}
      {hiddenFromClient && (
        <div style={{ display: 'flex', marginBottom: 6 }}>
          <span
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              fontSize: 9.5, fontWeight: 600, whiteSpace: 'nowrap',
              color: 'var(--color-text-muted)', background: 'var(--color-muted-bg)',
              padding: '2px 8px', borderRadius: 99,
            }}
          >
            <EyeOff aria-hidden="true" style={{ width: 10, height: 10, flexShrink: 0 }} />
            Tidak tampil ke klien
          </span>
        </div>
      )}
      <div style={{ borderTop: '1px solid #eee', marginBottom: 6 }} />
      <div style={{ fontFamily: 'monospace', fontSize: 9.5, color: 'var(--color-text-muted)', marginBottom: 4 }}>{formula}</div>
      <div style={{ fontSize: 10, color: 'var(--color-text-muted)', lineHeight: 1.4 }}>
        <span style={{ fontWeight: 700, color: t.fg }}>Benchmark {benchmark}.</span>
        {' '}Klik untuk detail analisis.
      </div>
    </div>
  )
}
