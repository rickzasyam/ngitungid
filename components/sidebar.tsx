'use client'

import { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react'
import {
  LayoutDashboard,
  BarChart2,
  Upload,
  Files,
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
} from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useClient, ClientInfo } from '@/lib/client-context'

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
  const { activeClient, setActiveClient, role, storageMap, clients } = useClient()
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [hoveredItem, setHoveredItem] = useState<string | null>(null)
  const [isWorkspaceDropdownOpen, setIsWorkspaceDropdownOpen] = useState(false)
  const [isMobileOpen, setIsMobileOpen] = useState(false)
  // Jumlah laporan klien aktif yang belum selesai dipetakan (status bukan
  // mapped/confirmed) → badge di item "COA Mapping". Menggantikan badge "1"
  // yang dulu hardcoded di item Upload. Re-fetch saat klien/route berubah
  // supaya badge menyusut setelah admin menyelesaikan mapping.
  const [pendingMapping, setPendingMapping] = useState(0)
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
    if (!activeClient) { setPendingMapping(0); return }
    let alive = true
    fetch(`/api/reports/list?clientId=${activeClient.id}`)
      .then(r => (r.ok ? r.json() : { reports: [] }))
      .then((d: { reports?: { status: string }[] }) => {
        if (alive) setPendingMapping((d.reports ?? []).filter(r => r.status !== 'mapped' && r.status !== 'confirmed').length)
      })
      .catch(() => { if (alive) setPendingMapping(0) })
    return () => { alive = false }
  }, [activeClient, pathname])

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

  const menuItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'analytics', label: 'Analytics', icon: BarChart2 },
    { id: 'upload', label: 'Upload', icon: Upload },
    { id: 'laporan', label: 'Laporan', icon: Files },
    { id: 'coa-mapping', label: 'COA Mapping', icon: ArrowRightLeft, badge: pendingMapping > 0 ? String(pendingMapping) : undefined },
    { id: 'operational', label: 'Operational', icon: Package, comingSoon: true },
    { id: 'settings', label: 'Settings', icon: Settings },
  ]

  const storageUsed = activeClient ? (storageMap[activeClient.id] ?? 50) : 0
  const canSwitch = role === 'admin'

  const handleSelectClient = (client: ClientInfo | null) => {
    setActiveClient(client)
    setIsWorkspaceDropdownOpen(false)
  }

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
                <div className="text-xs leading-tight" style={{ color: 'rgba(255,255,255,0.4)' }}>Financial Analytics</div>
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
                          style={{ color: 'rgba(255,255,255,0.25)', border: '1px solid rgba(255,255,255,0.15)' }}
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
                      <div
                        className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold"
                        style={{ background: 'var(--color-accent-primary)', color: 'var(--color-bg-sidebar)' }}
                      >
                        {activeClient.name.charAt(0)}
                      </div>
                      <span
                        className="absolute rounded-full"
                        style={{ width: '8px', height: '8px', bottom: '-2px', right: '-2px', background: storageUsed > 80 ? '#f59e0b' : 'var(--color-accent-primary)', border: '2px solid var(--color-bg-sidebar)' }}
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
                        <p className="text-[11px] whitespace-nowrap overflow-hidden" style={{ color: 'rgba(255,255,255,0.35)' }}>
                          {role === 'admin' ? 'Mengelola klien' : 'Workspace Bisnis'}
                        </p>
                        {canSwitch && <ChevronDown className="w-3 h-3 flex-shrink-0" style={{ color: 'rgba(255,255,255,0.3)' }} />}
                      </div>
                      <p className="text-sm font-semibold mb-2.5 whitespace-nowrap overflow-hidden" style={{ color: 'white' }}>
                        {activeClient.name}
                      </p>
                      <div className="w-full h-1 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.1)' }}>
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{ width: `${storageUsed}%`, background: storageUsed > 80 ? '#f59e0b' : 'var(--color-accent-primary)' }}
                        />
                      </div>
                      <p className="text-[10px] mt-1 whitespace-nowrap" style={{ color: 'rgba(255,255,255,0.25)' }}>
                        {storageUsed}% storage used
                      </p>
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
                        <p className="text-[10px]" style={{ color: 'rgba(255,255,255,0.35)' }}>untuk mulai mengelola</p>
                      </div>
                      <ChevronDown className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'rgba(255,255,255,0.3)' }} />
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
                    <p className="text-[10px]" style={{ color: 'rgba(255,255,255,0.35)' }}>Lihat semua klien</p>
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
                      <div
                        className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 text-xs font-bold"
                        style={{
                          background: activeClient?.id === client.id ? 'var(--color-accent-primary)' : 'rgba(255,255,255,0.08)',
                          color: activeClient?.id === client.id ? 'var(--color-bg-sidebar)' : 'white',
                        }}
                      >
                        {client.name.charAt(0)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium truncate" style={{ color: 'white' }}>{client.name}</p>
                        <p className="text-[10px]" style={{ color: 'rgba(255,255,255,0.35)' }}>{client.type}</p>
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

      </aside>
    </>
  )
}