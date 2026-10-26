'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import {
  Calendar,
  FileText,
  Upload,
  X,
  CheckCircle2,
  ArrowRight,
  Building2,
  BarChart3,
  BookOpen,
  ArrowLeftRight,
  Loader2,
  AlertCircle,
} from 'lucide-react'
import { DateRangePicker } from '@/components/date-range-picker'
import { useClient } from '@/lib/client-context'
import { AI_NONAKTIF, aiFeaturesEnabled } from '@/lib/ai-features'
import { ClientAvatar } from '@/components/client-avatar'

// Date → 'YYYY-MM-DD' dari komponen lokal (hindari geser hari akibat UTC).
const toYMD = (d: Date) => {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

interface DateRange {
  from: Date | undefined
  to: Date | undefined
}

// accentColor = warna BIDANG (border, tint, progress bar, ring fokus).
// accentText  = pasangan GELAP hue yang sama, khusus untuk TEKS & IKON —
// aksen mentah di atas putih cuma 1,25-1,93:1 (lime praktis tak terbaca).
// Konvensi ini sudah dipakai app di badge Settings & TONES ratio-card; kartu
// Upload satu-satunya yang belum ikut.
const REPORT_TYPES = [
  {
    id: 'pnl',
    label: 'Laba Rugi',
    sublabel: 'Profit & Loss Statement',
    description: 'Pendapatan, HPP, biaya operasional, dan laba bersih',
    Icon: BarChart3,
    accentColor: '#daf163',
    accentText: 'var(--color-accent-primary-text)',
    accentBg: '#f7fde8',
    accentBorder: '#d9f99d',
  },
  {
    id: 'neraca',
    label: 'Neraca',
    sublabel: 'Balance Sheet',
    description: 'Aktiva, hutang, dan modal perusahaan',
    Icon: BookOpen,
    accentColor: '#bbb3f3',
    accentText: 'var(--color-accent-secondary-text)',
    accentBg: '#f3f2ff',
    accentBorder: '#ddd6fe',
  },
  {
    id: 'cashflow',
    label: 'Arus Kas',
    sublabel: 'Cash Flow Statement',
    description: 'Aktivitas operasi, investasi, dan pendanaan',
    Icon: ArrowLeftRight,
    accentColor: '#7dd3fc',
    accentText: 'var(--color-accent-sky-text)',
    accentBg: '#f0f9ff',
    accentBorder: '#bae6fd',
  },
]

type ReportFile = {
  file: File
  status: 'ready' | 'uploading' | 'done' | 'error'
}

type UploadState = {
  pnl: ReportFile | null
  neraca: ReportFile | null
  cashflow: ReportFile | null
}

export function UploadSession({
  isProcessing,
  setIsProcessing,
}: {
  isProcessing: boolean
  setIsProcessing: (v: boolean) => void
}) {
  const { activeClient } = useClient()
  const router = useRouter()

  const [processError, setProcessError] = useState<string | null>(null)

  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: new Date(2026, 0, 1),
    to: new Date(2026, 0, 31),
  })

  const [uploads, setUploads] = useState<UploadState>({
    pnl: null,
    neraca: null,
    cashflow: null,
  })

  const [dragActive, setDragActive] = useState<string | null>(null)

  const fileRefs = {
    pnl: useRef<HTMLInputElement>(null),
    neraca: useRef<HTMLInputElement>(null),
    cashflow: useRef<HTMLInputElement>(null),
  }

  const handleFileSelect = (reportId: keyof UploadState, file: File) => {
    // Fase 3.1 hanya PDF (ekstraksi Gemini). CSV/Excel menyusul.
    const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
    if (!isPdf) {
      setProcessError('Fase ini hanya mendukung file PDF (CSV/Excel menyusul).')
      return
    }
    if (file.size > 25 * 1024 * 1024) {
      setProcessError('Ukuran file melebihi 25MB.')
      return
    }
    setProcessError(null)
    setUploads((prev) => ({
      ...prev,
      [reportId]: { file, status: 'ready' },
    }))
  }

  const handleDrag = (e: React.DragEvent, reportId: string, type: string) => {
    e.preventDefault()
    e.stopPropagation()
    if (type === 'enter' || type === 'over') setDragActive(reportId)
    else setDragActive(null)
  }

  const handleDrop = (e: React.DragEvent, reportId: keyof UploadState) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(null)
    const file = e.dataTransfer.files?.[0]
    if (file) handleFileSelect(reportId, file)
  }

  const removeFile = (reportId: keyof UploadState) => {
    setUploads((prev) => ({ ...prev, [reportId]: null }))
    if (fileRefs[reportId].current) fileRefs[reportId].current!.value = ''
  }

  const uploadedCount = Object.values(uploads).filter(Boolean).length
  const ekstraksiAktif = aiFeaturesEnabled('ekstraksiLaporan')
  const isReadyToProcess = ekstraksiAktif && activeClient && dateRange?.from && uploadedCount > 0

  const handleProcessSession = async () => {
    if (!activeClient || !dateRange?.from) return
    const from = dateRange.from
    const to = dateRange.to ?? dateRange.from

    const fd = new FormData()
    fd.append('clientId', activeClient.id)
    fd.append('periodStart', toYMD(from))
    fd.append('periodEnd', toYMD(to))
    if (uploads.pnl) fd.append('pnl', uploads.pnl.file)
    if (uploads.neraca) fd.append('neraca', uploads.neraca.file)
    if (uploads.cashflow) fd.append('cashflow', uploads.cashflow.file)

    setIsProcessing(true)
    setProcessError(null)
    try {
      const res = await fetch('/api/upload', { method: 'POST', body: fd })
      const payload = (await res.json().catch(() => null)) as { error?: string } | null
      if (!res.ok) {
        setProcessError(payload?.error ?? 'Gagal memproses laporan.')
        setIsProcessing(false)
        return
      }
      // Sukses → ke extraction-review untuk periode ini (klien dari context).
      router.push(`/extraction-review?start=${toYMD(from)}&end=${toYMD(to)}`)
    } catch {
      setProcessError('Terjadi kesalahan jaringan. Coba lagi.')
      setIsProcessing(false)
    }
  }

  return (
    <div className="space-y-6">

      {/* Section header */}
      <div>
        <h2 className="text-lg font-bold" style={{ color: 'var(--color-text-primary)' }}>
          Upload Session
        </h2>
        <p className="text-sm mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
          Pilih klien, tentukan periode, lalu upload laporan keuangan
        </p>
      </div>

      {/* Row 1: Client display (read-only) + Periode picker — responsive: 1 → 2 columns */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

        {/* Client — read-only display */}
        <div>
          <label
            className="block text-xs font-semibold mb-1.5 uppercase tracking-wide"
            style={{ color: 'var(--color-text-muted)' }}
          >
            Klien
          </label>
          <div
            className="flex items-center gap-3 px-4 py-3 rounded-2xl"
            style={{ background: '#f8f8f8', border: '1.5px solid #e5e5e5' }}
          >
            {activeClient && <ClientAvatar client={activeClient} size={32} rounded={12} fontSize={12} />}
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold truncate" style={{ color: '#2d2d2d' }}>
                {activeClient?.name}
              </div>
              <div className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                {activeClient?.type}
              </div>
            </div>
          </div>
        </div>

        {/* Periode picker */}
        <div>
          <label
            className="block text-xs font-semibold mb-1.5 uppercase tracking-wide"
            style={{ color: 'var(--color-text-muted)' }}
          >
            Periode Laporan
          </label>
          <DateRangePicker
            value={dateRange}
            onChange={setDateRange}
            placeholder="Pilih periode laporan"
          />
        </div>
      </div>

      {/* Row 2: Three upload cards — responsive: 1 → 3 columns */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {REPORT_TYPES.map((report, index) => {
          const reportId = report.id as keyof UploadState
          const uploadState = uploads[reportId]
          const isDragOver = dragActive === report.id
          const ref = fileRefs[reportId]

          return (
            <div
              key={report.id}
              className="animate-slide-up"
              style={{ animationDelay: `${index * 75}ms` }}
            >
              <input
                ref={ref}
                type="file"
                accept=".pdf,application/pdf"
                className="hidden"
                onChange={e => {
                  const file = e.target.files?.[0]
                  if (file) handleFileSelect(reportId, file)
                }}
              />

              <div
                role="button"
                tabIndex={0}
                aria-label={uploadState
                  ? `${report.label} diunggah: ${uploadState.file.name}. Tekan Enter untuk mengganti.`
                  : `Unggah ${report.label} — ${report.sublabel}. Drag & drop atau tekan Enter untuk browse.`
                }
                onDragEnter={e => handleDrag(e, report.id, 'enter')}
                onDragLeave={e => handleDrag(e, report.id, 'leave')}
                onDragOver={e => handleDrag(e, report.id, 'over')}
                onDrop={e => handleDrop(e, reportId)}
                onKeyDown={e => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    ref.current?.click()
                  }
                }}
                className="upload-card-hover overflow-hidden cursor-pointer select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-accent-primary) focus-visible:ring-offset-2"
                style={{
                  '--hover-accent': report.accentColor,
                  position: 'relative',
                  borderRadius: 20,
                  border: uploadState
                    ? `2px solid ${report.accentColor}`
                    : isDragOver
                      ? `2px dashed ${report.accentColor}`
                      : '2px dashed var(--color-border-subtle)',
                  background: 'white',
                  transform: isDragOver ? 'scale(1.02)' : 'scale(1)',
                  boxShadow: uploadState
                    ? `0 0 0 4px ${report.accentColor}22, 0 4px 20px rgba(0,0,0,0.08)`
                    : '0 2px 8px rgba(0,0,0,0.05)',
                  transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                } as React.CSSProperties}
                onClick={() => ref.current?.click()}
              >
                {/* Drag-over overlay — pulses independently of the card's own border transition */}
                {isDragOver && (
                  <div
                    aria-hidden="true"
                    className="ng-drag-pulse pointer-events-none"
                    style={{ position: 'absolute', inset: 0, borderRadius: 20, border: `2px dashed ${report.accentColor}` }}
                  />
                )}
                {/* Colored top accent strip — gives depth, keys each card to its report color */}
                <div
                  style={{
                    height: 4,
                    background: isDragOver || uploadState
                      ? report.accentColor
                      : `linear-gradient(90deg, ${report.accentColor}60, ${report.accentColor}20)`,
                    transition: 'background 0.2s',
                  }}
                />
                <div className="p-5">
                {/* Card header */}
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <div className="flex items-center gap-2 mb-0.5">
                      <div
                        className="flex items-center justify-center flex-shrink-0"
                        style={{ width: 36, height: 36, borderRadius: 10, background: `${report.accentColor}20` }}
                      >
                        <report.Icon style={{ width: 16, height: 16, color: report.accentText }} />
                      </div>
                      <span className="text-sm font-bold" style={{ color: 'var(--color-text-primary)' }}>
                        {report.label}
                      </span>
                    </div>
                    <p className="text-xs" style={{ color: report.accentText, fontWeight: 600 }}>
                      {report.sublabel}
                    </p>
                  </div>
                  {uploadState ? (
                    <div
                      key="done"
                      className="ng-pop w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0"
                      style={{ background: report.accentColor }}
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" style={{ color: 'var(--color-bg-main)' }} />
                    </div>
                  ) : (
                    <div
                      key="empty"
                      className="w-6 h-6 rounded-full border-2 flex-shrink-0"
                      style={{ borderColor: 'var(--color-border-subtle)' }}
                    />
                  )}
                </div>

                {/* Upload state */}
                {uploadState ? (
                  <div
                    key="file"
                    className="ng-chip-in rounded-2xl p-3 flex items-center gap-2.5"
                    style={{ background: 'var(--color-muted-bg)', border: `1px solid ${report.accentColor}55` }}
                  >
                    <FileText className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--color-text-muted)' }} />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold truncate" style={{ color: 'var(--color-text-primary)' }}>
                        {uploadState.file.name}
                      </p>
                      <p className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>
                        {(uploadState.file.size / 1024 / 1024).toFixed(2)} MB
                      </p>
                    </div>
                    <button
                      onClick={e => { e.stopPropagation(); removeFile(reportId) }}
                      aria-label={`Hapus file ${uploadState?.file.name ?? ''}`}
                      className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 transition-colors hover:bg-black/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-accent-primary) focus-visible:ring-offset-1"
                      style={{ background: 'rgba(0,0,0,0.08)' }}
                    >
                      <X className="w-3 h-3" style={{ color: 'var(--color-text-muted)' }} />
                    </button>
                  </div>
                ) : (
                  <div key="empty" className="text-center py-4">
                    <div
                      className={`w-10 h-10 rounded-2xl mx-auto mb-2.5 flex items-center justify-center ${!isDragOver ? 'ng-float' : ''}`}
                      style={{ background: isDragOver ? report.accentColor : '#f0f0f0' }}
                    >
                      <Upload
                        className="w-5 h-5"
                        style={{ color: isDragOver ? 'white' : 'var(--color-text-muted)' }}
                      />
                    </div>
                    <p className="text-xs font-medium mb-0.5" style={{ color: 'var(--color-text-primary)' }}>
                      {isDragOver ? 'Lepaskan di sini' : 'Drag & drop atau klik'}
                    </p>
                    <p className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>
                      PDF · Max 25 MB
                    </p>
                    {/* minHeight = 2 baris: deskripsi Laba Rugi memakan 2 baris,
                        Neraca & Arus Kas cuma 1 — reservasi tinggi 2 baris bikin
                        ketiga kartu sama tinggi tanpa ruang kosong menggantung. */}
                    <p className="text-[10px] mt-1" style={{ color: 'var(--color-text-muted)', lineHeight: 1.4, minHeight: '2.8em' }}>
                      {report.description}
                    </p>
                  </div>
                )}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Row 3: Session summary + Process button */}
      <div
        className="rounded-3xl p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
        style={{
          background: isReadyToProcess ? '#f9fff3' : '#f8f8f8',
          border: isReadyToProcess
            ? '1.5px solid var(--color-accent-primary)'
            : '1.5px solid var(--color-border-subtle)',
          transition: 'all 0.3s ease',
        }}
      >
        <div className="flex items-center gap-4 flex-wrap">
          {/* Client */}
          <div className="flex items-center gap-2">
            <div
              className="w-7 h-7 rounded-lg flex items-center justify-center"
              style={{ background: isReadyToProcess ? 'var(--color-accent-primary)' : '#e5e5e5' }}
            >
              <Building2 className="w-3.5 h-3.5" style={{ color: 'var(--color-bg-main)' }} />
            </div>
            <div>
              <p className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>Klien</p>
              <p className="text-xs font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                {activeClient?.name ?? '—'}
              </p>
            </div>
          </div>

          <div style={{ width: '1px', height: '28px', background: 'var(--color-border-subtle)' }} />

          {/* Periode */}
          <div className="flex items-center gap-2">
            <div
              className="w-7 h-7 rounded-lg flex items-center justify-center"
              style={{ background: isReadyToProcess ? 'var(--color-accent-primary)' : '#e5e5e5' }}
            >
              <Calendar className="w-3.5 h-3.5" style={{ color: 'var(--color-bg-main)' }} />
            </div>
            <div>
              <p className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>Periode</p>
              <p className="text-xs font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                {dateRange?.from
                  ? dateRange.to
                    ? `${dateRange.from.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })} – ${dateRange.to.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}`
                    : dateRange.from.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })
                  : 'Belum dipilih'
                }
              </p>
            </div>
          </div>

          <div style={{ width: '1px', height: '28px', background: 'var(--color-border-subtle)' }} />

          {/* File count */}
          <div className="flex items-center gap-2">
            <div
              className="w-7 h-7 rounded-lg flex items-center justify-center"
              style={{ background: isReadyToProcess ? 'var(--color-accent-primary)' : '#e5e5e5' }}
            >
              <FileText className="w-3.5 h-3.5" style={{ color: 'var(--color-bg-main)' }} />
            </div>
            <div>
              <p className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>File</p>
              <p className="text-xs font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                {uploadedCount} dari 3 diupload
              </p>
            </div>
          </div>
        </div>

        <button
          key={isReadyToProcess ? 'ready' : 'idle'}
          onClick={handleProcessSession}
          disabled={!isReadyToProcess || isProcessing}
          className="ng-chip-in flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-semibold flex-shrink-0 transition-all duration-300 enabled:hover:-translate-y-px enabled:active:scale-[.96] disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-(--color-accent-primary)"
          style={{
            background: isReadyToProcess && !isProcessing ? 'var(--color-accent-primary)' : '#e5e5e5',
            color: isReadyToProcess && !isProcessing ? 'var(--color-bg-main)' : 'var(--color-text-disabled)',
            boxShadow: isReadyToProcess && !isProcessing ? '0 4px 16px rgba(218,241,99,0.4)' : 'none',
          }}
        >
          {isProcessing ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Mengekstrak dengan AI…
            </>
          ) : (
            <>
              Proses Laporan
              <ArrowRight className="w-4 h-4" />
            </>
          )}
        </button>
      </div>

      {/* Error proses */}
      {(processError || !ekstraksiAktif) && (
        <div
          className="flex items-center gap-2 px-4 py-3 rounded-2xl animate-fade-in"
          style={{ background: '#fef2f2', border: '1px solid #fecaca' }}
        >
          <AlertCircle className="w-4 h-4 flex-shrink-0" style={{ color: '#dc2626' }} />
          <span className="text-xs font-medium" style={{ color: '#dc2626' }}>{processError ?? AI_NONAKTIF}</span>
        </div>
      )}

      {/* Info saat AI memproses */}
      {isProcessing && (
        <div
          className="flex items-center gap-2 px-4 py-3 rounded-2xl animate-fade-in"
          style={{ background: '#f7fde8', border: '1px solid #d9f99d' }}
        >
          <Loader2 className="w-4 h-4 flex-shrink-0 animate-spin" style={{ color: '#4d7c0f' }} />
          <span className="text-xs font-medium" style={{ color: '#4d7c0f' }}>
            AI sedang mengekstrak laporan — bisa memakan ~10–30 detik. Jangan tutup halaman ini.
          </span>
        </div>
      )}

    </div>
  )
}