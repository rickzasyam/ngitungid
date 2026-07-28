'use client'

import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown, Search } from 'lucide-react'

// Dropdown bergaya milik design system, diekstrak dari dropdown "Pilih dari
// Master COA..." di /coa-mapping supaya form CRUD Master COA memakai tampilan
// yang sama persis — satu implementasi, bukan dua yang bisa menyimpang.
//
// Menggantikan `<select>` native yang panelnya digambar OS dan mustahil digayakan.
// Konsekuensinya harus dibayar eksplisit, karena native memberi ini gratis:
//   - navigasi keyboard (panah, Enter, Esc, Home/End)
//   - ARIA listbox/option
//   - panel yang tidak pernah terpotong induknya
// Ketiganya ditangani di bawah.

export interface StyledOption {
  value: string
  label: string
  /** badge kecil di kiri label (dipakai untuk kode COA). */
  badge?: string
  /** header pengelompokan; opsi tanpa group tampil lebih dulu tanpa header. */
  group?: string
  /** 'action' = baris aksi (mis. "+ nilai baru"), digayakan berbeda & tidak
   *  dianggap sebagai nilai tersimpan. 'placeholder' = "belum memilih". */
  kind?: 'normal' | 'action' | 'placeholder'
}

interface Props {
  options: StyledOption[]
  value: string
  onChange: (value: string, option: StyledOption) => void
  /** Teks tombol saat belum ada nilai. */
  placeholder?: string
  searchable?: boolean
  searchPlaceholder?: string
  emptyText?: string
  disabled?: boolean
  ariaLabel?: string
  /** Buka/tutup dikendalikan induk (dipakai /coa-mapping yang hanya membolehkan
   *  satu kartu terbuka sekaligus). Kalau tidak diisi, komponen mengurus sendiri. */
  isOpen?: boolean
  onOpenChange?: (open: boolean) => void
  searchQuery?: string
  onSearchChange?: (q: string) => void
}

const PANEL_MAX_H = 260
const GAP = 6

export function StyledSelect({
  options,
  value,
  onChange,
  placeholder = 'Pilih…',
  searchable = false,
  searchPlaceholder = 'Cari…',
  emptyText = 'Tidak ditemukan',
  disabled,
  ariaLabel,
  isOpen: isOpenProp,
  onOpenChange,
  searchQuery: queryProp,
  onSearchChange,
}: Props) {
  const [openSelf, setOpenSelf] = useState(false)
  const [querySelf, setQuerySelf] = useState('')
  const isControlled = isOpenProp !== undefined
  const open = isControlled ? isOpenProp : openSelf
  const query = queryProp !== undefined ? queryProp : querySelf

  const setOpen = useCallback(
    (v: boolean) => {
      if (isControlled) onOpenChange?.(v)
      else setOpenSelf(v)
    },
    [isControlled, onOpenChange]
  )
  const setQuery = useCallback(
    (q: string) => {
      if (queryProp !== undefined) onSearchChange?.(q)
      else setQuerySelf(q)
    },
    [queryProp, onSearchChange]
  )

  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const [activeIdx, setActiveIdx] = useState(0)
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return options
    return options.filter(
      o =>
        o.kind === 'action' ||
        o.label.toLowerCase().includes(q) ||
        (o.badge ?? '').toLowerCase().includes(q)
    )
  }, [options, query])

  /** Indeks opsi yang benar-benar bisa dipilih (semua, kecuali header semu). */
  const selectable = filtered

  const selected = options.find(o => o.value === value && o.kind !== 'action')

  // ── Posisi panel ─────────────────────────────────────────────────────────
  // Panel di-portal ke <body> dan diposisikan `fixed` dari rect trigger.
  // Alasannya konkret: dropdown ini dipakai DI DALAM dialog yang isinya
  // `overflow-y-auto`. Panel absolut biasa akan terpotong batas dialog persis
  // saat paling dibutuhkan — baris terbawah form, daftar panjang, layar pendek.
  // Dengan portal + fixed, satu-satunya batas adalah viewport, dan kalau ruang
  // di bawah kurang, panel dibalik ke atas serta tingginya dijepit.
  const [pos, setPos] = useState<{ left: number; top: number; width: number; maxH: number } | null>(null)

  const place = useCallback(() => {
    const el = triggerRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const below = window.innerHeight - r.bottom - GAP - 8
    const above = r.top - GAP - 8
    const flip = below < 160 && above > below
    const maxH = Math.max(120, Math.min(PANEL_MAX_H, flip ? above : below))
    setPos({
      left: r.left,
      top: flip ? r.top - GAP - maxH : r.bottom + GAP,
      width: r.width,
      maxH,
    })
  }, [])

  useLayoutEffect(() => {
    if (!open) return
    place()
    // Scroll di kontainer mana pun (capture) + resize → panel ikut menempel.
    const onScroll = () => place()
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', onScroll)
    return () => {
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', onScroll)
    }
  }, [open, place])

  useEffect(() => {
    if (open) setActiveIdx(Math.max(0, selectable.findIndex(o => o.value === value)))
  }, [open, value, selectable])

  // Klik di luar menutup panel.
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node
      if (triggerRef.current?.contains(t) || panelRef.current?.contains(t)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open, setOpen])

  const commit = (opt: StyledOption) => {
    onChange(opt.value, opt)
    setOpen(false)
    setQuery('')
    triggerRef.current?.focus({ preventScroll: true })
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        setOpen(true)
      }
      return
    }
    if (e.key === 'Escape') {
      // WAJIB: tanpa ini Esc merambat ke dialog dan menutup SELURUH form,
      // padahal pengguna cuma bermaksud menutup dropdown.
      e.preventDefault()
      e.stopPropagation()
      setOpen(false)
      triggerRef.current?.focus({ preventScroll: true })
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIdx(i => Math.min(selectable.length - 1, i + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIdx(i => Math.max(0, i - 1))
    } else if (e.key === 'Home') {
      e.preventDefault()
      setActiveIdx(0)
    } else if (e.key === 'End') {
      e.preventDefault()
      setActiveIdx(selectable.length - 1)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const opt = selectable[activeIdx]
      if (opt) commit(opt)
    }
  }

  // Jaga opsi aktif tetap terlihat saat dinavigasi dengan panah.
  useEffect(() => {
    if (!open) return
    panelRef.current?.querySelector<HTMLElement>('[data-active="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [activeIdx, open])

  // useId(): stabil antara server & klien, dan tidak menyentuh ref saat render.
  const listboxId = useId()

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={() => setOpen(!open)}
        onKeyDown={onKeyDown}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        aria-label={ariaLabel}
        className="w-full flex items-center gap-2 px-3 py-2.5 rounded-2xl text-left transition-all duration-200 disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-accent-primary) focus-visible:ring-offset-1"
        style={{
          background: 'white',
          border: open
            ? '1.5px solid var(--color-accent-secondary)'
            : selected
              ? '1.5px solid var(--color-accent-primary)'
              : '1.5px solid #e5e5e5',
          boxShadow: open ? '0 0 0 3px rgba(167,139,250,0.1)' : 'none',
        }}
      >
        {selected ? (
          <div className="flex items-center gap-2 flex-1 min-w-0">
            {selected.badge && (
              <span
                className="text-[10px] font-semibold px-1.5 py-0.5 rounded flex-shrink-0"
                style={{ background: '#f0f0f0', color: '#6b7280' }}
              >
                {selected.badge}
              </span>
            )}
            <span className="text-sm font-medium truncate" style={{ color: '#2d2d2d' }}>
              {selected.label}
            </span>
          </div>
        ) : (
          /* Placeholder sengaja abu-abu & memakai teks berbingkai em-dash,
             supaya tidak pernah tertukar dengan nilai NYATA yang kebetulan
             pendek seperti "-". */
          <span className="flex-1 text-sm truncate" style={{ color: '#9ca3af' }}>
            {placeholder}
          </span>
        )}
        <ChevronDown
          className="w-4 h-4 flex-shrink-0 transition-transform duration-200"
          style={{ color: '#9ca3af', transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}
        />
      </button>

      {open && mounted && pos &&
        createPortal(
          <div
            ref={panelRef}
            id={listboxId}
            role="listbox"
            aria-label={ariaLabel}
            onKeyDown={onKeyDown}
            className="rounded-2xl overflow-hidden animate-fade-in"
            style={{
              position: 'fixed',
              left: pos.left,
              top: pos.top,
              width: pos.width,
              maxHeight: pos.maxH,
              background: 'white',
              border: '1px solid #e5e5e5',
              boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
              display: 'flex',
              flexDirection: 'column',
              // Di atas dialog (z-50) supaya tak tertimpa footer/aksi dialog.
              zIndex: 60,
            }}
          >
            {searchable && (
              <div className="p-2 flex-shrink-0" style={{ borderBottom: '1px solid #f0f0f0' }}>
                <div className="flex items-center gap-2 px-2 py-1.5 rounded-xl" style={{ background: '#f8f8f8' }}>
                  <Search className="w-3.5 h-3.5 flex-shrink-0" style={{ color: '#9ca3af' }} />
                  <input
                    autoFocus
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    onKeyDown={onKeyDown}
                    placeholder={searchPlaceholder}
                    className="flex-1 text-xs outline-none bg-transparent"
                    style={{ color: '#2d2d2d' }}
                  />
                </div>
              </div>
            )}

            <div className="overflow-y-auto flex-1">
              {selectable.length === 0 ? (
                <div className="px-3 py-4 text-center">
                  <p className="text-xs" style={{ color: '#9ca3af' }}>{emptyText}</p>
                </div>
              ) : (
                selectable.map((opt, i) => {
                  const prev = selectable[i - 1]
                  const showGroup = opt.group && opt.group !== prev?.group
                  const isSel = opt.value === value && opt.kind !== 'action'
                  return (
                    <div key={`${opt.value}-${i}`}>
                      {showGroup && (
                        <div
                          className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider"
                          style={{ color: '#9ca3af', background: '#fafafa' }}
                        >
                          {opt.group}
                        </div>
                      )}
                      <button
                        type="button"
                        role="option"
                        aria-selected={isSel}
                        data-active={activeIdx === i}
                        onMouseEnter={() => setActiveIdx(i)}
                        onClick={() => commit(opt)}
                        className="w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors focus-visible:outline-none"
                        style={{
                          background: isSel ? '#f9fff3' : activeIdx === i ? '#f8f8f8' : 'transparent',
                        }}
                      >
                        {opt.badge && (
                          <span
                            className="text-[10px] font-semibold px-1.5 py-0.5 rounded flex-shrink-0"
                            style={{ background: '#f0f0f0', color: '#6b7280' }}
                          >
                            {opt.badge}
                          </span>
                        )}
                        <span
                          className="text-sm truncate"
                          style={{
                            color:
                              opt.kind === 'action'
                                ? 'var(--color-accent-secondary-fg, #6d5fd0)'
                                : opt.kind === 'placeholder'
                                  ? '#9ca3af'
                                  : '#2d2d2d',
                            fontWeight: opt.kind === 'action' ? 600 : 400,
                          }}
                        >
                          {opt.label}
                        </span>
                      </button>
                    </div>
                  )
                })
              )}
            </div>
          </div>,
          document.body
        )}
    </div>
  )
}
