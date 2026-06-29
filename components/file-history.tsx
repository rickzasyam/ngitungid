'use client'

import { FileText } from 'lucide-react'

export function FileHistory() {
  const files = [
    {
      id: 1,
      name: 'laporan_pnl_q4.pdf',
      description: 'Ekstraksi selesai',
      status: 'Valid',
      statusColor: 'text-green-600 bg-green-50',
    },
    {
      id: 2,
      name: 'trial_balance.xlsx',
      description: 'Merunggu mapping',
      status: 'Review',
      statusColor: 'text-amber-600 bg-amber-50',
    },
    {
      id: 3,
      name: 'consolidation.csv',
      description: 'Siap dashboard',
      status: 'Done',
      statusColor: 'text-teal-600 bg-teal-50',
    },
  ]

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold text-(--color-text-primary) mb-0.5">Riwayat Upload</h2>
        <p className="text-(--color-text-muted) text-sm">Status processing terakhir</p>
      </div>

      <div className="space-y-3">
        {files.map((file, index) => (
          <div
            key={file.id}
            className={`flex items-center gap-3 p-4 rounded-2xl border
                        border-(--color-border-subtle) bg-(--color-bg-card)
                        hover:border-(--color-accent-primary)/40
                        hover:shadow-[0_4px_16px_rgb(0,0,0,0.06)]
                        transition-all duration-200 cursor-pointer
                        animate-fade-in-up animation-delay-${100 + index * 100}`}
          >
            <div className="w-9 h-9 rounded-xl bg-(--color-muted-bg)
                            flex items-center justify-center flex-shrink-0">
              <FileText className="w-4 h-4 text-(--color-text-muted)" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-(--color-text-primary) truncate">
                {file.name}
              </p>
              <p className="text-xs text-(--color-text-muted) mt-0.5">
                {file.description}
              </p>
            </div>
            <span className={`px-3 py-1 rounded-full text-xs font-bold
                              whitespace-nowrap ${file.statusColor}`}>
              {file.status}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
