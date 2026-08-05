'use client'

import { useRupiah } from '@/lib/preferences-context'

// ============================================================
// FORMAT HELPERS
// ============================================================

// Formatter Rupiah pindah ke lib/format.ts (satu rumah), terikat preferensi
// user lewat useRupiah(). Dulu dua const di sini mengeraskan 'Rp' + locale
// id-ID, jadi setelan Currency Format tidak pernah bisa berpengaruh.

// ============================================================
// PIE TOOLTIP — gaya "Top 5 Sumber Penerimaan": border-atas aksen warna
// segmen, dot + nama (putih), nominal berwarna aksen, lalu % dari total.
// Dipakai untuk chart NON-bar (donut). Tanpa label bulan/tahun — konsisten
// dgn tooltip Top 5.
// ============================================================

export function PieTooltip({ active, payload, total, totalLabel = 'total' }: {
  active?: boolean
  payload?: Array<{ value: number; color?: string; name?: string; payload?: { color?: string; name?: string } }>
  total?: number
  totalLabel?: string
}) {
  const { rupiah: formatRupiahFull } = useRupiah()
  if (!active || !payload || !payload.length) return null
  const entry = payload[0]
  const accent = entry.payload?.color || entry.color || '#daf163'
  const name = entry.name || entry.payload?.name || ''
  const pct = total && total > 0 ? (entry.value / total) * 100 : null
  return (
    <div
      className="rounded-xl px-3 py-2"
      style={{ background: '#222124', boxShadow: '0 8px 24px rgba(0,0,0,0.3)', borderTop: `2px solid ${accent}`, whiteSpace: 'nowrap' }}
    >
      <div className="flex items-center gap-1.5 mb-0.5">
        <span className="rounded-full flex-shrink-0" style={{ width: 7, height: 7, background: accent }} />
        <p className="text-xs font-semibold" style={{ color: 'white' }}>{name}</p>
      </div>
      <p className="text-sm font-bold" style={{ color: accent }}>{formatRupiahFull(entry.value)}</p>
      {pct !== null && (
        <p className="text-[10px]" style={{ color: 'rgba(255,255,255,0.5)' }}>{pct.toFixed(1)}% dari {totalLabel}</p>
      )}
    </div>
  )
}

// ============================================================
// DARK TOOLTIP — gaya "Overview Laba Rugi" untuk chart BER-BAR: label bulan
// & nama seri redup, HANYA nominalnya yang berwarna (warna seri).
// `year` WAJIB dialirkan dari periode yang dipilih — jangan pernah hardcode
// tahun di sini (dulu bug: selalu "2026" walau filter periode diganti).
// ============================================================

export function DarkTooltip({ active, payload, label, formatter, year }: {
  active?: boolean
  payload?: Array<{ value: number; color?: string; name?: string }>
  label?: string
  formatter?: (v: number) => string
  year?: number
}) {
  if (!active || !payload || !payload.length) return null
  return (
    <div
      className="rounded-xl px-3 py-2"
      style={{ background: '#2d2d2d', boxShadow: '0 8px 24px rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.1)' }}
    >
      <p className="text-xs font-medium mb-1" style={{ color: 'rgba(255,255,255,0.5)' }}>{label}{year ? ` ${year}` : ''}</p>
      {payload.map((entry, i) => (
        <p key={i} className="text-sm font-semibold" style={{ color: entry.color || 'white' }}>
          {entry.name && <span className="font-normal mr-1" style={{ color: 'rgba(255,255,255,0.5)' }}>{entry.name}:</span>}
          {formatter ? formatter(entry.value) : entry.value}
        </p>
      ))}
    </div>
  )
}