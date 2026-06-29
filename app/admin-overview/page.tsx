'use client'

import { Sidebar } from '@/components/sidebar'
import { useClient, MOCK_CLIENTS } from '@/lib/client-context'
import { AlertCircle, ArrowRight } from 'lucide-react'

const CLIENT_STATUS = [
  { clientId: 'client-1', lastUpload: '19 Jun 2026', status: 'up-to-date', pendingReports: 0 },
  { clientId: 'client-2', lastUpload: '2 Jun 2026', status: 'overdue', pendingReports: 1 },
  { clientId: 'client-3', lastUpload: '15 Mei 2026', status: 'overdue', pendingReports: 2 },
]

export default function AdminOverviewPage() {
  const { setActiveClient } = useClient()

  const overdueCount = CLIENT_STATUS.filter(c => c.status === 'overdue').length

  return (
    <div className="flex h-screen w-screen overflow-hidden" style={{ background: 'var(--color-bg-main)' }}>
      <Sidebar activeItem="" />

      <div className="flex-1 p-3 min-w-0 overflow-hidden">
        <div
          className="h-full rounded-3xl overflow-hidden flex flex-col"
          style={{ background: 'white', boxShadow: '0 8px 40px rgb(0,0,0,0.4)' }}
        >

          {/* Page header */}
          <div
            className="flex-shrink-0 px-4 sm:px-6 py-5 border-b"
            style={{ borderColor: '#f0f0f0', background: 'white' }}
          >
            <h1 className="text-xl font-bold" style={{ color: '#2d2d2d' }}>Admin Overview</h1>
            <p className="text-sm mt-0.5" style={{ color: '#6b7280' }}>
              Ringkasan seluruh klien yang Anda kelola
            </p>
          </div>

          {/* Scrollable content */}
          <main className="flex-1 overflow-y-auto" style={{ background: '#f8f8f8' }}>
            <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-6">

              {/* Overdue warning */}
              {overdueCount > 0 && (
                <div
                  className="rounded-2xl p-4 flex items-center gap-3 animate-slide-up"
                  style={{
                    background: 'linear-gradient(135deg, #fffbeb 0%, #fef9ec 100%)',
                    border: '1px solid #fde68a',
                    borderLeft: '4px solid #f59e0b',
                  }}
                >
                  <AlertCircle className="w-5 h-5 flex-shrink-0" style={{ color: '#b45309' }} />
                  <p className="text-sm" style={{ color: '#92400e' }}>
                    <strong>{overdueCount} klien</strong> belum upload laporan bulan ini
                  </p>
                </div>
              )}

              {/* Client cards — responsive: 1 → 2 → 3 columns */}
              <div>
                <h2 className="text-base font-bold mb-3" style={{ color: '#2d2d2d' }}>
                  Pilih klien untuk mulai
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {MOCK_CLIENTS.map((client, index) => {
                    const status = CLIENT_STATUS.find(s => s.clientId === client.id)
                    const isOverdue = status?.status === 'overdue'

                    return (
                      <button
                        key={client.id}
                        type="button"
                        onClick={() => setActiveClient(client)}
                        className="text-left rounded-3xl overflow-hidden animate-slide-up"
                        style={{
                          background: 'white',
                          border: isOverdue ? '1.5px solid #fde68a' : '1px solid #f0f0f0',
                          boxShadow: '0 4px 16px rgba(0,0,0,0.04)',
                          transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                          animationDelay: `${index * 75}ms`,
                          opacity: 0,
                          animationFillMode: 'forwards',
                        }}
                        onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 8px 24px rgba(0,0,0,0.10)' }}
                        onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.04)' }}
                      >
                        {/* Left accent strip — lime jika up-to-date, peach/amber jika overdue */}
                        <div style={{
                          height: 4,
                          background: isOverdue
                            ? 'linear-gradient(90deg, #fdba74, #f59e0b)'
                            : 'linear-gradient(90deg, #daf163, #b8e000)',
                        }} />
                        <div className="p-5">
                        <div className="flex items-start justify-between mb-3">
                          <div
                            className="w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold"
                            style={{ background: 'var(--color-accent-primary)', color: 'var(--color-bg-main)' }}
                          >
                            {client.name.charAt(0)}
                          </div>
                          {isOverdue ? (
                            <span
                              className="text-[10px] font-semibold px-2 py-1 rounded-full"
                              style={{ background: '#fef3c7', color: '#b45309' }}
                            >
                              Belum upload
                            </span>
                          ) : (
                            <span
                              className="text-[10px] font-semibold px-2 py-1 rounded-full"
                              style={{ background: '#f0fdf4', color: '#15803d' }}
                            >
                              Up to date
                            </span>
                          )}
                        </div>
                        <p className="text-sm font-bold mb-0.5" style={{ color: '#2d2d2d' }}>{client.name}</p>
                        <p className="text-xs mb-3" style={{ color: '#9ca3af' }}>{client.type}</p>
                        <div className="flex items-center justify-between">
                          <p className="text-[11px]" style={{ color: '#6b7280' }}>
                            Upload terakhir: {status?.lastUpload}
                          </p>
                          <ArrowRight className="w-3.5 h-3.5" style={{ color: 'var(--color-accent-primary)' }} />
                        </div>
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>

            </div>
          </main>
        </div>
      </div>
    </div>
  )
}