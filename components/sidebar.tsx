'use client'

import { useState, useEffect, useLayoutEffect, useMemo, useRef, useCallback } from 'react'
import {
  LayoutDashboard,
  BarChart2,
  Upload,
  Files,
  FileSignature,
  ArrowRightLeft,
  Package,
  Settings,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Building2,
  LayoutGrid,
  Check,
  Menu,
  X,
  LogOut,
  Loader2,
} from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useSession, signOut } from 'next-auth/react'
import { useClient, ClientInfo } from '@/lib/client-context'
import { ClientAvatar } from '@/components/client-avatar'
import { ROLE_LABEL, canViewContracts } from '@/lib/roles'
import { sumUnmapped } from '@/lib/reports/mapping-status'
import { countExpiringSoon } from '@/lib/contracts'
import { todayYmd } from '@/lib/ymd'
import { computeReportProgress, formatMonth, monthsBehind } from '@/lib/clients/report-progress'

const STORAGE_KEY = 'ngitungid-sidebar-collapsed'
const CAPSULE_TRANSITION = 'transform .48s cubic-bezier(.34,1.42,.5,1), height .48s cubic-bezier(.34,1.42,.5,1)'

// Routes that don't map 1:1 to a menuItems id (extraction-review is step 2 of
// the upload flow; admin-overview has no corresponding nav item).
const ROUTE_ACTIVE_MAP: Record<string, string> = {
  '/extraction-review': 'upload',
  '/admin-overview': '',
}

export function Sidebar() {
  const pathname = usePathname()
  const activeItem = ROUTE_ACTIVE_MAP[pathname] ?? pathname.replace(/^\//, '')
  const { activeClient, setActiveClient, isInternal, canDoAccounting, clients, role } = useClient()
  // Sesi login (SessionProvider sudah dipasang di AppShell) — untuk menampilkan
  // siapa yang sedang login & tombol keluar. Beda dari kartu workspace di atas:
  // itu KLIEN yang sedang dikelola, ini AKUN yang sedang dipakai.
  const { data: session, status } = useSession()
  const [isSigningOut, setIsSigningOut] = useState(false)
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [hoveredItem, setHoveredItem] = useState<string | null>(null)
  const [isWorkspaceDropdownOpen, setIsWorkspaceDropdownOpen] = useState(false)
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
  const workspaceRef = useRef<HTMLDivElement>(null)

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

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (workspaceRef.current && !workspaceRef.current.contains(e.target as Node)) {
        setIsWorkspaceDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

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
  // Pembagian kerjanya juga sama: SQL mempersempit ke kandidat dalam jendela
  // (GET /api/contracts/expiring), `countExpiringSoon()` di lib/contracts.ts
  // yang memutuskan — jadi angka di sini dan badge di baris /kontrak berasal
  // dari SATU definisi. `hariIni` ikut dikirim karena server berjalan UTC
  // sementara penggunanya WIB.
  //
  // Role 'user' IKUT melihat badge ini: itu kontraknya sendiri yang akan
  // berakhir. Akunting tidak — ia tidak punya item menu Kontrak sama sekali.
  useEffect(() => {
    if (!activeClient || !canViewContracts(role)) return
    let alive = true
    fetch(`/api/contracts/expiring?clientId=${activeClient.id}&hariIni=${hariIni}`)
      .then(r => (r.ok ? r.json() : { contracts: [] }))
      .then((d: { contracts?: { tanggalMulai: string; tanggalAkhir: string }[] }) => {
        if (alive) setExpiringRaw(countExpiringSoon(d.contracts ?? [], hariIni))
      })
      .catch(() => { if (alive) setExpiringRaw(0) })
    return () => { alive = false }
  }, [activeClient, pathname, role, hariIni])

  // Gerbang dipasang saat RENDER, bukan dengan menulis 0 ke state di dalam efek.
  const expiringSoon = activeClient && canViewContracts(role) ? expiringRaw : 0

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

  useLayoutEffect(() => {
    positionCapsule(!hasPositionedCapsule.current)
    hasPositionedCapsule.current = true
  }, [activeItem, isCollapsed, positionCapsule])

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

  // staffOnly: surface KERJA staf, disembunyikan dari role 'user' (klien) —
  // pelengkap guard proxy (lib/route-access.ts), bukan pengganti: route
  // protection tetap yang menegakkan akses. User (read-only) melihat Dashboard,
  // Analytics, Laporan (monitoring) & Settings (General + Master COA read-only);
  // Upload/COA Mapping/Operational tetap staffOnly.
  const menuItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'analytics', label: 'Analytics', icon: BarChart2 },
    { id: 'upload', label: 'Upload', icon: Upload, staffOnly: true },
    { id: 'laporan', label: 'Laporan', icon: Files },
    { id: 'coa-mapping', label: 'COA Mapping', icon: ArrowRightLeft, badge: pendingMapping > 0 ? String(pendingMapping) : undefined, staffOnly: true },
    // Kontrak: owner + finance + klien, TANPA akunting — satu-satunya item yang
    // TIDAK mengikuti sumbu staffOnly (yang berarti "staf boleh, klien tidak").
    // Karena itu ia memakai predikatnya sendiri, dan predikat yang SAMA dengan
    // yang dipakai proxy (lib/route-access.ts) — menyembunyikan menu bukan
    // kontrol akses, ini cuma supaya menu tidak menawarkan halaman yang akan
    // memantulkan penggunanya.
    { id: 'kontrak', label: 'Kontrak', icon: FileSignature, badge: expiringSoon > 0 ? String(expiringSoon) : undefined, contractOnly: true },
    { id: 'operational', label: 'Operational', icon: Package, comingSoon: true, staffOnly: true },
    { id: 'settings', label: 'Settings', icon: Settings },
    // Saat sesi masih 'loading', role belum ke-resolve (client-context default
    // 'user') → canDoAccounting sementara false. JANGAN sembunyikan menu staf di window
    // itu, kalau tidak item seperti Upload "hilang" sekejap tiap halaman dibuka
    // lalu muncul lagi. Setelah sesi resolved, filter normal berlaku.
  ].filter((item) => {
    if (item.contractOnly) return status === 'loading' || canViewContracts(role)
    return status === 'loading' || canDoAccounting || !item.staffOnly
  })

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

  const handleSelectClient = (client: ClientInfo | null) => {
    setActiveClient(client)
    setIsWorkspaceDropdownOpen(false)
  }

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
        <div className="px-4 py-5" ref={workspaceRef}>
          <div className="relative">
            <button
              type="button"
              onClick={() => canSwitch && setIsWorkspaceDropdownOpen(!isWorkspaceDropdownOpen)}
              aria-haspopup={canSwitch ? 'listbox' : undefined}
              aria-expanded={canSwitch ? isWorkspaceDropdownOpen : undefined}
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

            {/* Client switcher dropdown */}
            {isWorkspaceDropdownOpen && canSwitch && (
              <div
                className="absolute rounded-2xl overflow-hidden z-50"
                style={{
                  background: 'var(--color-bg-sidebar)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  boxShadow: '0 12px 32px rgba(0,0,0,0.5)',
                  bottom: isCollapsed ? '0' : 'calc(100% + 8px)',
                  left: isCollapsed ? 'calc(100% + 8px)' : '0',
                  right: isCollapsed ? 'auto' : '0',
                  width: isCollapsed ? '220px' : 'auto',
                }}
              >
                {/* Admin Overview option */}
                <button
                  type="button"
                  onClick={() => handleSelectClient(null)}
                  data-selected={!activeClient}
                  className="ng-switch-row w-full flex items-center gap-2.5 px-3 py-2.5 text-left"
                  style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}
                >
                  <div
                    className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                    style={{ background: 'rgba(255,255,255,0.08)' }}
                  >
                    <LayoutGrid className="w-3.5 h-3.5" style={{ color: 'rgba(255,255,255,0.7)' }} />
                  </div>
                  <div className="flex-1">
                    <p className="text-xs font-medium" style={{ color: 'white' }}>Admin Overview</p>
                    <p className="text-[10px]" style={{ color: 'rgba(255,255,255,0.5)' }}>Lihat semua klien</p>
                  </div>
                  {!activeClient && <Check className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'var(--color-accent-primary)' }} />}
                </button>

                {/* Client list */}
                <div className="py-1">
                  {clients.map(client => (
                    <button
                      key={client.id}
                      type="button"
                      onClick={() => handleSelectClient(client)}
                      data-selected={activeClient?.id === client.id}
                      className="ng-switch-row w-full flex items-center gap-2.5 px-3 py-2.5 text-left"
                    >
                      {client.hasLogo ? (
                        <ClientAvatar client={client} size={28} rounded={8} />
                      ) : (
                        <div
                          className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 text-xs font-bold"
                          style={{
                            background: activeClient?.id === client.id ? 'var(--color-accent-primary)' : 'rgba(255,255,255,0.08)',
                            color: activeClient?.id === client.id ? 'var(--color-bg-sidebar)' : 'white',
                          }}
                        >
                          {client.name.charAt(0)}
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium truncate" style={{ color: 'white' }}>{client.name}</p>
                        <p className="text-[10px]" style={{ color: 'rgba(255,255,255,0.5)' }}>{client.type}</p>
                      </div>
                      {activeClient?.id === client.id && (
                        <Check className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'var(--color-accent-primary)' }} />
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}
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
    </>
  )
}