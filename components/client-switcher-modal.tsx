'use client'

import { Fragment, useCallback, useEffect, useRef, useState } from 'react'
import { Search, Check, LayoutGrid, X, Building2 } from 'lucide-react'
import { ModalShell } from '@/components/ui/modal-portal'
import { ClientAvatar } from '@/components/client-avatar'
import { useClient, type ClientInfo } from '@/lib/client-context'
import { filterClients, recentClients, shouldShowRecents } from '@/lib/client-switcher'

// Modal pemilih klien — MENGGANTIKAN panel yang dulu menempel di kartu
// workspace sidebar.
//
// ══ KENAPA MODAL, BUKAN PANEL YANG DIBATASI TINGGINYA ══════════════════════
// Panel lama tumbuh ke ATAS sampai menutupi seluruh sidebar: Dashboard,
// Analytics, Kontrak, Settings hilang, dan Admin Overview tak terjangkau.
// Terlihat di produksi dengan 12 klien. Panel yang berjangkar ke sidebar SELALU
// dibatasi tinggi sidebar itu sendiri, jadi memberi max-height hanya mengurangi
// masalahnya — daftarnya tetap tumbuh di atas nav. Modal punya ruangnya
// sendiri dan tidak pernah bisa menutupi nav.
//
// Skalanya yang menentukan: tiap akunting memegang ~15 klien dan ada 4 orang,
// jadi seorang owner cepat atau lambat melihat ~60 entri.
//
// ══ PERMUKAAN GELAP, DAN INI BUKAN DARK MODE ═══════════════════════════════
// Kanvas #222124 + aksen lime, mengikuti palet sidebar karena modal ini memang
// bagian dari sidebar. Dark mode TIDAK didukung di app ini dan blok
// prefers-color-scheme sengaja dihapus dari globals.css — tidak ada media query
// baru di sini, dan globals.css tidak disentuh.
//
// Konsekuensinya SETIAP warna teks di bawah diset eksplisit. Mode gagal yang
// sudah diketahui: teks yang mewarisi warna permukaan terang akan HILANG SAMA
// SEKALI di sini, bukan sekadar kurang kontras. Nilai muted rgba(255,255,255,
// 0.5) dipakai konsisten karena sudah terukur 5,04:1 di atas kanvas ini (lihat
// catatan .ng-nav-link[data-soon] di globals.css) — lolos AA.

type Section = 'overview' | 'recent' | 'all'
type Row =
  | { key: string; section: Section; kind: 'overview' }
  | { key: string; section: Section; kind: 'client'; client: ClientInfo }

const MUTED = 'rgba(255,255,255,0.5)'

export function ClientSwitcherModal({ onClose }: { onClose: () => void }) {
  const { clients, activeClient, setActiveClient, recentClientIds } = useClient()
  const [query, setQuery] = useState('')
  const [activeIdx, setActiveIdx] = useState(0)
  // SATU ref di wadah yang bergulir, bukan satu ref per baris: ref callback
  // yang dibuat di dalam map dianggap 'akses ref saat render' oleh React
  // Compiler. Baris aktif ditemukan lewat atribut data-nya.
  const listRef = useRef<HTMLDivElement>(null)

  const hasil = filterClients(clients, query)
  const recents = recentClients(clients, recentClientIds, { excludeId: activeClient?.id ?? null })
  const showRecents = shouldShowRecents(clients.length, recents.length, query)
  const mencari = query.trim() !== ''

  // Urutan baris = urutan VISUAL, supaya panah atas/bawah menyusurinya persis
  // seperti yang terlihat. Klien yang muncul di pintasan DAN di daftar penuh
  // sengaja punya dua baris (dan dua key) — itu memang dua tempat di layar.
  const rows: Row[] = [
    // Admin Overview disembunyikan saat mengetik: ia tidak pernah cocok dengan
    // pencarian nama klien, dan menyisakannya cuma menggeser hasil ke bawah.
    ...(mencari ? [] : [{ key: 'overview', section: 'overview' as const, kind: 'overview' as const }]),
    ...(showRecents
      ? recents.map(c => ({ key: `recent:${c.id}`, section: 'recent' as const, kind: 'client' as const, client: c }))
      : []),
    ...hasil.map(c => ({ key: `all:${c.id}`, section: 'all' as const, kind: 'client' as const, client: c })),
  ]

  // Dijepit saat RENDER, bukan lewat efek yang menulis state — daftar menyusut
  // tiap kali huruf diketik, dan indeks lama bisa melewati ujungnya.
  const idx = Math.min(activeIdx, Math.max(0, rows.length - 1))
  const activeKey = rows[idx]?.key ?? ''

  // Fokus awal lewat ref callback, BUKAN autoFocus/useEffect: isi ModalShell
  // baru menempel setelah render pertama portal-nya (lihat modal-portal.tsx),
  // jadi fokus yang dipasang lebih awal tidak kena sasaran.
  const setInput = useCallback((node: HTMLInputElement | null) => { node?.focus() }, [])

  useEffect(() => {
    if (!activeKey) return
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [activeKey])

  const pilih = (row: Row) => {
    // Apa yang terjadi saat berpindah TIDAK berubah — tetap setActiveClient
    // yang sama seperti dropdown lama.
    setActiveClient(row.kind === 'overview' ? null : row.client)
    onClose()
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx(Math.min(idx + 1, rows.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIdx(Math.max(idx - 1, 0)) }
    else if (e.key === 'Home') { e.preventDefault(); setActiveIdx(0) }
    else if (e.key === 'End') { e.preventDefault(); setActiveIdx(rows.length - 1) }
    else if (e.key === 'Enter') {
      e.preventDefault()
      const r = rows[idx]
      if (r) pilih(r)
    }
    // Escape ditangani ModalShell — jangan pasang listener kedua.
  }

  const judulSeksi = (teks: string) => (
    <p className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: MUTED, padding: '10px 12px 4px' }}>
      {teks}
    </p>
  )

  return (
    <ModalShell onDismiss={onClose} labelledBy="client-switcher-title" className="max-w-lg" surface="dark">
      {/* Header + pencarian: DIPATOK di atas (flex-shrink-0), daftarnya yang
          bergulir. Tanpa ini, mengetik akan menggeser kolom pencarian keluar. */}
      <div className="flex-shrink-0" style={{ padding: '16px 18px 12px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
        <div className="flex items-start justify-between gap-3 mb-3">
          <div>
            <h2 id="client-switcher-title" className="text-sm font-bold" style={{ color: 'white' }}>
              Pilih Klien
            </h2>
            <p className="text-[11px]" style={{ color: MUTED }}>
              {clients.length} klien · ketik untuk mencari
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup pemilih klien"
            className="inline-flex items-center justify-center rounded-full flex-shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-accent-primary)"
            style={{ width: 30, height: 30, border: '1px solid rgba(255,255,255,0.12)', background: 'transparent', color: 'rgba(255,255,255,0.7)', cursor: 'pointer' }}
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute pointer-events-none" style={{ left: 12, top: '50%', transform: 'translateY(-50%)', color: MUTED }} />
          <input
            ref={setInput}
            type="text"
            value={query}
            onChange={e => { setQuery(e.target.value); setActiveIdx(0) }}
            onKeyDown={onKeyDown}
            placeholder="Cari nama klien…"
            aria-label="Cari nama klien"
            aria-controls="client-switcher-list"
            className="w-full rounded-xl text-sm placeholder:text-white/50 focus-visible:outline-none"
            style={{
              padding: '9px 12px 9px 34px',
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.12)',
              color: 'white',
            }}
          />
        </div>
      </div>

      {/* Daftar bergulir DI DALAM modal. ModalShell membatasi max-h-[85vh],
          jadi di layar 720px tinggi modal mentok ~612px dan tidak pernah
          melewati viewport; yang memanjang cuma area ini. */}
      <div ref={listRef} id="client-switcher-list" role="listbox" aria-label="Daftar klien" className="flex-1 min-h-0 overflow-y-auto" style={{ padding: 8 }}>
        {rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center text-center" style={{ padding: '32px 16px', gap: 10 }}>
            <div className="w-11 h-11 rounded-2xl flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.06)' }}>
              <Building2 className="w-5 h-5" style={{ color: MUTED }} />
            </div>
            <p className="text-xs font-semibold" style={{ color: 'white' }}>Tidak ada klien cocok</p>
            <p className="text-[11px]" style={{ color: MUTED }}>
              Tidak ada nama klien yang memuat &ldquo;{query.trim()}&rdquo;.
            </p>
          </div>
        ) : (
          // Dirender langsung dari `rows` dengan indeksnya sendiri — indeks
          // visual dan indeks navigasi panah karenanya TIDAK BISA menyimpang.
          // Judul seksi disisipkan saat seksinya berganti, bukan dihitung
          // terpisah.
          rows.map((row, i) => {
            const terpilih = row.kind === 'overview' ? !activeClient : activeClient?.id === row.client.id
            const disorot = i === idx
            const seksiBaru = rows[i - 1]?.section !== row.section
            return (
              <Fragment key={row.key}>
                {seksiBaru && row.section === 'recent' && judulSeksi('Terakhir Dibuka')}
                {seksiBaru && row.section === 'all' && showRecents && (
                  <>
                    <div style={{ height: 1, background: 'rgba(255,255,255,0.08)', margin: '8px 12px' }} />
                    {judulSeksi('Semua Klien')}
                  </>
                )}
                <button
                  type="button"
                  role="option"
                  data-active={disorot ? 'true' : undefined}
                  aria-selected={terpilih}
                  onClick={() => pilih(row)}
                  onMouseEnter={() => setActiveIdx(i)}
                  className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left rounded-xl focus-visible:outline-none"
                  style={{
                    background: disorot ? 'rgba(255,255,255,0.08)' : 'transparent',
                    cursor: 'pointer',
                    minHeight: 44,
                  }}
                >
                  {row.kind === 'overview' ? (
                    <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(255,255,255,0.08)' }}>
                      <LayoutGrid className="w-3.5 h-3.5" style={{ color: 'rgba(255,255,255,0.7)' }} />
                    </div>
                  ) : row.client.hasLogo ? (
                    <ClientAvatar client={row.client} size={28} rounded={8} />
                  ) : (
                    <div
                      className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 text-xs font-bold"
                      style={{
                        background: terpilih ? 'var(--color-accent-primary)' : 'rgba(255,255,255,0.08)',
                        color: terpilih ? 'var(--color-bg-sidebar)' : 'white',
                      }}
                    >
                      {row.client.name.charAt(0)}
                    </div>
                  )}

                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate" style={{ color: 'white' }}>
                      {row.kind === 'overview' ? 'Admin Overview' : row.client.name}
                    </p>
                    <p className="text-[10px] truncate" style={{ color: MUTED }}>
                      {row.kind === 'overview' ? 'Lihat semua klien' : row.client.type}
                    </p>
                  </div>

                  {terpilih && <Check className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'var(--color-accent-primary)' }} />}
                </button>
              </Fragment>
            )
          })
        )}
      </div>
    </ModalShell>
  )
}
