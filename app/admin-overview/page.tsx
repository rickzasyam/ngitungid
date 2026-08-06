'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useClient, type ClientInfo } from '@/lib/client-context'
import { NewClientModal } from '@/components/new-client-modal'
import { ClientAvatar } from '@/components/client-avatar'
import { ClientCardMenu, EditClientModal, DeleteClientModal, AssignClientModal } from '@/components/client-manage'
import { ArrowRight, Plus, Building2, Loader2 } from 'lucide-react'

export default function AdminOverviewPage() {
  const { clients, activeClient, setActiveClient, refreshClients, isLoaded, isInternal, isOwner } = useClient()
  const [showNewClient, setShowNewClient] = useState(false)
  const [editing, setEditing] = useState<ClientInfo | null>(null)
  const [deleting, setDeleting] = useState<ClientInfo | null>(null)
  const [assigning, setAssigning] = useState<ClientInfo | null>(null)
  const router = useRouter()

  // "Buka workspace" harus benar-benar membuka workspace. setActiveClient
  // sinkron (dan menulis localStorage), jadi aman langsung navigasi.
  const openWorkspace = (client: Parameters<typeof setActiveClient>[0]) => {
    setActiveClient(client)
    router.push('/dashboard')
  }

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
            <p className="text-sm mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
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
              <div className="flex items-center justify-center gap-2 py-16" style={{ color: 'var(--color-text-muted)' }}>
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
                    // Kartu = <div> (bukan <button>): tombol "Buka workspace" dan
                    // kebab menu adalah dua <button> BERSEBELAHAN, bukan bersarang
                    // (button-in-button itu HTML tidak valid & merusak keyboard).
                    <div
                      key={client.id}
                      className="relative rounded-3xl overflow-hidden animate-slide-up ng-card-lift"
                      style={{
                        background: 'white',
                        border: '1px solid #f0f0f0',
                        boxShadow: '0 4px 16px rgba(0,0,0,0.04)',
                        animationDelay: `${index * 75}ms`,
                      }}
                    >
                      {/* Accent strip */}
                      <div style={{ height: 4, background: 'linear-gradient(90deg, #daf163, #b8e000)' }} />

                      {/* Kebab (staf saja) — di atas tombol utama, z-index lebih tinggi */}
                      {isInternal && (
                        <div className="absolute" style={{ top: 12, right: 10, zIndex: 3 }}>
                          <ClientCardMenu
                            isOwner={isOwner}
                            onEdit={() => setEditing(client)}
                            onAssign={() => setAssigning(client)}
                            onDelete={() => setDeleting(client)}
                          />
                        </div>
                      )}

                      <button
                        type="button"
                        onClick={() => openWorkspace(client)}
                        aria-label={`Buka workspace ${client.name}`}
                        className="w-full text-left p-5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-accent-primary) focus-visible:ring-inset"
                      >
                        <div className="flex items-start mb-3">
                          <ClientAvatar client={client} size={40} rounded={12} />
                        </div>
                        <p className="text-sm font-bold mb-0.5" style={{ color: '#2d2d2d' }}>
                          {client.name}
                        </p>
                        <p className="text-xs mb-3" style={{ color: 'var(--color-text-muted)' }}>
                          {client.type}
                        </p>
                        <div className="flex items-center justify-between">
                          <p className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
                            Buka workspace
                          </p>
                          <ArrowRight className="w-3.5 h-3.5" style={{ color: 'var(--color-accent-primary)' }} />
                        </div>
                      </button>
                    </div>
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

      {editing && (
        <EditClientModal
          client={editing}
          onClose={() => setEditing(null)}
          onSaved={async () => { setEditing(null); await refreshClients() }}
        />
      )}

      {deleting && (
        <DeleteClientModal
          client={deleting}
          onClose={() => setDeleting(null)}
          onDeleted={async () => {
            // Kalau klien yang dihapus sedang aktif, lepas dulu supaya tidak ada
            // active client yang menunjuk ke id yang sudah tidak ada.
            if (activeClient?.id === deleting.id) setActiveClient(null)
            setDeleting(null)
            await refreshClients()
          }}
        />
      )}

      {assigning && isOwner && (
        <AssignClientModal
          client={assigning}
          onClose={() => setAssigning(null)}
          onSaved={() => setAssigning(null)}
        />
      )}
    </div>
  )
}
