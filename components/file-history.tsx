'use client'

import { FileText, History, CheckCircle2, Clock, AlertCircle, Loader2 } from 'lucide-react'

type StatusKey = 'success' | 'pending' | 'error' | 'process'

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
  const files: { id: number; name: string; date: string; type: 'pdf' | 'excel' | 'csv'; status: StatusKey }[] = [
    { id: 1, name: 'laporan_pnl_q4.pdf', date: 'Ekstraksi selesai',  type: 'pdf',   status: 'success' },
    { id: 2, name: 'trial_balance.xlsx', date: 'Menunggu mapping',   type: 'excel', status: 'pending' },
    { id: 3, name: 'consolidation.csv',  date: 'Siap dashboard',     type: 'csv',   status: 'success' },
  ]

  return (
    <div className="space-y-4">
      {/* Section header — icon container + title + subtitle */}
      <div className="flex items-center gap-3">
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ background: 'linear-gradient(135deg, #bbb3f3 0%, #a5b4fc 100%)' }}
        >
          <History className="w-4 h-4" style={{ color: '#1a1a1a' }} />
        </div>
        <div>
          <h3 className="text-sm font-bold" style={{ color: '#2d2d2d' }}>Riwayat Upload</h3>
          <p className="text-xs" style={{ color: '#6b7280' }}>Sesi upload sebelumnya</p>
        </div>
      </div>

      <div className="space-y-1">
        {files.map((file, index) => (
          <div
            key={file.id}
            className="flex items-center gap-3 p-3 rounded-2xl animate-slide-up"
            style={{
              transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
              animationDelay: `${index * 50}ms`,
              opacity: 0,
              animationFillMode: 'forwards',
              cursor: 'pointer',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = '#f8f8f8' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
          >
            {/* File type icon dengan color */}
            <div
              className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: file.type === 'pdf' ? '#fef2f2' : '#f0fdf4' }}
            >
              <FileText className="w-4 h-4" style={{ color: file.type === 'pdf' ? '#dc2626' : '#15803d' }} />
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
