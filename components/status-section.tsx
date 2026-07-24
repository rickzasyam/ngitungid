'use client'

import { Activity, Check, Loader2 } from 'lucide-react'

// Status ekstraksi — mencerminkan state upload NYATA (prop `active` dari
// UploadSession), bukan lagi progress 64% hardcoded. Upload sinkron (satu POST
// /api/upload, ~10–30s) tak punya progress granular, jadi saat aktif tampilkan
// bar indeterminate (segmen bergerak), bukan angka palsu 0→100. Kartu berlatar
// soft-black untuk variasi warna di halaman upload.
const STEPS = [
  'Membaca PDF',
  'Deteksi tabel & baris',
  'Ekstraksi angka (Gemini AI)',
  'Skor keyakinan & auto-map COA',
]

export function StatusSection({ active = false }: { active?: boolean }) {
  return (
    <div className="space-y-6 rounded-3xl p-6" style={{ background: '#222124' }}>
      {/* Header */}
      <div className="flex items-center gap-3">
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ background: 'linear-gradient(135deg, #daf163 0%, #c8e000 100%)' }}
        >
          <Activity className="w-4 h-4" style={{ color: '#1a1a1a' }} />
        </div>
        <div>
          <h3 className="text-sm font-bold" style={{ color: 'white' }}>
            {active ? 'Mengekstrak dengan AI…' : 'Status Ekstraksi'}
          </h3>
          <p className="text-xs" style={{ color: 'rgba(255,255,255,0.5)' }}>
            {active ? 'AI menjalankan OCR, deteksi tabel, dan parsing' : 'Menunggu laporan diproses'}
          </p>
        </div>
      </div>

      {/* Progress bar — indeterminate saat aktif, track kosong saat idle */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium" style={{ color: 'rgba(255,255,255,0.7)' }}>Progress</span>
          <span className="text-xs font-semibold" style={{ color: active ? 'var(--color-accent-primary)' : 'rgba(255,255,255,0.35)' }}>
            {active ? 'Memproses…' : 'Idle'}
          </span>
        </div>
        <div className="relative w-full h-2 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
          {active && <div className="ng-indeterminate-bar" style={{ background: 'var(--color-accent-primary)' }} />}
        </div>
      </div>

      {/* Pipeline steps */}
      <div className="space-y-1">
        {STEPS.map((label) => (
          <div
            key={label}
            className="flex items-center gap-3 py-2.5 border-b last:border-0"
            style={{ borderColor: 'rgba(255,255,255,0.08)' }}
          >
            <div
              className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0"
              style={{
                background: active ? 'rgba(218,241,99,0.15)' : 'transparent',
                border: active ? 'none' : '2px solid rgba(255,255,255,0.2)',
              }}
            >
              {active
                ? <Loader2 className="w-3 h-3 animate-spin" style={{ color: 'var(--color-accent-primary)' }} />
                : <Check className="w-2.5 h-2.5" style={{ color: 'rgba(255,255,255,0.25)' }} />}
            </div>
            <span className="text-sm" style={{ color: active ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.4)' }}>
              {label}
            </span>
          </div>
        ))}
      </div>

      {!active && (
        <p className="text-[11px]" style={{ color: 'rgba(255,255,255,0.35)' }}>
          Pilih klien &amp; periode, unggah PDF, lalu tekan &ldquo;Proses Laporan&rdquo; untuk memulai ekstraksi.
        </p>
      )}
    </div>
  )
}
