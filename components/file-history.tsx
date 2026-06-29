'use client'

import { FileText, History, CheckCircle2, Clock, AlertCircle, Loader2 } from 'lucide-react'

type StatusKey = 'success' | 'pending' | 'error' | 'process'
type FileType = 'pdf' | 'excel' | 'csv'

const FILE_TYPE_CONFIG: Record<FileType, { bg: string; color: string }> = {
  pdf:   { bg: '#fef2f2', color: '#dc2626' },
  excel: { bg: '#eff6ff', color: '#2563eb' },
  csv:   { bg: '#f0fdf4', color: '#15803d' },
}

const STATUS_CONFIG: Record<StatusKey, { Icon: typeof CheckCircle2; label: string; bg: string; color: string }> = {
  success: { Icon: CheckCircle2, label: 'Selesai',  bg: '#f0fdf4', color: '#15803d' },
  pending: { Icon: Clock,        label: 'Menunggu', bg: '#fafafa', color: '#6b7280' },
  error:   { Icon: AlertCircle,  label: 'Error',    bg: '#fef2f2', color: '#dc2626' },
  process: { Icon: Loader2,      label: 'Proses',   bg: '#f0f9ff', color: '#0284c7' },
}

function StatusBadge({ status }: { status: StatusKey }) {
  const cfg = STATUS_CONFIG[status]
  return (
    <div
      className="flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium flex-shrink-0"
      style={{ background: cfg.bg, color: cfg.color }}
    >
      <cfg.Icon className={`w-3 h-3 ${status === 'process' ? 'animate-spin' : ''}`} />
      <span>{cfg.label}</span>
    </div>
  )
}

export function FileHistory() {
  const files: { id: number; name: string; date: string; type: FileType; status: StatusKey }[] = [
    { id: 1, name: 'laporan_pnl_q4.pdf', date: 'Ekstraksi selesai',  type: 'pdf',   status: 'success' },
    { id: 2, name: 'trial_balance.xlsx', date: 'Menunggu mapping',   type: 'excel', status: 'pending' },
    { id: 3, name: 'consolidation.csv',  date: 'Siap dashboard',     type: 'csv',   status: 'success' },
  ]

  return (
    <div className="space-y-4">
      {/* Section header — icon container + title + subtitle */}
      <div className="flex items-center" style={{ gap: 10 }}>
        <div
          className="flex items-center justify-center flex-shrink-0"
          style={{ width: 34, height: 34, borderRadius: 10, background: 'linear-gradient(135deg, #bbb3f3 0%, #a5b4fc 100%)' }}
        >
          <History style={{ width: 16, height: 16, color: '#1a1a1a' }} />
        </div>
        <div>
          <h3 className="font-bold" style={{ fontSize: 13, color: 'var(--color-text-primary)' }}>Riwayat Upload</h3>
          <p style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>Sesi upload sebelumnya</p>
        </div>
      </div>

      <div className="space-y-1">
        {files.map((file, index) => (
          <div
            key={file.id}
            role="button"
            tabIndex={0}
            onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') e.currentTarget.click() }}
            className="flex items-center gap-3 p-3 rounded-2xl animate-slide-up cursor-pointer transition-colors duration-150 hover:bg-(--color-muted-bg) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-accent-primary) focus-visible:ring-inset"
            style={{ animationDelay: `${index * 50}ms` }}
          >
            {/* File type icon dengan warna berbeda per tipe */}
            <div
              className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: FILE_TYPE_CONFIG[file.type].bg }}
            >
              <FileText className="w-4 h-4" style={{ color: FILE_TYPE_CONFIG[file.type].color }} />
            </div>
            {/* Name + date */}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate" style={{ color: '#2d2d2d' }}>{file.name}</p>
              <p className="text-xs" style={{ color: '#9ca3af' }}>{file.date}</p>
            </div>
            {/* Status badge dengan icon */}
            <StatusBadge status={file.status} />
          </div>
        ))}
      </div>
    </div>
  )
}
