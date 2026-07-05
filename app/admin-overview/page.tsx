'use client'

import { useState } from 'react'
import { useClient } from '@/lib/client-context'
import { NewClientModal } from '@/components/new-client-modal'
import { ArrowRight, Plus, Building2, Loader2 } from 'lucide-react'

export default function AdminOverviewPage() {
  const { clients, setActiveClient, refreshClients, isLoaded } = useClient()
  const [showNewClient, setShowNewClient] = useState(false)

  return (
    <div className="flex-1 p-3 min-w-0 overflow-hidden">
      <div
        className="h-full rounded-3xl overflow-hidden flex flex-col"
        style={{ background: 'white', boxShadow: '0 8px 40px rgb(0,0,0,0.4)' }}
      >
        {/* Page header */}
        <div
          className="flex-shrink-0 px-4 sm:px-6 py-5 border-b flex items-center justify-between gap-3"
          style={{ borderColor: '#f0f0f0', background: 'white' }}
        >
          <div className="min-w-0">
            <h1 className="text-xl font-bold" style={{ color: '#2d2d2d' }}>
              Admin Overview
            </h1>
            <p className="text-sm mt-0.5" style={{ color: '#6b7280' }}>
              Ringkasan seluruh klien yang Anda kelola
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowNewClient(true)}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-full text-sm font-semibold flex-shrink-0 transition-all duration-200 hover:-translate-y-px hover:shadow-[0_4px_14px_rgba(218,241,99,0.4)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-accent-primary) focus-visible:ring-offset-2"
            style={{ background: 'var(--color-accent-primary)', color: 'var(--color-accent-primary-fg)' }}
          >
            <Plus className="w-4 h-4" />
            Klien Baru
          </button>
        </div>

        {/* Scrollable content */}
        <main className="flex-1 overflow-y-auto" style={{ background: '#f8f8f8' }}>
          <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-6">
            {!isLoaded ? (
              <div className="flex items-center justify-center gap-2 py-16" style={{ color: '#9ca3af' }}>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span className="text-sm">Memuat klien…</span>
              </div>
            ) : clients.length === 0 ? (
              /* Empty state — belum ada klien sama sekali */
              <div
                className="rounded-3xl p-10 text-center animate-slide-up"
                style={{ background: 'white', border: '2px dashed var(--color-border-subtle)' }}
              >
                <div
                  className="w-12 h-12 rounded-2xl mx-auto mb-3 flex items-center justify-center"
                  style={{ border: '1.5px dashed rgba(218,241,99,0.9)', background: '#fbfef2' }}
                >
                  <Building2 className="w-5 h-5" style={{ color: '#8aa32e' }} />
                </div>
                <p className="text-sm font-bold mb-1" style={{ color: 'var(--color-text-primary)' }}>
                  Belum ada klien
                </p>
                <p className="text-xs max-w-xs mx-auto mb-4" style={{ color: 'var(--color-text-muted)' }}>
                  Buat klien pertama untuk mulai mengelola laporan keuangannya.
                </p>
                <button
                  type="button"
                  onClick={() => setShowNewClient(true)}
                  className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-full text-sm font-semibold transition-all duration-200 hover:-translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-accent-primary) focus-visible:ring-offset-2"
                  style={{ background: 'var(--color-accent-primary)', color: 'var(--color-accent-primary-fg)' }}
                >
                  <Plus className="w-4 h-4" />
                  Klien Baru
                </button>
              </div>
            ) : (
              <div>
                <h2 className="text-base font-bold mb-3" style={{ color: '#2d2d2d' }}>
                  Pilih klien untuk mulai
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {clients.map((client, index) => (
                    <button
                      key={client.id}
                      type="button"
                      onClick={() => setActiveClient(client)}
                      className="text-left rounded-3xl overflow-hidden animate-slide-up ng-card-lift focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-accent-primary) focus-visible:ring-offset-2"
                      style={{
                        background: 'white',
                        border: '1px solid #f0f0f0',
                        boxShadow: '0 4px 16px rgba(0,0,0,0.04)',
                        animationDelay: `${index * 75}ms`,
                      }}
                    >
                      {/* Accent strip */}
                      <div
                        style={{ height: 4, background: 'linear-gradient(90deg, #daf163, #b8e000)' }}
                      />
                      <div className="p-5">
                        <div className="flex items-start justify-between mb-3">
                          <div
                            className="w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold"
                            style={{ background: 'var(--color-accent-primary)', color: 'var(--color-bg-main)' }}
                          >
                            {client.name.charAt(0)}
                          </div>
                        </div>
                        <p className="text-sm font-bold mb-0.5" style={{ color: '#2d2d2d' }}>
                          {client.name}
                        </p>
                        <p className="text-xs mb-3" style={{ color: '#9ca3af' }}>
                          {client.type}
                        </p>
                        <div className="flex items-center justify-between">
                          <p className="text-[11px]" style={{ color: '#6b7280' }}>
                            Buka workspace
                          </p>
                          <ArrowRight className="w-3.5 h-3.5" style={{ color: 'var(--color-accent-primary)' }} />
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </main>
      </div>

      <NewClientModal
        open={showNewClient}
        onClose={() => setShowNewClient(false)}
        onCreated={async () => {
          setShowNewClient(false)
          await refreshClients()
        }}
      />
    </div>
  )
}
