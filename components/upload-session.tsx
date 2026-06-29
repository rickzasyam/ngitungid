'use client'

import { useState, useRef } from 'react'
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
} from 'lucide-react'
import { DateRangePicker } from '@/components/date-range-picker'
import { useClient } from '@/lib/client-context'

interface DateRange {
  from: Date | undefined
  to: Date | undefined
}

const REPORT_TYPES = [
  {
    id: 'pnl',
    label: 'Laba Rugi',
    sublabel: 'Profit & Loss Statement',
    description: 'Pendapatan, HPP, biaya operasional, dan laba bersih',
    Icon: BarChart3,
    accentColor: '#daf163',
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

export function UploadSession() {
  const { activeClient, role } = useClient()

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
    const allowed = [
      'application/pdf',
      'text/csv',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ]
    const isAllowed =
      allowed.includes(file.type) ||
      file.name.endsWith('.pdf') ||
      file.name.endsWith('.csv') ||
      file.name.endsWith('.xlsx') ||
      file.name.endsWith('.xls')

    if (!isAllowed) {
      console.warn('[Upload] Invalid file type:', file.type)
      return
    }
    if (file.size > 25 * 1024 * 1024) {
      console.warn('[Upload] File too large:', file.size)
      return
    }

    setUploads((prev) => ({
      ...prev,
      [reportId]: { file, status: 'ready' },
    }))

    console.log(`[${reportId.toUpperCase()}] File selected:`, file.name)
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
  const isReadyToProcess = activeClient && dateRange?.from && uploadedCount > 0

  const handleProcessSession = () => {
    console.log('[Session] Processing:', {
      client: activeClient,
      dateRange,
      files: {
        pnl: uploads.pnl?.file.name,
        neraca: uploads.neraca?.file.name,
        cashflow: uploads.cashflow?.file.name,
      },
    })
    // TODO: POST to /api/upload/session
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
            <div
              className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: 'var(--color-accent-primary)' }}
            >
              <span className="text-xs font-bold" style={{ color: 'var(--color-bg-main)' }}>
                {activeClient?.name.charAt(0)}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold truncate" style={{ color: '#2d2d2d' }}>
                {activeClient?.name}
              </div>
              <div className="text-xs" style={{ color: '#6b7280' }}>
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
              style={{ animationDelay: `${index * 75}ms`, opacity: 0, animationFillMode: 'forwards' }}
            >
              <input
                ref={ref}
                type="file"
                accept=".pdf,.csv,.xlsx,.xls"
                className="hidden"
                onChange={e => {
                  const file = e.target.files?.[0]
                  if (file) handleFileSelect(reportId, file)
                }}
              />

              <div
                onDragEnter={e => handleDrag(e, report.id, 'enter')}
                onDragLeave={e => handleDrag(e, report.id, 'leave')}
                onDragOver={e => handleDrag(e, report.id, 'over')}
                onDrop={e => handleDrop(e, reportId)}
                className="rounded-3xl overflow-hidden cursor-pointer select-none"
                style={{
                  border: uploadState
                    ? '2px solid var(--color-accent-primary)'
                    : isDragOver
                      ? `2px dashed ${report.accentColor}`
                      : '2px dashed var(--color-border-subtle)',
                  background: uploadState
                    ? 'linear-gradient(135deg, #f9fff0 0%, #f3fde0 100%)'
                    : isDragOver
                      ? report.accentBg
                      : '#fafafa',
                  transform: isDragOver ? 'scale(1.02)' : 'scale(1)',
                  boxShadow: uploadState ? '0 0 0 4px rgba(218,241,99,0.12)' : 'none',
                  transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
                }}
                onClick={() => !uploadState && ref.current?.click()}
              >
                {/* Colored top accent strip */}
                <div
                  style={{
                    height: 3,
                    background: uploadState
                      ? 'linear-gradient(90deg, #daf163, #b8e000)'
                      : isDragOver
                        ? report.accentColor
                        : '#e5e5e5',
                    transition: 'background 0.2s',
                  }}
                />
                <div className="p-5">
                {/* Card header */}
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <div className="flex items-center gap-2 mb-0.5">
                      <div
                        className="w-7 h-7 rounded-xl flex items-center justify-center flex-shrink-0"
                        style={{ background: `${report.accentColor}1a` }}
                      >
                        <report.Icon className="w-4 h-4" style={{ color: report.accentColor }} />
                      </div>
                      <span className="text-sm font-bold" style={{ color: 'var(--color-text-primary)' }}>
                        {report.label}
                      </span>
                    </div>
                    <p className="text-xs" style={{ color: report.accentColor, fontWeight: 500 }}>
                      {report.sublabel}
                    </p>
                  </div>
                  {uploadState ? (
                    <div
                      className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0"
                      style={{ background: 'var(--color-accent-primary)' }}
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" style={{ color: 'var(--color-bg-main)' }} />
                    </div>
                  ) : (
                    <div
                      className="w-6 h-6 rounded-full border-2 flex-shrink-0"
                      style={{ borderColor: 'var(--color-border-subtle)' }}
                    />
                  )}
                </div>

                {/* Upload state */}
                {uploadState ? (
                  <div
                    className="rounded-2xl p-3 flex items-center gap-2.5"
                    style={{ background: 'rgba(255,255,255,0.8)', border: '1px solid #d4f57a' }}
                  >
                    <FileText className="w-4 h-4 flex-shrink-0" style={{ color: '#5a7a00' }} />
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
                      className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 transition-colors"
                      style={{ background: 'rgba(0,0,0,0.08)' }}
                      onMouseEnter={e => e.currentTarget.style.background = 'rgba(0,0,0,0.15)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'rgba(0,0,0,0.08)'}
                    >
                      <X className="w-2.5 h-2.5" style={{ color: 'var(--color-text-muted)' }} />
                    </button>
                  </div>
                ) : (
                  <div className="text-center py-4">
                    <div
                      className="w-10 h-10 rounded-2xl mx-auto mb-2.5 flex items-center justify-center"
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
                      PDF, CSV, Excel · Max 25 MB
                    </p>
                    <p className="text-[10px] mt-1" style={{ color: 'var(--color-text-muted)' }}>
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
          onClick={handleProcessSession}
          disabled={!isReadyToProcess}
          className="flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-semibold flex-shrink-0 transition-all duration-300"
          style={{
            background: isReadyToProcess ? 'var(--color-accent-primary)' : '#e5e5e5',
            color: isReadyToProcess ? 'var(--color-bg-main)' : '#9ca3af',
            cursor: isReadyToProcess ? 'pointer' : 'not-allowed',
            boxShadow: isReadyToProcess ? '0 4px 16px rgba(218,241,99,0.4)' : 'none',
          }}
          onMouseEnter={e => {
            if (isReadyToProcess) {
              e.currentTarget.style.transform = 'translateY(-1px)'
              e.currentTarget.style.boxShadow = '0 6px 20px rgba(218,241,99,0.5)'
            }
          }}
          onMouseLeave={e => {
            e.currentTarget.style.transform = 'translateY(0)'
            e.currentTarget.style.boxShadow = isReadyToProcess
              ? '0 4px 16px rgba(218,241,99,0.4)'
              : 'none'
          }}
        >
          Proses Laporan
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>

    </div>
  )
}