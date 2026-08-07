'use client'

import { useEffect, useRef, useState } from 'react'
import {
  X, Loader2, AlertCircle, AlertTriangle, Pencil, Trash2, Users2, MoreVertical, ImagePlus, Check,
} from 'lucide-react'
import type { ClientInfo } from '@/lib/client-context'
import { ClientAvatar } from '@/components/client-avatar'
import { ModalShell } from '@/components/ui/modal-portal'
import { ROLE_LABEL, type Role } from '@/lib/roles'

const TYPE_SUGGESTIONS = ['E-commerce', 'Jasa Kreatif', 'Manufaktur', 'Retail', 'F&B', 'Jasa']
const ACCEPT = 'image/png,image/jpeg,image/webp,image/svg+xml'
const MAX_LOGO_KB = 512

const inputStyle: React.CSSProperties = {
  background: 'var(--color-muted-bg)',
  border: '1.5px solid var(--color-border-subtle)',
  color: 'var(--color-text-primary)',
}

// ── Shell modal (dipakai bertiga) ─────────────────────────────
// Dulu ini ModalShell LOKAL — duplikat dari components/ui/modal-portal.tsx —
// sehingga ketiga dialog di file ini tidak ikut mendapat dua perbaikan yang
// sudah lama ada di versi bersama: portal ke <body> (kebal terhadap transform
// sisa `.ng-rise`/`.animate-slide-up` yang menjadikan card sebagai containing
// block untuk position:fixed) dan pemusatan ke AREA KONTEN lewat
// --app-content-left (bukan ke seluruh viewport, jadi dialog tidak pernah
// setengah tertutup sidebar). Sekarang memakai yang bersama.
//
// Dua penyesuaian saat menyatukan:
//   - `busy` → `onDismiss={busy ? null : onClose}` (shell bersama memakai null
//     sebagai "tidak bisa ditutup"), yang sekaligus menonaktifkan Esc.
//   - Padding dulu ada di shell (`p-6 sm:p-7`); shell bersama sengaja tidak
//     memberi padding supaya dialog ber-header lengket bisa mengaturnya sendiri.
//     Karena itu isi dibungkus ModalBody di bawah — sekalian membuat dialog
//     tinggi (Kelola Akunting dgn daftar staf) ikut scroll, bukan terpotong
//     max-h-[85vh] milik shell.
function ModalBody({ children }: { children: React.ReactNode }) {
  return <div className="p-6 sm:p-7 overflow-y-auto">{children}</div>
}

function ErrorBox({ msg }: { msg: string }) {
  return (
    <div className="flex items-start gap-2 px-3.5 py-2.5 rounded-2xl animate-fade-in" style={{ background: '#fef2f2', border: '1px solid #fecaca' }}>
      <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: '#dc2626' }} />
      <span className="text-xs font-medium" style={{ color: '#dc2626' }}>{msg}</span>
    </div>
  )
}

// ── Kebab menu di kartu klien ─────────────────────────────────
export function ClientCardMenu({
  isOwner, onEdit, onAssign, onDelete,
}: { isOwner: boolean; onEdit: () => void; onAssign: () => void; onDelete: () => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  const item = (Icon: typeof Pencil, label: string, onClick: () => void, danger = false) => (
    <button
      type="button"
      onClick={() => { setOpen(false); onClick() }}
      className="w-full flex items-center gap-2.5 px-3 py-2 text-left text-xs transition-colors hover:bg-(--color-muted-bg) focus-visible:outline-none focus-visible:bg-(--color-muted-bg)"
      style={{ color: danger ? '#dc2626' : 'var(--color-text-primary)' }}
    >
      <Icon className="w-3.5 h-3.5 flex-shrink-0" />
      {label}
    </button>
  )

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        aria-label="Aksi klien"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(o => !o)}
        className="w-8 h-8 rounded-full flex items-center justify-center transition-colors hover:bg-(--color-muted-bg) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-accent-primary)"
        style={{ color: 'var(--color-text-muted)' }}
      >
        <MoreVertical className="w-4 h-4" />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full mt-1 rounded-2xl overflow-hidden z-50 py-1"
          style={{ minWidth: 168, background: 'white', border: '1px solid #ececec', boxShadow: '0 8px 24px rgba(0,0,0,0.12)' }}
        >
          {item(Pencil, 'Edit klien', onEdit)}
          {isOwner && item(Users2, 'Kelola Akunting', onAssign)}
          {/* Hapus klien → OWNER SAJA (2026-08-06). Menghapus klien meng-cascade
              seluruh Master COA, laporan, riwayat mapping, dan setelannya.
              Sebelumnya akunting punya tombol ini; pengurangan itu DISENGAJA dan
              berdiri sendiri — pertanyaan soal role finance hanya membuatnya
              terlihat. Divider ikut bersembunyi supaya tidak ada garis
              menggantung di bawah item terakhir. */}
          {isOwner && <div style={{ height: 1, background: '#f0f0f0', margin: '4px 0' }} />}
          {isOwner && item(Trash2, 'Hapus klien', onDelete, true)}
        </div>
      )}
    </div>
  )
}

// ── Edit klien ────────────────────────────────────────────────
export function EditClientModal({
  client, onClose, onSaved,
}: { client: ClientInfo; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(client.name)
  const [type, setType] = useState(client.type)
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [removeLogo, setRemoveLogo] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!file) { setPreview(null); return }
    const url = URL.createObjectURL(file)
    setPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [file])

  const pickFile = (f: File | undefined) => {
    if (!f) return
    if (f.size > MAX_LOGO_KB * 1024) { setError(`Logo maksimal ${MAX_LOGO_KB}KB (file ini ${Math.round(f.size / 1024)}KB).`); return }
    setError(null); setFile(f); setRemoveLogo(false)
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (name.trim().length < 2) { setError('Nama klien minimal 2 karakter.'); return }
    if (!type.trim()) { setError('Jenis usaha wajib diisi.'); return }
    setBusy(true)
    try {
      const fd = new FormData()
      fd.append('name', name.trim())
      fd.append('type', type.trim())
      if (file) fd.append('logo', file)
      else if (removeLogo) fd.append('removeLogo', '1')
      const res = await fetch(`/api/clients/${client.id}`, { method: 'PATCH', body: fd })
      if (!res.ok) {
        const p = (await res.json().catch(() => null)) as { error?: string } | null
        throw new Error(p?.error ?? 'Gagal menyimpan perubahan.')
      }
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menyimpan perubahan.')
      setBusy(false)
    }
  }

  const showingCurrentLogo = client.hasLogo && !file && !removeLogo

  return (
    <ModalShell onDismiss={busy ? null : onClose} label={`Edit klien ${client.name}`} className="max-w-[440px]">
      <ModalBody>
      <div className="flex items-start gap-3 mb-5">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'var(--color-accent-primary)' }}>
          <Pencil className="w-5 h-5" style={{ color: 'var(--color-accent-primary-fg)' }} />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-base font-bold" style={{ color: 'var(--color-text-primary)' }}>Edit Klien</h2>
          <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Ubah nama, jenis usaha, atau logo</p>
        </div>
        <button type="button" onClick={onClose} aria-label="Tutup" className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 transition-colors hover:bg-(--color-muted-bg) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-accent-primary)" style={{ color: 'var(--color-text-muted)' }}>
          <X className="w-4 h-4" />
        </button>
      </div>

      <form onSubmit={submit} className="space-y-4">
        {/* Logo */}
        <div>
          <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wide" style={{ color: 'var(--color-text-muted)' }}>Logo</label>
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center flex-shrink-0" style={{ width: 56, height: 56, borderRadius: 14, background: '#f8f8f8', border: '1px solid #eee', overflow: 'hidden' }}>
              {preview ? (
                <img src={preview} alt="Pratinjau logo" width={56} height={56} className="object-cover" style={{ width: 56, height: 56 }} />
              ) : showingCurrentLogo ? (
                <ClientAvatar client={client} size={56} rounded={14} />
              ) : (
                <ClientAvatar client={{ ...client, hasLogo: false }} size={56} rounded={14} />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <input ref={fileRef} type="file" accept={ACCEPT} className="hidden" onChange={e => { pickFile(e.target.files?.[0]); e.target.value = '' }} />
              <button type="button" onClick={() => fileRef.current?.click()} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors hover:bg-(--color-border-subtle) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-accent-primary)" style={{ background: 'var(--color-muted-bg)', color: 'var(--color-text-primary)' }}>
                <ImagePlus className="w-3.5 h-3.5" /> {client.hasLogo || file ? 'Ganti logo' : 'Unggah logo'}
              </button>
              {(client.hasLogo || file) && (
                <button type="button" onClick={() => { setFile(null); setRemoveLogo(true) }} className="ml-2 inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium transition-colors hover:bg-[#fef2f2] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-accent-critical)" style={{ color: '#dc2626' }}>
                  <Trash2 className="w-3 h-3" /> Hapus
                </button>
              )}
              <p className="text-[10.5px] mt-1.5" style={{ color: 'var(--color-text-muted)' }}>PNG/JPEG/WebP/SVG, maks {MAX_LOGO_KB}KB.{removeLogo && ' Logo akan dihapus saat disimpan.'}</p>
            </div>
          </div>
        </div>

        <div>
          <label htmlFor="edit-name" className="block text-xs font-semibold mb-1.5 uppercase tracking-wide" style={{ color: 'var(--color-text-muted)' }}>Nama Klien</label>
          <input id="edit-name" type="text" required value={name} onChange={e => setName(e.target.value)} className="w-full px-4 py-3 rounded-2xl text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-accent-primary)" style={inputStyle} />
        </div>
        <div>
          <label htmlFor="edit-type" className="block text-xs font-semibold mb-1.5 uppercase tracking-wide" style={{ color: 'var(--color-text-muted)' }}>Jenis Usaha</label>
          <input id="edit-type" type="text" required list="edit-type-suggest" value={type} onChange={e => setType(e.target.value)} className="w-full px-4 py-3 rounded-2xl text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-accent-primary)" style={inputStyle} />
          <datalist id="edit-type-suggest">{TYPE_SUGGESTIONS.map(s => <option key={s} value={s} />)}</datalist>
        </div>

        {error && <ErrorBox msg={error} />}

        <div className="flex items-center gap-2 pt-1">
          <button type="button" onClick={onClose} disabled={busy} className="flex-1 px-5 py-3 rounded-full text-sm font-medium transition-colors hover:bg-(--color-border-subtle) disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-accent-primary)" style={{ background: 'var(--color-muted-bg)', color: 'var(--color-text-primary)' }}>Batal</button>
          <button type="submit" disabled={busy} className="flex-1 flex items-center justify-center gap-2 px-5 py-3 rounded-full text-sm font-semibold transition-all enabled:hover:-translate-y-px disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-accent-primary) focus-visible:ring-offset-2" style={{ background: busy ? 'var(--color-muted-dark)' : 'var(--color-accent-primary)', color: busy ? 'var(--color-text-muted)' : 'var(--color-accent-primary-fg)' }}>
            {busy ? <><Loader2 className="w-4 h-4 animate-spin" /> Menyimpan…</> : 'Simpan'}
          </button>
        </div>
      </form>
      </ModalBody>
    </ModalShell>
  )
}

// ── Hapus klien (ketik ulang nama) ────────────────────────────
export function DeleteClientModal({
  client, onClose, onDeleted,
}: { client: ClientInfo; onClose: () => void; onDeleted: () => void }) {
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const matched = confirm === client.name

  const submit = async () => {
    if (!matched) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/clients/${client.id}?confirm=${encodeURIComponent(client.name)}`, { method: 'DELETE' })
      if (!res.ok) {
        const p = (await res.json().catch(() => null)) as { error?: string } | null
        throw new Error(p?.error ?? 'Gagal menghapus klien.')
      }
      onDeleted()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menghapus klien.')
      setBusy(false)
    }
  }

  return (
    <ModalShell onDismiss={busy ? null : onClose} label={`Hapus klien ${client.name}`} className="max-w-[440px]">
      <ModalBody>
      <div className="flex items-start gap-3 mb-4">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: '#fef2f2' }}>
          <AlertTriangle className="w-5 h-5" style={{ color: '#dc2626' }} />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-base font-bold" style={{ color: 'var(--color-text-primary)' }}>Hapus Klien</h2>
          <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Tindakan ini permanen dan tidak bisa dibatalkan</p>
        </div>
        <button type="button" onClick={onClose} aria-label="Tutup" className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 transition-colors hover:bg-(--color-muted-bg) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-accent-primary)" style={{ color: 'var(--color-text-muted)' }}>
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="rounded-2xl p-3.5 mb-4" style={{ background: '#fffbeb', border: '1px solid rgba(217,119,6,0.2)' }}>
        <p className="text-xs leading-relaxed" style={{ color: '#92400e' }}>
          Menghapus <strong>{client.name}</strong> akan menghapus PERMANEN <strong>seluruh Master COA, laporan keuangan, riwayat mapping, dan pengaturannya</strong>. Kalau masih ada akun klien (viewer) terpasang, penghapusan ditolak — lepas dulu akunnya.
        </p>
      </div>

      <label htmlFor="del-confirm" className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--color-text-muted)' }}>
        Ketik <span style={{ color: 'var(--color-text-primary)', fontWeight: 700 }}>{client.name}</span> untuk konfirmasi
      </label>
      <input
        id="del-confirm" type="text" value={confirm} autoFocus autoComplete="off"
        onChange={e => setConfirm(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter' && matched && !busy) submit() }}
        className="w-full px-4 py-3 rounded-2xl text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-accent-critical)"
        style={{ ...inputStyle, borderColor: confirm && !matched ? '#fecaca' : 'var(--color-border-subtle)' }}
        placeholder={client.name}
      />

      {error && <div className="mt-3"><ErrorBox msg={error} /></div>}

      <div className="flex items-center gap-2 pt-4">
        <button type="button" onClick={onClose} disabled={busy} className="flex-1 px-5 py-3 rounded-full text-sm font-medium transition-colors hover:bg-(--color-border-subtle) disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-accent-primary)" style={{ background: 'var(--color-muted-bg)', color: 'var(--color-text-primary)' }}>Batal</button>
        <button type="button" onClick={submit} disabled={!matched || busy} className="flex-1 flex items-center justify-center gap-2 px-5 py-3 rounded-full text-sm font-semibold transition-all disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-accent-critical) focus-visible:ring-offset-2" style={{ background: matched && !busy ? '#dc2626' : '#e5e7eb', color: matched && !busy ? 'white' : 'var(--color-text-disabled)' }}>
          {busy ? <><Loader2 className="w-4 h-4 animate-spin" /> Menghapus…</> : <><Trash2 className="w-4 h-4" /> Hapus Permanen</>}
        </button>
      </div>
      </ModalBody>
    </ModalShell>
  )
}

// ── Assign akunting ke klien (Owner only) ─────────────────────
type StaffUser = { id: string; name: string; email: string; role: Role }

export function AssignClientModal({
  client, onClose, onSaved,
}: { client: ClientInfo; onClose: () => void; onSaved: () => void }) {
  const [staff, setStaff] = useState<StaffUser[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    void (async () => {
      try {
        const [uRes, aRes] = await Promise.all([
          fetch('/api/users'),
          fetch(`/api/clients/${client.id}/assignments`),
        ])
        if (!uRes.ok || !aRes.ok) throw new Error()
        const u = (await uRes.json()) as { users: StaffUser[] }
        const a = (await aRes.json()) as { assignments: { userId: string }[] }
        if (!alive) return
        // Hanya staf (akunting/owner) yang bisa ditugaskan.
        setStaff(u.users.filter(x => x.role === 'akunting' || x.role === 'owner'))
        setSelected(new Set(a.assignments.map(x => x.userId)))
      } catch {
        if (alive) setError('Gagal memuat daftar akun.')
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => { alive = false }
  }, [client.id])

  const toggle = (id: string) => setSelected(prev => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id); else next.add(id)
    return next
  })

  const submit = async () => {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/clients/${client.id}/assignments`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userIds: [...selected] }),
      })
      if (!res.ok) {
        const p = (await res.json().catch(() => null)) as { error?: string } | null
        throw new Error(p?.error ?? 'Gagal menyimpan penugasan.')
      }
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menyimpan penugasan.')
      setBusy(false)
    }
  }

  return (
    <ModalShell onDismiss={busy ? null : onClose} label={`Kelola akunting ${client.name}`} className="max-w-[440px]">
      <ModalBody>
      <div className="flex items-start gap-3 mb-4">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'linear-gradient(135deg,#bbb3f3,#a5b4fc)' }}>
          <Users2 className="w-5 h-5" style={{ color: '#1a1a1a' }} />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-base font-bold" style={{ color: 'var(--color-text-primary)' }}>Kelola Akunting</h2>
          <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Siapa yang memegang {client.name}</p>
        </div>
        <button type="button" onClick={onClose} aria-label="Tutup" className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 transition-colors hover:bg-(--color-muted-bg) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-accent-primary)" style={{ color: 'var(--color-text-muted)' }}>
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="rounded-2xl px-3.5 py-2.5 mb-3" style={{ background: 'rgba(187,179,243,0.12)', border: '1px solid rgba(187,179,243,0.3)' }}>
        <p className="text-[11px] leading-relaxed" style={{ color: '#6d5fd0' }}>
          Ini hanya <strong>catatan siapa pegang siapa</strong>. Tidak membatasi akses — semua akunting tetap bisa membuka & mengedit semua klien.
        </p>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 py-6 justify-center" style={{ color: 'var(--color-text-muted)', fontSize: 12 }}>
          <Loader2 className="w-4 h-4 animate-spin" /> Memuat akun…
        </div>
      ) : (
        <>
          <div className="space-y-1 max-h-64 overflow-y-auto -mx-1 px-1">
            {staff.length === 0 ? (
              <p className="text-xs text-center py-6" style={{ color: 'var(--color-text-muted)' }}>Belum ada akun akunting. Buat dulu di Settings → Kelola Akun.</p>
            ) : staff.map(u => {
              const on = selected.has(u.id)
              return (
                <button
                  key={u.id} type="button" onClick={() => toggle(u.id)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-accent-primary)"
                  style={{ background: on ? 'rgba(218,241,99,0.14)' : 'var(--color-muted-bg)', border: on ? '1.5px solid var(--color-accent-primary)' : '1.5px solid transparent' }}
                >
                  <div className="w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0" style={{ background: on ? 'var(--color-accent-primary)' : 'white', border: on ? 'none' : '1.5px solid #d1d5db' }}>
                    {on && <Check className="w-3 h-3" style={{ color: 'var(--color-bg-main)' }} />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold truncate" style={{ color: 'var(--color-text-primary)' }}>{u.name}</p>
                    <p className="text-[10.5px] truncate" style={{ color: 'var(--color-text-muted)' }}>{u.email} · {ROLE_LABEL[u.role]}</p>
                  </div>
                </button>
              )
            })}
          </div>

          {error && <div className="mt-3"><ErrorBox msg={error} /></div>}

          <div className="flex items-center gap-2 pt-4">
            <button type="button" onClick={onClose} disabled={busy} className="flex-1 px-5 py-3 rounded-full text-sm font-medium transition-colors hover:bg-(--color-border-subtle) disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-accent-primary)" style={{ background: 'var(--color-muted-bg)', color: 'var(--color-text-primary)' }}>Batal</button>
            <button type="button" onClick={submit} disabled={busy} className="flex-1 flex items-center justify-center gap-2 px-5 py-3 rounded-full text-sm font-semibold transition-all enabled:hover:-translate-y-px disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-accent-primary) focus-visible:ring-offset-2" style={{ background: busy ? 'var(--color-muted-dark)' : 'var(--color-accent-primary)', color: busy ? 'var(--color-text-muted)' : 'var(--color-accent-primary-fg)' }}>
              {busy ? <><Loader2 className="w-4 h-4 animate-spin" /> Menyimpan…</> : `Simpan (${selected.size})`}
            </button>
          </div>
        </>
      )}
      </ModalBody>
    </ModalShell>
  )
}
