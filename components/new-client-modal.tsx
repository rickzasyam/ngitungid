'use client'

import { useEffect, useState } from 'react'
import { X, Building2, Loader2, AlertCircle } from 'lucide-react'
import type { ClientInfo } from '@/lib/client-context'

// Saran jenis klien — bebas diketik, ini cuma autocomplete.
const TYPE_SUGGESTIONS = ['E-commerce', 'Jasa Kreatif', 'Manufaktur', 'Retail', 'F&B', 'Jasa']

const inputStyle: React.CSSProperties = {
  background: 'var(--color-muted-bg)',
  border: '1.5px solid var(--color-border-subtle)',
  color: 'var(--color-text-primary)',
}

export function NewClientModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean
  onClose: () => void
  onCreated: (client: ClientInfo) => void
}) {
  const [name, setName] = useState('')
  const [type, setType] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // Tutup dengan Escape (kecuali sedang submit).
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !submitting) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, submitting, onClose])

  if (!open) return null

  const close = () => {
    if (submitting) return
    setName('')
    setType('')
    setError(null)
    onClose()
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    const n = name.trim()
    const t = type.trim()
    if (!n || !t) {
      setError('Nama dan jenis klien wajib diisi.')
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch('/api/clients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: n, type: t }),
      })
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null
        setError(data?.error ?? 'Gagal membuat klien.')
        setSubmitting(false)
        return
      }
      const created = (await res.json()) as ClientInfo
      setName('')
      setType('')
      setSubmitting(false)
      onCreated(created)
    } catch {
      setError('Terjadi kesalahan jaringan. Coba lagi.')
      setSubmitting(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 animate-fade-in"
      style={{ background: 'rgba(0,0,0,0.5)' }}
      onClick={close}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Tambah klien baru"
        className="w-full rounded-3xl p-6 sm:p-7 animate-scale-in"
        style={{ maxWidth: 420, background: 'white', boxShadow: '0 8px 40px rgba(0,0,0,0.4)' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start gap-3 mb-5">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ background: 'var(--color-accent-primary)' }}
          >
            <Building2 className="w-5 h-5" style={{ color: 'var(--color-accent-primary-fg)' }} />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-bold" style={{ color: 'var(--color-text-primary)' }}>
              Klien Baru
            </h2>
            <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
              Setelah dibuat, upload Master COA-nya di Settings
            </p>
          </div>
          <button
            type="button"
            onClick={close}
            aria-label="Tutup"
            className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 transition-colors hover:bg-(--color-muted-bg) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-accent-primary)"
            style={{ color: 'var(--color-text-muted)' }}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="new-client-name"
              className="block text-xs font-semibold mb-1.5 uppercase tracking-wide"
              style={{ color: 'var(--color-text-muted)' }}
            >
              Nama Klien
            </label>
            <input
              id="new-client-name"
              type="text"
              required
              autoFocus
              value={name}
              onChange={e => setName(e.target.value)}
              className="w-full px-4 py-3 rounded-2xl text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-accent-primary)"
              style={inputStyle}
              placeholder="mis. Rasyuka"
            />
          </div>

          <div>
            <label
              htmlFor="new-client-type"
              className="block text-xs font-semibold mb-1.5 uppercase tracking-wide"
              style={{ color: 'var(--color-text-muted)' }}
            >
              Jenis Usaha
            </label>
            <input
              id="new-client-type"
              type="text"
              required
              list="new-client-type-suggestions"
              value={type}
              onChange={e => setType(e.target.value)}
              className="w-full px-4 py-3 rounded-2xl text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-accent-primary)"
              style={inputStyle}
              placeholder="mis. E-commerce"
            />
            <datalist id="new-client-type-suggestions">
              {TYPE_SUGGESTIONS.map(s => (
                <option key={s} value={s} />
              ))}
            </datalist>
          </div>

          {error && (
            <div
              className="flex items-center gap-2 px-3.5 py-2.5 rounded-2xl animate-fade-in"
              style={{ background: '#fef2f2', border: '1px solid #fecaca' }}
            >
              <AlertCircle className="w-4 h-4 flex-shrink-0" style={{ color: '#dc2626' }} />
              <span className="text-xs font-medium" style={{ color: '#dc2626' }}>
                {error}
              </span>
            </div>
          )}

          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              onClick={close}
              disabled={submitting}
              className="flex-1 px-5 py-3 rounded-full text-sm font-medium transition-colors hover:bg-(--color-border-subtle) disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-accent-primary)"
              style={{ background: 'var(--color-muted-bg)', color: 'var(--color-text-primary)' }}
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 flex items-center justify-center gap-2 px-5 py-3 rounded-full text-sm font-semibold transition-all duration-200 enabled:hover:-translate-y-px enabled:hover:shadow-[0_4px_16px_rgba(218,241,99,0.4)] disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-accent-primary) focus-visible:ring-offset-2"
              style={{
                background: submitting ? 'var(--color-muted-dark)' : 'var(--color-accent-primary)',
                color: submitting ? 'var(--color-text-muted)' : 'var(--color-accent-primary-fg)',
              }}
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Menyimpan...
                </>
              ) : (
                'Simpan Klien'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
