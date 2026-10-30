'use client'

import { useState, useRef, useEffect, useLayoutEffect, useCallback, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { Calendar, X, ChevronLeft, ChevronRight } from 'lucide-react'
import { ModalPortal } from '@/components/ui/modal-portal'
import { hariAktif, tujuanTombol } from '@/lib/kalender-keyboard'
import { hariIniJakarta, localDateToYmd, ymdToLocalDate } from '@/lib/ymd'

interface DateRange {
  from: Date | undefined
  to: Date | undefined
}

interface DateRangePickerProps {
  value: DateRange | undefined
  onChange: (range: DateRange | undefined) => void
  placeholder?: string
}

const DAYS_SHORT = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
]

// Tanggal kalender WIB sebagai Date tengah malam lokal (lib/ymd.ts).
const TODAY = ymdToLocalDate(hariIniJakarta())

const isSameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate()

const getDaysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate()

const getFirstDayOfWeek = (year: number, month: number) => {
  const day = new Date(year, month, 1).getDay()
  return day === 0 ? 6 : day - 1
}

const formatDate = (date: Date) =>
  date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })

/** Nama tanggal lengkap untuk pembaca layar — sel kalender hanya berisi angka. */
const formatDayLabel = (date: Date) =>
  date.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

const formatRangeLabel = (range: DateRange | undefined) => {
  if (!range?.from) return null
  if (!range.to) return formatDate(range.from)
  return `${formatDate(range.from)} – ${formatDate(range.to)}`
}

function CalendarMonth({
  year,
  month,
  range,
  hoverDate,
  aktif,
  onDayClick,
  onDayHover,
  onDayFocus,
  onDayKeyDown,
}: {
  year: number
  month: number
  range: DateRange | undefined
  hoverDate: Date | null
  /** Tanggal (1…31) satu-satunya sel Tab di bulan ini — roving tabindex (lib/kalender-keyboard). */
  aktif: number
  onDayClick: (date: Date) => void
  onDayHover: (date: Date | null) => void
  onDayFocus: (date: Date) => void
  onDayKeyDown: (date: Date, e: ReactKeyboardEvent<HTMLButtonElement>) => void
}) {
  const daysInMonth = getDaysInMonth(year, month)
  const firstDayOffset = getFirstDayOfWeek(year, month)

  const cells: (Date | null)[] = []
  for (let i = 0; i < firstDayOffset; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d))
  while (cells.length % 7 !== 0) cells.push(null)

  const rows: (Date | null)[][] = []
  for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7))

  const effectiveTo = range?.to ?? hoverDate

  return (
    <div style={{ width: '224px' }}>
      {/* Month title */}
      <div className="text-center mb-3">
        <span className="text-sm font-semibold" style={{ color: 'white' }}>
          {MONTH_NAMES[month]} {year}
        </span>
      </div>

      {/* Day headers */}
      <div className="grid grid-cols-7 mb-1">
        {DAYS_SHORT.map(d => (
          <div key={d} className="flex items-center justify-center h-7">
            <span className="text-[10px] font-medium" style={{ color: 'rgba(255,255,255,0.3)' }}>
              {d}
            </span>
          </div>
        ))}
      </div>

      {/* Rows */}
      <div className="space-y-0.5">
        {rows.map((row, rowIdx) => {
          // Find in-range cells (strictly between from and to)
          let bandStart = -1
          let bandEnd = -1

          // Find start/end column indices in this row
          const startCol = range?.from
            ? row.findIndex(cell => cell && isSameDay(cell, range.from!))
            : -1
          const endCol = range?.to && effectiveTo
            ? row.findIndex(cell => cell && isSameDay(cell, range.to!))
            : -1
          // Also check hover end if range.to is not set
          const hoverEndCol = !range?.to && hoverDate
            ? row.findIndex(cell => cell && isSameDay(cell, hoverDate))
            : -1

          const hasStartInRow = startCol !== -1
          const actualEndCol = endCol !== -1 ? endCol : hoverEndCol

          const hasBothInSameRow = hasStartInRow && actualEndCol !== -1

          if (range?.from && effectiveTo) {
            const fromTime = range.from.getTime()
            const toTime = effectiveTo.getTime()
            const lo = Math.min(fromTime, toTime)
            const hi = Math.max(fromTime, toTime)

            row.forEach((cell, ci) => {
              if (!cell) return
              const t = cell.getTime()
              if (t > lo && t < hi) {
                if (bandStart === -1) bandStart = ci
                bandEnd = ci
              }
            })
          }

          // A row is fully in-range if it has band cells but no start/end in it
          const isFullyInRange = bandStart !== -1 && !hasStartInRow && actualEndCol === -1

          // Determine if band should render: either has mid-range cells,
          // or contains start/end where the other end exists somewhere (different day)
          const sameDaySelection = range?.from && range?.to && isSameDay(range.from, range.to)
          const shouldRenderBand = bandStart !== -1 || (hasStartInRow && actualEndCol !== -1 && !sameDaySelection)

          // Compute band style values
          const bandLeft = hasBothInSameRow
            ? `calc(${Math.min(startCol, actualEndCol)} * (100% / 7) + (100% / 14))`
            : hasStartInRow
              ? `calc(${startCol} * (100% / 7) + (100% / 14))`
              : actualEndCol !== -1
                ? '0'
                : isFullyInRange
                  ? '0'
                  : `calc(${bandStart} * (100% / 7) + (100% / 14))`

          const bandRight = hasBothInSameRow
            ? `calc((6 - ${Math.max(startCol, actualEndCol)}) * (100% / 7) + (100% / 14))`
            : hasStartInRow
              ? '0'
              : actualEndCol !== -1
                ? `calc((6 - ${actualEndCol}) * (100% / 7) + (100% / 14))`
                : isFullyInRange
                  ? '0'
                  : `calc((6 - ${bandEnd}) * (100% / 7) + (100% / 14))`

          const bandBackground = hasBothInSameRow
            ? 'linear-gradient(to right, rgba(187,179,243,0.35) 0%, rgba(255,255,255,0.08) 20%, rgba(255,255,255,0.08) 80%, rgba(187,179,243,0.35) 100%)'
            : hasStartInRow
              ? 'linear-gradient(to right, rgba(187,179,243,0.35) 0%, rgba(255,255,255,0.08) 40%, rgba(255,255,255,0.08) 100%)'
              : actualEndCol !== -1
                ? 'linear-gradient(to left, rgba(187,179,243,0.35) 0%, rgba(255,255,255,0.08) 40%, rgba(255,255,255,0.08) 100%)'
                : 'rgba(255,255,255,0.08)'

          return (
            <div key={rowIdx} className="relative grid grid-cols-7">
              {/* Band overlay */}
              {shouldRenderBand && (
                <div
                  className="absolute"
                  style={{
                    left: bandLeft,
                    right: bandRight,
                    top: '4px',
                    bottom: '4px',
                    background: bandBackground,
                    borderRadius: '0',
                    zIndex: 0,
                    pointerEvents: 'none',
                  }}
                />
              )}

              {row.map((date, colIdx) => {
                if (!date) return <div key={colIdx} className="h-8" />

                const isStart = range?.from ? isSameDay(date, range.from) : false
                const isEnd = range?.to ? isSameDay(date, range.to) : false
                const isHoverEnd = !range?.to && hoverDate ? isSameDay(date, hoverDate) : false
                const isToday = isSameDay(date, TODAY)
                const isSelected = isStart || isEnd

                // Sel tanggal = TOMBOL ASLI (gotcha #3), bukan div ber-onClick:
                // peran, fokus Tab, dan Enter/Spasi datang dari browser, bukan
                // ditiru dengan role/tabIndex/onKeyDown yang bisa terlupa
                // separuhnya. Fokus menyalakan pratinjau rentang yang SAMA
                // dengan hover (gotcha #4) — tanpa itu pengguna keyboard memilih
                // tanggal akhir tanpa pernah melihat rentangnya.
                //
                // Roving tabindex: hanya SATU sel per bulan di urutan Tab; antar
                // tanggal berpindah dengan panah/Home/End/PageUp/PageDown
                // (pola date grid WAI-ARIA). Tanpa ini Tab harus melewati ±60
                // tombol untuk keluar dari kalender.
                return (
                  <button
                    type="button"
                    key={colIdx}
                    data-hari=""
                    data-tanggal={localDateToYmd(date)}
                    tabIndex={date.getDate() === aktif ? 0 : -1}
                    aria-label={formatDayLabel(date)}
                    aria-pressed={isSelected}
                    aria-current={isToday ? 'date' : undefined}
                    className="group relative flex items-center justify-center h-8 w-full focus-visible:outline-none"
                    style={{ zIndex: 1 }}
                    onClick={() => onDayClick(date)}
                    onMouseEnter={() => onDayHover(date)}
                    onMouseLeave={() => onDayHover(null)}
                    onFocus={() => {
                      onDayHover(date)
                      onDayFocus(date)
                    }}
                    onBlur={() => onDayHover(null)}
                    onKeyDown={e => onDayKeyDown(date, e)}
                  >
                    <div
                      className="flex items-center justify-center transition-all duration-150 cursor-pointer group-focus-visible:ring-2 group-focus-visible:ring-(--color-accent-primary)"
                      style={{
                        width: '30px',
                        height: '30px',
                        borderRadius: '50%',
                        background: isSelected
                          ? '#bbb3f3'
                          : isHoverEnd
                            ? 'rgba(187,179,243,0.3)'
                            : 'transparent',
                        color: isSelected
                          ? '#222124'
                          : isToday
                            ? '#bbb3f3'
                            : 'rgba(255,255,255,0.8)',
                        fontWeight: isSelected ? 700 : isToday ? 600 : 400,
                        fontSize: '13px',
                        boxShadow: isSelected ? '0 2px 8px rgba(187,179,243,0.5)' : 'none',
                      }}
                    >
                      {date.getDate()}
                    </div>
                  </button>
                )
              })}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export function DateRangePicker({ value, onChange, placeholder = 'Pilih periode laporan' }: DateRangePickerProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [tempRange, setTempRange] = useState<DateRange | undefined>(value)
  const [hoverDate, setHoverDate] = useState<Date | null>(null)
  // Tanggal yang terakhir difokus di kalender — penentu sel Tab (roving
  // tabindex) dan titik awal navigasi panah. Direset tiap panel dibuka.
  const [fokusTanggal, setFokusTanggal] = useState<Date | null>(null)
  // Tujuan panah yang jatuh di bulan yang belum tampil: tampilan digeser dulu,
  // lalu efek di bawah memfokuskannya setelah sel itu ter-render.
  const fokusTertunda = useRef<string | null>(null)
  const [viewYear, setViewYear] = useState(value?.from?.getFullYear() ?? TODAY.getFullYear())
  const [viewMonth, setViewMonth] = useState(value?.from?.getMonth() ?? 0)
  const containerRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  // Node panel disimpan di ref (satu-satunya tempat yang boleh dimutasi — kita
  // menulis .style langsung ke sana), sementara `panelReady` hanyalah PEMICU
  // supaya efek penempatan jalan ULANG begitu node-nya menempel.
  //
  // Pemisahan ini perlu karena ModalPortal sengaja mengembalikan null di render
  // pertamanya (gerbang `mounted` demi SSR): pada render saat isOpen baru true,
  // panel BELUM ada. Efek yang cuma bergantung pada [isOpen] akan jalan sekali,
  // tidak menemukan node, lalu tidak pernah dipanggil lagi — panel tertinggal
  // di visibility:hidden dan dropdown-nya tidak pernah muncul.
  const panelRef = useRef<HTMLDivElement | null>(null)
  const [panelReady, setPanelReady] = useState(false)
  // useCallback: kalau identitasnya berubah tiap render, React akan melepas dan
  // memasang ref berulang kali dan memicu render tanpa henti.
  const setPanel = useCallback((node: HTMLDivElement | null) => {
    panelRef.current = node
    setPanelReady(node !== null)
  }, [])

  // Dropdown di-portal ke <body> (lihat komentar di blok render), jadi ia BUKAN
  // lagi keturunan containerRef — klik di dalam kalender harus dikecualikan
  // secara eksplisit, kalau tidak panel menutup sendiri begitu tanggal diklik.
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const t = e.target as Node
      if (containerRef.current?.contains(t)) return
      if (panelRef.current?.contains(t)) return
      setIsOpen(false)
    }
    const handleKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      // Fokus dikembalikan HANYA bila ia sedang di dalam panel — Escape di
      // tempat lain di halaman tidak boleh menarik fokus ke pemicu ini.
      if (panelRef.current?.contains(document.activeElement)) triggerRef.current?.focus()
      setIsOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleKey)
    }
  }, [])

  // Penempatan panel dilakukan imperatif (tulis .style langsung) dan bukan lewat
  // state: posisi hanya boleh dihitung SETELAH panel punya ukuran nyata, dan
  // useLayoutEffect berjalan sebelum paint sehingga tidak ada kedipan. Lewat
  // state, tiap event scroll akan memicu render ulang seluruh kalender.
  useLayoutEffect(() => {
    if (!isOpen || !panelReady) return
    const GAP = 8

    const place = () => {
      const anchor = containerRef.current
      const panel = panelRef.current
      if (!anchor || !panel) return

      const r = anchor.getBoundingClientRect()
      const h = panel.offsetHeight
      const roomBelow = window.innerHeight - r.bottom - GAP
      const roomAbove = r.top - GAP
      // Buka ke atas hanya kalau memang tidak muat di bawah DAN di atas lebih lega.
      const openUp = h > roomBelow && roomAbove > roomBelow

      panel.style.top = openUp
        ? `${Math.max(GAP, r.top - GAP - h)}px`
        : `${r.bottom + GAP}px`
      // Rata kanan dengan tombol pemicu, meniru `right-0` versi absolute dulu.
      panel.style.right = `${Math.max(GAP, window.innerWidth - r.right)}px`
      panel.style.maxHeight = `${Math.max(220, openUp ? roomAbove : roomBelow)}px`
      panel.style.visibility = 'visible'
    }

    place()
    // capture:true — panel harus ikut bergeser saat kontainer scroll internal
    // (main di Analytics/Dashboard) bergerak, bukan cuma scroll window.
    window.addEventListener('scroll', place, true)
    window.addEventListener('resize', place)
    return () => {
      window.removeEventListener('scroll', place, true)
      window.removeEventListener('resize', place)
    }
  }, [isOpen, panelReady])

  // Fokus MASUK ke kalender saat dibuka. Panelnya di-portal ke ujung <body>,
  // jadi tanpa ini Tab dari tombol pemicu berjalan ke sisa halaman dulu dan
  // sel tanggal baru tercapai paling akhir — praktis tidak terjangkau
  // keyboard. Sasarannya tanggal awal yang terpilih, atau tanggal pertama
  // bulan yang tampil. Passive effect: berjalan SETELAH useLayoutEffect di
  // atas membuka `visibility`, karena elemen tersembunyi tidak bisa difokus.
  useEffect(() => {
    if (!isOpen || !panelReady) return
    const panel = panelRef.current
    const sasaran =
      panel?.querySelector<HTMLButtonElement>('button[data-hari][aria-pressed="true"]') ??
      panel?.querySelector<HTMLButtonElement>('button[data-hari][tabindex="0"]')
    sasaran?.focus({ preventScroll: true })
  }, [isOpen, panelReady])

  /** Sel tanggal yang tampil (bulan kedua disembunyikan di layar sempit → offsetParent null). */
  const selTampil = (ymd: string) => {
    const el = panelRef.current?.querySelector<HTMLButtonElement>(`button[data-tanggal="${ymd}"]`)
    return el && el.offsetParent !== null ? el : null
  }

  // Panah ke bulan yang belum tampil: tampilan sudah digeser, fokuskan selnya.
  useEffect(() => {
    const ymd = fokusTertunda.current
    if (!ymd) return
    const el = selTampil(ymd)
    if (el) {
      fokusTertunda.current = null
      el.focus({ preventScroll: true })
    }
  }, [viewYear, viewMonth])

  const handleDayKeyDown = (date: Date, e: ReactKeyboardEvent<HTMLButtonElement>) => {
    const tujuan = tujuanTombol(date, e.key, e.shiftKey)
    if (!tujuan) return
    e.preventDefault()
    setFokusTanggal(tujuan)
    const ymd = localDateToYmd(tujuan)
    const el = selTampil(ymd)
    if (el) {
      el.focus({ preventScroll: true })
      return
    }
    // Di luar bulan yang tampil: jadikan bulan tujuan bulan PERTAMA (selalu
    // tampil, juga di layar sempit), lalu fokus menyusul lewat efek di atas.
    fokusTertunda.current = ymd
    setViewYear(tujuan.getFullYear())
    setViewMonth(tujuan.getMonth())
  }

  /** Tutup lewat tombol di dalam panel — fokus kembali ke pemicunya. */
  const tutupKePemicu = () => {
    setIsOpen(false)
    triggerRef.current?.focus()
  }

  const secondMonth = viewMonth === 11 ? 0 : viewMonth + 1
  const secondYear = viewMonth === 11 ? viewYear + 1 : viewYear
  const kandidatAktif = [fokusTanggal, tempRange?.from, TODAY]

  const handlePrev = () => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1) }
    else setViewMonth(m => m - 1)
  }

  const handleNext = () => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1) }
    else setViewMonth(m => m + 1)
  }

  const handleDayClick = (date: Date) => {
    if (!tempRange?.from || (tempRange.from && tempRange.to)) {
      setTempRange({ from: date, to: undefined })
    } else {
      if (date.getTime() < tempRange.from.getTime()) {
        setTempRange({ from: date, to: tempRange.from })
      } else if (isSameDay(date, tempRange.from)) {
        setTempRange({ from: date, to: date })
      } else {
        setTempRange({ from: tempRange.from, to: date })
      }
    }
  }

  const handleApply = () => {
    onChange(tempRange)
    tutupKePemicu()
  }

  const handleClear = () => {
    setTempRange(undefined)
    onChange(undefined)
    // Tombol hapus lenyap begitu nilainya kosong — fokus jangan ikut hilang ke <body>.
    triggerRef.current?.focus()
  }

  return (
    // Lebar minimum hidup DI SINI, bukan di tiap pemanggil. Label rentang penuh
    // ("1 Jan 2026 – 31 Jan 2026") plus ikon kalender dan tombol clear butuh
    // ~280px; di bawah itu teks turun ke baris kedua. Sebelumnya tiap halaman
    // menentukan lebarnya sendiri (Dashboard 280px, Analytics 248px) sehingga
    // hanya Analytics yang rusak. `min(280px, 100%)` menjaga floor tanpa
    // meluber kalau komponen dipakai di kolom yang memang lebih sempit.
    <div ref={containerRef} className="relative" style={{ minWidth: 'min(280px, 100%)' }}>

      {/* Trigger button */}
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        onClick={() => {
          setTempRange(value)
          setFokusTanggal(null)
          if (value?.from) {
            setViewYear(value.from.getFullYear())
            setViewMonth(value.from.getMonth())
          }
          setIsOpen(!isOpen)
        }}
        className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-left transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-accent-primary)"
        style={{
          background: 'white',
          border: isOpen ? '1.5px solid #bbb3f3' : '1.5px solid #e5e5e5',
          boxShadow: isOpen ? '0 0 0 3px rgba(187,179,243,0.12)' : 'none',
        }}
      >
        <Calendar
          className="w-4 h-4 flex-shrink-0"
          style={{ color: value?.from ? '#bbb3f3' : 'var(--color-text-muted)' }}
        />
        <span
          className="flex-1 text-sm"
          style={{
            color: value?.from ? '#2d2d2d' : 'var(--color-text-muted)',
            fontWeight: value?.from ? 500 : 400,
          }}
        >
          {formatRangeLabel(value) ?? placeholder}
        </span>
        {/* Ruang untuk tombol hapus di bawah — ukurannya sama dengan bulatan X
            lama, jadi tata letak pemicu tidak berubah. */}
        {value?.from && <span aria-hidden className="w-5 h-5 flex-shrink-0" />}
      </button>

      {/* Tombol hapus = TOMBOL ASLI, SAUDARA pemicu (bukan anaknya): tombol di
          dalam tombol tidak sah dan tidak bisa dicapai Tab. Diletakkan absolut
          tepat di atas ruang di atas — bulatan 20px tampil sama seperti dulu,
          area sentuhnya 32px (gotcha #5). Hover lewat kelas CSS (gotcha #4). */}
      {value?.from && (
        <button
          type="button"
          aria-label="Hapus rentang tanggal"
          onClick={handleClear}
          className="drp-clear group absolute top-1/2 cursor-pointer -translate-y-1/2 w-8 h-8 rounded-full flex items-center justify-center focus-visible:outline-none"
          // Tengah bulatan lama = padding kanan pemicu (1rem) + border (1.5px) + 10px;
          // tombol 32px berpusat di titik itu → kanan = 1rem + 1.5px − 6px.
          style={{ right: 'calc(1rem + 1.5px - 6px)' }}
        >
          <span className="drp-clear-dot w-5 h-5 rounded-full flex items-center justify-center transition-colors group-focus-visible:ring-2 group-focus-visible:ring-(--color-accent-primary)">
            <X className="w-2.5 h-2.5" style={{ color: 'var(--color-text-muted)' }} />
          </span>
        </button>
      )}

      {/* Dropdown — di-portal ke <body>.
          Versi lama memakai `absolute … z-50` di dalam card. Itu tidak pernah
          bisa menang: tiap SectionCard ber-`.ng-rise`/`.animate-slide-up`
          menyisakan transform (fill-mode: both) sehingga jadi stacking context
          sendiri, dan card BERIKUTNYA di DOM otomatis melukis di atas seluruh
          isi card sebelumnya — z-index setinggi apa pun di dalam tidak terbaca
          dari luar. Gejalanya: panel tanggal "Detail Laporan" tertimpa card
          "Detail Laba Rugi". Sama persis dengan bug dialog COA (lihat
          modal-portal.tsx). Portal + position:fixed melepaskan panel dari
          leluhur mana pun; z-[70] di atas ModalShell (z-50) dan PdfPreview
          (z-60) supaya tetap benar saat picker dipakai DI DALAM modal. */}
      {isOpen && (
        <ModalPortal>
        <div
          ref={setPanel}
          role="dialog"
          aria-label="Pilih rentang tanggal"
          className="fixed z-[70] rounded-3xl overflow-y-auto overflow-x-hidden"
          style={{
            // visibility dibuka oleh useLayoutEffect setelah posisi terhitung —
            // mencegah panel sempat tergambar di pojok kiri atas.
            visibility: 'hidden',
            top: 0,
            right: 0,
            background: 'rgba(34,33,36,0.92)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
            border: '1px solid rgba(255,255,255,0.07)',
            maxWidth: 'calc(100vw - 24px)',
          }}
        >
          {/* Nav + Calendars */}
          <div className="px-5 pt-5 pb-3">
            {/* Navigation row */}
            <div className="flex items-center justify-between mb-4">
              <button
                type="button"
                onClick={handlePrev}
                aria-label="Bulan sebelumnya"
                className="drp-nav w-7 h-7 rounded-full flex items-center justify-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-accent-primary)"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={handleNext}
                aria-label="Bulan berikutnya"
                className="drp-nav w-7 h-7 rounded-full flex items-center justify-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-accent-primary)"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Two months side by side — second month hidden on mobile */}
            <div className="flex gap-6 overflow-x-auto">
              <CalendarMonth
                year={viewYear}
                month={viewMonth}
                range={tempRange}
                hoverDate={hoverDate}
                aktif={hariAktif(viewYear, viewMonth, kandidatAktif)}
                onDayClick={handleDayClick}
                onDayHover={setHoverDate}
                onDayFocus={setFokusTanggal}
                onDayKeyDown={handleDayKeyDown}
              />
              <div className="hidden sm:block" style={{ width: '1px', background: 'rgba(255,255,255,0.06)', flexShrink: 0 }} />
              <div className="hidden sm:block">
                <CalendarMonth
                  year={secondYear}
                  month={secondMonth}
                  range={tempRange}
                  hoverDate={hoverDate}
                  aktif={hariAktif(secondYear, secondMonth, kandidatAktif)}
                  onDayClick={handleDayClick}
                  onDayHover={setHoverDate}
                  onDayFocus={setFokusTanggal}
                  onDayKeyDown={handleDayKeyDown}
                />
              </div>
            </div>
          </div>

          {/* Footer */}
          <div
            className="flex items-center justify-between px-5 py-3"
            style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}
          >
            <div className="text-sm">
              {tempRange?.from ? (
                <span style={{ color: 'rgba(255,255,255,0.7)' }}>
                  {tempRange.to
                    ? formatRangeLabel(tempRange)
                    : `${formatDate(tempRange.from)} – pilih tanggal akhir`
                  }
                </span>
              ) : (
                <span style={{ color: 'rgba(255,255,255,0.35)' }}>
                  Pilih tanggal mulai dan akhir
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={tutupKePemicu}
                className="drp-batal px-4 py-1.5 rounded-full text-xs font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-accent-primary)"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleApply}
                disabled={!tempRange?.from}
                className="drp-terapkan px-4 py-1.5 rounded-full text-xs font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                style={{
                  background: tempRange?.from ? '#daf163' : 'rgba(255,255,255,0.1)',
                  color: tempRange?.from ? '#222124' : 'rgba(255,255,255,0.3)',
                  cursor: tempRange?.from ? 'pointer' : 'not-allowed',
                }}
              >
                Terapkan
              </button>
            </div>
          </div>
        </div>
        </ModalPortal>
      )}
    </div>
  )
}