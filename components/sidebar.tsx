'use client'

import { useState, useEffect, useLayoutEffect, useMemo, useRef, useCallback } from 'react'
import {
  LayoutDashboard,
  BarChart2,
  Upload,
  Files,
  FileSignature,
  ArrowRightLeft,
  BookOpen,
  Package,
  Settings,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Building2,
  Menu,
  X,
  LogOut,
  Loader2,
} from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useSession, signOut } from 'next-auth/react'
import { useClient } from '@/lib/client-context'
import { ClientAvatar } from '@/components/client-avatar'
import { ClientSwitcherModal } from '@/components/client-switcher-modal'
import { ROLE_LABEL, canViewContracts } from '@/lib/roles'
import { sumUnmapped } from '@/lib/reports/mapping-status'
import { countNeedsAttention, type ContractBadgeRow } from '@/lib/contracts'
import { todayYmd } from '@/lib/ymd'
import { navItemsForRole, navKey, type NavItemId } from '@/lib/nav-items'
import { computeReportProgress, formatMonth, monthsBehind } from '@/lib/clients/report-progress'

const STORAGE_KEY = 'ngitungid-sidebar-collapsed'
const CAPSULE_TRANSITION = 'transform .48s cubic-bezier(.34,1.42,.5,1), height .48s cubic-bezier(.34,1.42,.5,1)'

// Routes that don't map 1:1 to a menuItems id (extraction-review is step 2 of
// the upload flow; admin-overview has no corresponding nav item).
const ROUTE_ACTIVE_MAP: Record<string, string> = {
  '/extraction-review': 'upload',
  '/admin-overview': '',
}

// id → ikon. Terpisah dari lib/nav-items.ts supaya modul itu tetap murni (bisa
// diuji sebagai data, tanpa menyeret lucide-react). Record ber-key NavItemId,
// jadi tsc yang menagih ikon untuk setiap item baru.
const NAV_ICONS: Record<NavItemId, typeof LayoutDashboard> = {
  dashboard: LayoutDashboard,
  analytics: BarChart2,
  upload: Upload,
  jurnal: BookOpen,
  laporan: Files,
  kontrak: FileSignature,
  'coa-mapping': ArrowRightLeft,
  operational: Package,
  settings: Settings,
}

export function Sidebar() {
  const pathname = usePathname()
  const activeItem = ROUTE_ACTIVE_MAP[pathname] ?? pathname.replace(/^\//, '')
  const { activeClient, isInternal, canDoAccounting, role } = useClient()
  // Sesi login (SessionProvider sudah dipasang di AppShell) — untuk menampilkan
  // siapa yang sedang login & tombol keluar. Beda dari kartu workspace di atas:
  // itu KLIEN yang sedang dikelola, ini AKUN yang sedang dipakai.
  const { data: session, status } = useSession()
  const [isSigningOut, setIsSigningOut] = useState(false)
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [hoveredItem, setHoveredItem] = useState<string | null>(null)
  const [isSwitcherOpen, setIsSwitcherOpen] = useState(false)
  const [isMobileOpen, setIsMobileOpen] = useState(false)
  // Jumlah AKUN yang belum dipetakan di seluruh laporan klien aktif (semua
  // periode) → badge di item "COA Mapping". Re-fetch saat klien/route berubah
  // supaya badge menyusut setelah admin menyelesaikan mapping.
  //
  // Dulu badge ini menghitung JUMLAH LAPORAN berstatus bukan mapped/confirmed —
  // satuan yang berbeda dari halaman /coa-mapping (yang menghitung akun), jadi
  // badge "9" bisa muncul di sebelah halaman yang bilang "0 akun belum
  // dipetakan". Sekarang keduanya menghitung hal yang sama.
  const [pendingMapping, setPendingMapping] = useState(0)
  // Kontrak yang akan berakhir (H-7) untuk klien aktif. Disimpan MENTAH lalu
  // digerbangi saat dirender (lihat `expiringSoon` di bawah) — bukan di-nol-kan
  // lewat setState sinkron di dalam efek seperti pendingMapping, yang menambah
  // warning react-hooks/set-state-in-effect. Baseline repo ini 24 dan tetap 24.
  const [expiringRaw, setExpiringRaw] = useState(0)
  // Jam dibaca SEKALI, bukan per render — dan lewat helper yang sama dengan
  // yang dipakai halaman /kontrak, supaya badge sidebar & badge per baris tidak
  // pernah memakai "hari ini" yang berbeda.
  const [hariIni] = useState(todayYmd)

  const capsuleRef = useRef<HTMLDivElement>(null)
  const itemRefs = useRef<Map<string, HTMLDivElement>>(new Map())
  const hasPositionedCapsule = useRef(false)

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === 'true') setIsCollapsed(true)
  }, [])

  useEffect(() => {
    setIsMobileOpen(false)
  }, [activeItem])

  // Listener klik-di-luar untuk panel switcher DIHAPUS bersama panelnya —
  // ModalShell menangani backdrop & Escape sendiri.

  useEffect(() => {
    // Badge pendingMapping cuma relevan bagi yang boleh mapping (item "COA Mapping" hanya
    // tampil ke staf). Role 'user' tidak perlu — jangan panggil /api/reports/list
    // untuknya (selaras spek read-only Dashboard + Analytics).
    if (!activeClient || !canDoAccounting) { setPendingMapping(0); return }
    let alive = true
    fetch(`/api/reports/list?clientId=${activeClient.id}`)
      .then(r => (r.ok ? r.json() : { reports: [] }))
      .then((d: { reports?: { unmappedCount: number }[] }) => {
        if (alive) setPendingMapping(sumUnmapped(d.reports ?? []))
      })
      .catch(() => { if (alive) setPendingMapping(0) })
    return () => { alive = false }
  }, [activeClient, pathname, canDoAccounting])

  // Badge Kontrak — bentuk efek yang SAMA dengan badge COA Mapping di atas:
  // fetch saat klien/rute berubah, setState hanya di callback promise, flag
  // `alive` membatalkan respons yang datang setelah klien berganti.
  //
  // Yang dihitung: kontrak yang akan berakhir (H-7) DITAMBAH yang sudah
  // berakhir TANPA pengganti. Dulu hanya H-7, sehingga kontrak yang terlanjur
  // lewat justru MENGHILANG dari hitungan — padahal itu kasus yang paling
  // butuh tindakan. Seluruh aturannya ada di countNeedsAttention()
  // (lib/contracts.ts); endpoint-nya cuma mengirim tanggal seluruh kontrak
  // klien ini, karena pengganti bisa mulai kapan saja dan tidak ada jendela
  // tanggal yang bisa menyaringnya tanpa membuang jawabannya.
  //
  // Role 'user' IKUT melihat badge ini: itu kontraknya sendiri. Akunting tidak —
  // ia tidak punya item menu Kontrak sama sekali.
  useEffect(() => {
    if (!activeClient || !canViewContracts(role)) return
    let alive = true
    fetch(`/api/contracts/badge?clientId=${activeClient.id}`)
      .then(r => (r.ok ? r.json() : { contracts: [] }))
      .then((d: { contracts?: ContractBadgeRow[] }) => {
        if (alive) setExpiringRaw(countNeedsAttention(d.contracts ?? [], hariIni))
      })
      .catch(() => { if (alive) setExpiringRaw(0) })
    return () => { alive = false }
  }, [activeClient, pathname, role, hariIni])

  // Gerbang dipasang saat RENDER, bukan dengan menulis 0 ke state di dalam efek.
  const expiringSoon = activeClient && canViewContracts(role) ? expiringRaw : 0

  // Daftar nav + urutannya datang dari lib/nav-items.ts (murni & teruji per
  // role); di sini cuma ditempeli ikon dan badge. Dihitung SEBELUM efek kapsul
  // karena `daftarKey` jadi salah satu dependensinya.
  const menuItems = navItemsForRole(role, { sessionLoading: status === 'loading' }).map(item => ({
    ...item,
    icon: NAV_ICONS[item.id],
    badge:
      item.id === 'coa-mapping'
        ? (pendingMapping > 0 ? String(pendingMapping) : undefined)
        : item.id === 'kontrak'
          ? (expiringSoon > 0 ? String(expiringSoon) : undefined)
          : undefined,
  }))
  const daftarKey = navKey(menuItems)

  // Slides the nav capsule to the active item. `snap` skips the transition
  // (first paint, and window resize where an animated chase would lag/jitter).
  const positionCapsule = useCallback((snap: boolean) => {
    const capsule = capsuleRef.current
    const activeEl = itemRefs.current.get(activeItem)
    if (!capsule) return
    if (!activeEl) {
      capsule.style.opacity = '0'
      return
    }

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const top = activeEl.offsetTop
    const height = activeEl.offsetHeight

    capsule.style.opacity = '1'

    if (snap || reduceMotion) {
      capsule.style.transition = 'none'
      capsule.style.transform = `translateY(${top}px)`
      capsule.style.height = `${height}px`
      void capsule.offsetWidth // flush so the next transition doesn't replay this jump
      capsule.style.transition = reduceMotion ? 'none' : CAPSULE_TRANSITION
    } else {
      capsule.style.transition = CAPSULE_TRANSITION
      capsule.style.transform = `translateY(${top}px)`
      capsule.style.height = `${height}px`
    }
  }, [activeItem])

  // `daftarKey` WAJIB ada di dependensi ini. Kapsul diposisikan dari
  // activeEl.offsetTop, dan offsetTop item aktif berubah begitu daftarnya
  // berubah panjang — yang PASTI terjadi: saat `status === 'loading'` seluruh
  // item tampil, lalu menyusut begitu sesi resolve. Tanpa key ini efeknya tidak
  // pernah jalan lagi (activeItem & isCollapsed tidak berubah), kapsul memakai
  // ukuran susunan yang sudah usang, dan untuk finance di /kontrak ia parkir di
  // bawah Settings sementara item aktifnya sendiri tak terlihat.
  //
  // Perubahan DAFTAR di-snap, bukan dianimasikan: itu bukan navigasi pengguna,
  // jadi kapsul yang meluncur dari posisi lama hanya akan terlihat seperti
  // gangguan. Navigasi (activeItem berubah) tetap beranimasi seperti biasa.
  const lastDaftarKey = useRef(daftarKey)
  useLayoutEffect(() => {
    const daftarBerubah = lastDaftarKey.current !== daftarKey
    lastDaftarKey.current = daftarKey
    positionCapsule(!hasPositionedCapsule.current || daftarBerubah)
    hasPositionedCapsule.current = true
  }, [activeItem, isCollapsed, daftarKey, positionCapsule])

  useEffect(() => {
    const onResize = () => positionCapsule(true)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [positionCapsule])

  const toggleCollapsed = () => {
    const next = !isCollapsed
    setIsCollapsed(next)
    localStorage.setItem(STORAGE_KEY, String(next))
  }

  // Progres laporan klien aktif. Menggantikan "% storage used" yang dulu
  // dihitung dari hash UUID — angka yang tidak pernah berubah walau laporan
  // bertambah, dan istilah "storage" menyiratkan kuota yang tidak ada.
  //
  // `months` sudah ikut di response GET /api/clients yang di-fetch sekali oleh
  // ClientProvider, jadi ini murni perhitungan di memori: tidak ada query per
  // render dan tidak ada request tambahan.
  const progress = useMemo(
    () => computeReportProgress(activeClient?.months ?? [], new Date()),
    [activeClient]
  )
  const behind = monthsBehind(progress)
  const progressPct = progress.kind === 'ratio' && progress.total > 0
    ? Math.round((progress.completed / progress.total) * 100)
    : 0
  // Kuning hanya kalau benar-benar tertinggal; selebihnya lime.
  const progressColor = behind > 0 ? '#f59e0b' : 'var(--color-accent-primary)'
  /** Baris utama. Role 'user' (klien) TIDAK melihat rasio: "3 dari 6 bulan"
   *  terbaca sebagai penilaian atas kinerja tim akunting, bukan sesuatu yang
   *  bisa mereka tindaklanjuti. Mereka cukup tahu datanya sampai kapan. */
  const progressLabel = (() => {
    if (progress.kind === 'none') return 'Belum ada laporan'
    if (!isInternal) return progress.lastMonth ? `Terakhir: ${formatMonth(progress.lastMonth)}` : 'Belum ada laporan'
    if (progress.kind === 'no-window') return 'Terkini'
    return `${progress.completed} dari ${progress.total} bulan`
  })()
  /** Baris kedua (staf saja) — konteks, bukan pengulangan. */
  const progressHint = (() => {
    if (!isInternal || progress.kind === 'none') return null
    const belumLengkap = progress.incompleteMonths.at(-1)
    if (belumLengkap) return `${formatMonth(belumLengkap)} belum lengkap`
    return progress.lastMonth ? `Terakhir: ${formatMonth(progress.lastMonth)}` : null
  })()
  // Owner & akunting sama-sama boleh pindah klien (semua staf lihat semua klien).
  const canSwitch = isInternal

  // signOut() next-auth memanggil endpoint signout → cookie sesi DIHAPUS di
  // server, bukan sekadar pindah halaman. redirect:true supaya user mendarat di
  // /login; kalau ia mencoba balik ke rute terproteksi, proxy.ts memantulkannya
  // lagi karena cookie-nya memang sudah tidak ada.
  const handleSignOut = async () => {
    if (isSigningOut) return
    setIsSigningOut(true)
    try {
      await signOut({ callbackUrl: '/login' })
    } catch {
      setIsSigningOut(false) // gagal → biarkan admin coba lagi
    }
  }

  const userName = session?.user?.name ?? session?.user?.email ?? ''
  const userInitial = userName.charAt(0).toUpperCase() || '?'

  return (
    <>
      {/* Mobile hamburger — only visible on small screens */}
      <button
        type="button"
        aria-label="Buka menu navigasi"
        aria-expanded={isMobileOpen}
        aria-controls="app-sidebar"
        className="md:hidden fixed z-40 flex items-center justify-center rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-accent-primary)"
        style={{ top: '12px', left: '12px', width: '36px', height: '36px', background: 'var(--color-bg-sidebar)' }}
        onClick={() => setIsMobileOpen(true)}
      >
        <Menu className="w-4 h-4" style={{ color: 'var(--color-accent-primary)' }} />
      </button>

      {/* Mobile backdrop */}
      {isMobileOpen && (
        <div
          className="md:hidden fixed inset-0 z-40"
          style={{ background: 'rgba(0,0,0,0.5)' }}
          onClick={() => setIsMobileOpen(false)}
        />
      )}

      <aside
        id="app-sidebar"
        // Dibaca CSS untuk menghitung --app-content-left (lihat globals.css):
        // dialog dipusatkan ke AREA KONTEN, bukan viewport. Sengaja atribut DOM,
        // bukan variabel yang di-set lewat JS — lihat alasannya di globals.css.
        data-collapsed={isCollapsed ? 'true' : 'false'}
        className={`
          h-screen flex flex-col flex-shrink-0 transition-all duration-300 ease-in-out
          fixed inset-y-0 left-0 md:relative md:inset-auto z-50 md:z-auto
          ${isMobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
        `}
        style={{
          width: isCollapsed ? '72px' : '240px',
          background: 'var(--color-bg-sidebar)',
        }}
      >
        {/* Mobile close button */}
        <button
          type="button"
          aria-label="Tutup menu navigasi"
          className="md:hidden absolute z-10 flex items-center justify-center rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-accent-primary)"
          style={{ top: '12px', right: '12px', width: '32px', height: '32px', background: 'rgba(255,255,255,0.1)' }}
          onClick={() => setIsMobileOpen(false)}
        >
          <X className="w-3.5 h-3.5" style={{ color: 'rgba(255,255,255,0.6)' }} />
        </button>

        {/* Toggle button — overlapping right edge, hidden on mobile.
            Hit area 32px (minimum touch target); lingkaran visual tetap 22px
            lewat <span> di dalamnya, jadi tampilannya tidak berubah. */}
        <button
          type="button"
          onClick={toggleCollapsed}
          aria-label={isCollapsed ? 'Perlebar sidebar' : 'Perkecil sidebar'}
          aria-expanded={!isCollapsed}
          className="ng-edge-toggle hidden md:flex absolute z-10 items-center justify-center focus-visible:outline-none"
          style={{
            width: '32px', height: '32px', background: 'transparent', border: 'none', padding: 0,
            top: '50%', right: '-16px', transform: 'translateY(-50%)',
          }}
        >
          <span
            aria-hidden="true"
            className="ng-edge-toggle-dot flex items-center justify-center transition-all duration-200"
            style={{
              width: '22px', height: '22px', borderRadius: '50%',
              background: 'var(--color-bg-sidebar)', border: '1.5px solid rgba(255,255,255,0.15)',
            }}
          >
            {isCollapsed
              ? <ChevronRight className="w-3 h-3" style={{ color: 'var(--color-accent-primary)' }} />
              : <ChevronLeft className="w-3 h-3" style={{ color: 'var(--color-accent-primary)' }} />
            }
          </span>
        </button>

        {/* Logo */}
        <div
          className="px-4 py-6 flex items-center"
          style={{ justifyContent: isCollapsed ? 'center' : 'flex-start' }}
        >
          <div className="flex items-center gap-3 min-w-0">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: 'var(--color-accent-primary)' }}
            >
              <span className="font-bold text-base" style={{ color: 'var(--color-bg-sidebar)' }}>N</span>
            </div>
            {!isCollapsed && (
              <div className="min-w-0 overflow-hidden whitespace-nowrap">
                <div className="font-bold text-sm leading-tight" style={{ color: 'white' }}>NgitungID BI</div>
                <div className="text-xs leading-tight" style={{ color: 'rgba(255,255,255,0.5)' }}>Financial Analytics</div>
              </div>
            )}
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 space-y-0.5 relative">
          {/* Sliding active-item capsule — measured/positioned imperatively, see positionCapsule.
              left-3/right-3 menyamakan lebarnya dengan nav item: kapsul ini absolute,
              jadi left-0 akan mengacu ke padding box <nav> dan melebar 12px di tiap
              sisi melewati highlight hover yang ada di dalam content box (px-3). */}
          <div
            ref={capsuleRef}
            aria-hidden="true"
            className="absolute left-3 right-3 top-0 z-0 pointer-events-none ng-nav-capsule"
            style={{
              borderRadius: 18,
              background: 'var(--color-accent-primary)',
              boxShadow: '0 4px 14px rgba(218,241,99,0.3)',
              height: 0,
              opacity: 0,
              transform: 'translateY(0px)',
            }}
          />

          {menuItems.map((item) => {
            const Icon = item.icon
            const isActive = activeItem === item.id
            const isComingSoon = !!item.comingSoon
            const isHovered = hoveredItem === item.id

            return (
              <div
                key={item.id}
                ref={(el) => {
                  if (el && !isComingSoon) itemRefs.current.set(item.id, el)
                  else itemRefs.current.delete(item.id)
                }}
                className="relative"
                style={{ zIndex: 1 }}
              >
                <Link
                  href={isComingSoon ? '#' : `/${item.id}`}
                  onClick={isComingSoon ? (e) => e.preventDefault() : undefined}
                  // Tooltip saat sidebar collapsed: focus/blur ikut dipasang supaya
                  // pengguna keyboard mendapat tooltip yang sama seperti pengguna mouse.
                  onMouseEnter={() => setHoveredItem(item.id)}
                  onMouseLeave={() => setHoveredItem(null)}
                  onFocus={() => setHoveredItem(item.id)}
                  onBlur={() => setHoveredItem(null)}
                  data-active={isActive}
                  data-soon={isComingSoon}
                  aria-current={isActive ? 'page' : undefined}
                  aria-disabled={isComingSoon || undefined}
                  className="ng-nav-link flex items-center gap-3 px-3 py-2.5 text-sm rounded-2xl relative"
                  style={{ justifyContent: isCollapsed ? 'center' : 'flex-start' }}
                >
                  <div className="relative flex-shrink-0">
                    <Icon className="w-[17px] h-[17px]" />
                    {item.badge && !isComingSoon && isCollapsed && (
                      <span
                        className="absolute rounded-full"
                        style={{ width: '7px', height: '7px', top: '-3px', right: '-3px', background: isActive ? 'var(--color-bg-sidebar)' : 'var(--color-accent-primary)' }}
                      />
                    )}
                  </div>
                  {!isCollapsed && (
                    <>
                      <span className="flex-1 whitespace-nowrap overflow-hidden">{item.label}</span>
                      {item.badge && !isComingSoon && (
                        <span
                          className="min-w-[18px] h-[18px] rounded-full flex items-center justify-center text-[10px] font-bold px-1 flex-shrink-0"
                          style={{ background: isActive ? 'var(--color-bg-sidebar)' : 'var(--color-accent-primary)', color: isActive ? 'var(--color-accent-primary)' : 'var(--color-bg-sidebar)' }}
                        >
                          {item.badge}
                        </span>
                      )}
                      {isComingSoon && (
                        <span
                          className="text-[9px] font-semibold rounded px-1 py-0.5 leading-none flex-shrink-0"
                          style={{ color: 'rgba(255,255,255,0.5)', border: '1px solid rgba(255,255,255,0.15)' }}
                        >
                          SOON
                        </span>
                      )}
                    </>
                  )}
                </Link>

                {/* Tooltip when collapsed */}
                {isCollapsed && isHovered && (
                  <div
                    className="absolute left-full ml-2 top-1/2 -translate-y-1/2 px-2.5 py-1.5 rounded-lg whitespace-nowrap z-50 pointer-events-none"
                    style={{ background: 'var(--color-bg-sidebar)', border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 4px 12px rgba(0,0,0,0.3)' }}
                  >
                    <span className="text-xs font-medium" style={{ color: 'white' }}>
                      {item.label}{isComingSoon ? ' (Soon)' : ''}
                    </span>
                  </div>
                )}
              </div>
            )
          })}
        </nav>

        {/* Bottom workspace card — clickable client switcher for admin */}
        <div className="px-4 py-5">
          <div className="relative">
            <button
              type="button"
              onClick={() => canSwitch && setIsSwitcherOpen(true)}
              aria-haspopup={canSwitch ? 'dialog' : undefined}
              aria-expanded={canSwitch ? isSwitcherOpen : undefined}
              aria-label={
                activeClient ? `Ganti klien — sekarang ${activeClient.name}` : 'Pilih klien untuk mulai mengelola'
              }
              className="w-full rounded-2xl transition-all duration-300 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-accent-primary)"
              style={{
                background: 'rgba(255,255,255,0.05)',
                padding: isCollapsed ? '8px' : '12px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: isCollapsed ? 'center' : 'stretch',
                border: !activeClient && canSwitch ? '1.5px dashed rgba(218,241,99,0.4)' : '1.5px solid transparent',
                cursor: canSwitch ? 'pointer' : 'default',
              }}
            >
              {isCollapsed ? (
                <div className="relative">
                  {activeClient ? (
                    <>
                      <ClientAvatar client={activeClient} size={32} rounded={999} fontSize={12} />
                      <span
                        className="absolute rounded-full"
                        style={{ width: '8px', height: '8px', bottom: '-2px', right: '-2px', background: progressColor, border: '2px solid var(--color-bg-sidebar)' }}
                      />
                    </>
                  ) : (
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center"
                      style={{ border: '1.5px dashed rgba(218,241,99,0.5)' }}
                    >
                      <Building2 className="w-3.5 h-3.5" style={{ color: 'rgba(218,241,99,0.6)' }} />
                    </div>
                  )}
                </div>
              ) : (
                <>
                  {activeClient ? (
                    <>
                      <div className="flex items-center justify-between mb-0.5">
                        <p className="text-[11px] whitespace-nowrap overflow-hidden" style={{ color: 'rgba(255,255,255,0.5)' }}>
                          {isInternal ? 'Mengelola klien' : 'Workspace Bisnis'}
                        </p>
                        {canSwitch && <ChevronDown className="w-3 h-3 flex-shrink-0" style={{ color: 'rgba(255,255,255,0.5)' }} />}
                      </div>
                      <p className="text-sm font-semibold mb-2.5 whitespace-nowrap overflow-hidden" style={{ color: 'white' }}>
                        {activeClient.name}
                      </p>
                      {/* Bar hanya bermakna kalau ada jendela penilaian; untuk
                          klien tanpa laporan atau role 'user' ia dihilangkan
                          supaya tidak memberi kesan "0% = tertinggal". */}
                      {isInternal && progress.kind === 'ratio' && (
                        <div className="w-full h-1 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.1)' }}>
                          <div
                            className="h-full rounded-full transition-all duration-500"
                            style={{ width: `${progressPct}%`, background: progressColor }}
                          />
                        </div>
                      )}
                      <p className="text-[10px] mt-1 whitespace-nowrap" style={{ color: 'rgba(255,255,255,0.5)' }}>
                        {progressLabel}
                      </p>
                      {progressHint && (
                        <p className="text-[10px] whitespace-nowrap" style={{ color: 'rgba(255,255,255,0.5)' }}>
                          {progressHint}
                        </p>
                      )}
                    </>
                  ) : (
                    <div className="flex items-center gap-2.5">
                      <div
                        className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
                        style={{ border: '1.5px dashed rgba(218,241,99,0.5)' }}
                      >
                        <Building2 className="w-3.5 h-3.5" style={{ color: 'rgba(218,241,99,0.6)' }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium" style={{ color: 'var(--color-accent-primary)' }}>Pilih klien</p>
                        <p className="text-[10px]" style={{ color: 'rgba(255,255,255,0.5)' }}>untuk mulai mengelola</p>
                      </div>
                      <ChevronDown className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'rgba(255,255,255,0.5)' }} />
                    </div>
                  )}
                </>
              )}
            </button>

            {/* Daftar klien SUDAH TIDAK di sini. Panel yang berjangkar ke kartu
                ini tumbuh ke atas sampai menutupi seluruh nav (Dashboard s/d
                Settings) begitu kliennya belasan — dan karena tingginya dibatasi
                sidebar, membatasi max-height cuma mengurangi masalahnya. Kini
                ClientSwitcherModal, dirender di bawah. */}
          </div>
        </div>

        {/* Akun yang sedang login + keluar. Sengaja DI BAWAH kartu workspace dan
            dipisah garis: kartu di atas = klien yang dikelola, blok ini = akun
            yang dipakai. Avatar-nya lilac (bukan lime) supaya dua konsep itu
            tidak tertukar secara visual. Relevan sejak tiap akunting punya akun
            sendiri & bisa berbagi device. */}
        {session?.user && (
          <div
            className="px-4 pb-5 pt-4"
            style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }}
          >
            {isCollapsed ? (
              <div className="flex flex-col items-center gap-2">
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                  style={{ background: 'var(--color-accent-secondary)', color: '#1a1a1a' }}
                  title={userName}
                >
                  {userInitial}
                </div>
                <div className="relative">
                  <button
                    type="button"
                    onClick={handleSignOut}
                    disabled={isSigningOut}
                    aria-label={`Keluar dari akun ${userName}`}
                    onMouseEnter={() => setHoveredItem('__logout')}
                    onMouseLeave={() => setHoveredItem(null)}
                    onFocus={() => setHoveredItem('__logout')}
                    onBlur={() => setHoveredItem(null)}
                    className="ng-logout-btn flex items-center justify-center rounded-xl"
                    style={{ width: 32, height: 32 }}
                  >
                    {isSigningOut
                      ? <Loader2 className="w-4 h-4 animate-spin" />
                      : <LogOut className="w-4 h-4" />}
                  </button>
                  {hoveredItem === '__logout' && (
                    <div
                      className="absolute left-full ml-2 top-1/2 -translate-y-1/2 px-2.5 py-1.5 rounded-lg whitespace-nowrap z-50 pointer-events-none"
                      style={{ background: 'var(--color-bg-sidebar)', border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 4px 12px rgba(0,0,0,0.3)' }}
                    >
                      <span className="text-xs font-medium" style={{ color: 'white' }}>Keluar</span>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2.5">
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                  style={{ background: 'var(--color-accent-secondary)', color: '#1a1a1a' }}
                >
                  {userInitial}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold truncate" style={{ color: 'white' }}>
                    {session.user.name || session.user.email}
                  </p>
                  <p className="text-[10px] truncate" style={{ color: 'rgba(255,255,255,0.5)' }}>
                    {ROLE_LABEL[session.user.role] ?? 'Klien'}
                    {session.user.name && session.user.email ? ` · ${session.user.email}` : ''}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleSignOut}
                  disabled={isSigningOut}
                  aria-label={`Keluar dari akun ${userName}`}
                  title="Keluar"
                  className="ng-logout-btn flex items-center justify-center rounded-xl flex-shrink-0"
                  style={{ width: 32, height: 32 }}
                >
                  {isSigningOut
                    ? <Loader2 className="w-4 h-4 animate-spin" />
                    : <LogOut className="w-4 h-4" />}
                </button>
              </div>
            )}
          </div>
        )}

      </aside>

      {/* Di-portal ke <body> oleh ModalShell, jadi ia TIDAK terkurung <aside>
          dan tidak pernah bisa menutupi nav — inti perpindahan dari panel
          berjangkar ke modal. */}
      {isSwitcherOpen && canSwitch && (
        <ClientSwitcherModal onClose={() => setIsSwitcherOpen(false)} />
      )}
    </>
  )
}