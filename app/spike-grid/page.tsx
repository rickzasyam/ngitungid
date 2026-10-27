'use client'

// SPIKE S0 (MP §5.G, D46) — branch `spike/grid-library`, TIDAK di-merge.
// Grid dimuat tanpa SSR: virtualisasi butuh ukuran viewport, dan 20.000
// baris tidak boleh dirender di server.

import dynamic from 'next/dynamic'

const GridSpike = dynamic(() => import('./grid-spike'), {
  ssr: false,
  loading: () => <p className="text-sm">Memuat grid…</p>,
})

export default function SpikeGridPage() {
  return (
    <main className="flex-1 min-w-0 p-4 md:p-6 flex">
      <div
        className="flex-1 min-w-0 bg-white rounded-3xl p-4 md:p-6 flex flex-col gap-4"
        style={{ boxShadow: '0 4px 24px rgba(0,0,0,0.07), 0 1px 4px rgba(0,0,0,0.04)' }}
      >
        <header>
          <h1 className="text-xl font-semibold" style={{ color: 'var(--color-text-primary)' }}>
            Spike grid mutasi kas — react-data-grid 7.0.0-beta.63
          </h1>
          <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
            Data sintetis, tidak tersimpan. Uji: gulir 20.000 baris, ketik di Masuk/Keluar/Saldo, panah/Tab/Enter/Esc, tempel dari Excel/Google Sheets.
          </p>
        </header>
        <div className="flex-1 min-h-0 min-w-0 rounded-3xl p-3 flex" style={{ background: '#f8f8f8' }}>
          <GridSpike />
        </div>
      </div>
    </main>
  )
}
