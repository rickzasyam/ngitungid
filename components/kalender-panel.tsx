'use client'

import { useState, useRef, useEffect, useLayoutEffect, useCallback, type KeyboardEvent as ReactKeyboardEvent, type ReactNode, type RefObject, type SyntheticEvent } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { ModalPortal } from '@/components/ui/modal-portal'
import { bulanDalamBatas, dalamBatas, jepitTanggal, type BatasKalender } from '@/lib/kalender-batas'
import { hariAktif, tujuanTombol } from '@/lib/kalender-keyboard'
import { hariIniJakarta, localDateToYmd, ymdToLocalDate } from '@/lib/ymd'

// Panel kalender BERSAMA DateRangePicker dan DatePicker (keputusan Ricko
// 2026-10-30: date picker satu tanggal memakai panel yang SAMA). Isinya
// dipindah apa adanya dari date-range-picker.tsx — sel tanggal, penempatan
// panel, fokus masuk/keluar, Escape & klik di luar, navigasi panah (PR #5) —
// supaya tampilan dan keyboard kedua picker tidak bisa berselisih.
//
// Yang ditambahkan, dan tidak dipakai DateRangePicker (perilakunya tetap):
//  - `tunggal`: satu tanggal — tanpa pita rentang, hover tetap menyala di sel
//    yang belum terpilih;
//  - `batas` (min/max): sel di luar batas mati, panah berhenti di batas,
//    tombol bulan mati di bulan yang seluruhnya di luar batas;
//  - `jumlahBulan`: 1 atau 2;
//  - `isolasiEvent`: keydown/mousedown/click di dalam panel tidak merambat
//    lewat pohon React ke pemanggil (portal tetap anak React-nya) — supaya
//    panah di kalender tidak ikut menggerakkan sel grid di belakangnya.

export interface RentangKalender {
  from: Date | undefined
  to: Date | undefined
}

const DAYS_SHORT = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
]

// Tanggal kalender WIB sebagai Date tengah malam lokal (lib/ymd.ts).
export const TODAY = ymdToLocalDate(hariIniJakarta())

export const isSameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate()

const getDaysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate()

const getFirstDayOfWeek = (year: number, month: number) => {
  const day = new Date(year, month, 1).getDay()
  return day === 0 ? 6 : day - 1
}

export const formatDate = (date: Date) =>
  date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })

/** Nama tanggal lengkap untuk pembaca layar — sel kalender hanya berisi angka. */
const formatDayLabel = (date: Date) =>
  date.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

function CalendarMonth({
  year,
  month,
  range,
  hoverDate,
  aktif,
  tunggal,
  batas,
  onDayClick,
  onDayHover,
  onDayFocus,
  onDayKeyDown,
}: {
  year: number
  month: number
  range: RentangKalender | undefined
  hoverDate: Date | null
  /** Tanggal (1…31) satu-satunya sel Tab di bulan ini — roving tabindex (lib/kalender-keyboard). */
  aktif: number
  tunggal: boolean
  batas: BatasKalender | undefined
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
              {/* Band overlay — mode tunggal tidak punya rentang. */}
              {shouldRenderBand && !tunggal && (
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
                const isToday = isSameDay(date, TODAY)
                const isSelected = isStart || isEnd
                // Di luar min/max: tombol MATI (tidak bisa diklik maupun difokus).
                const mati = !dalamBatas(localDateToYmd(date), batas)
                // Rentang: hover = ujung pratinjau selama tanggal akhir belum ada.
                // Tunggal: hover menyala di sel mana pun yang belum terpilih.
                const isHoverEnd = !mati && hoverDate && (tunggal ? !isSelected : !range?.to) ? isSameDay(date, hoverDate) : false

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
                    disabled={mati}
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
                      className={`flex items-center justify-center transition-all duration-150 ${mati ? 'cursor-not-allowed' : 'cursor-pointer'} group-focus-visible:ring-2 group-focus-visible:ring-(--color-accent-primary)`}
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
                          : mati
                            ? 'rgba(255,255,255,0.2)'
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

export interface KalenderPanelProps {
  /** Acuan posisi panel (rata kanan, di bawah — atau di atas bila tidak muat). */
  jangkarRef: RefObject<HTMLElement | null>
  /** Klik di dalam elemen ini tidak dihitung "di luar" (bawaan: jangkar). */
  wadahRef?: RefObject<HTMLElement | null>
  /** Nama dialog untuk pembaca layar. */
  label: string
  viewYear: number
  viewMonth: number
  onViewChange: (tahun: number, bulan: number) => void
  range: RentangKalender | undefined
  tunggal?: boolean
  jumlahBulan?: 1 | 2
  batas?: BatasKalender
  onDayClick: (date: Date) => void
  /**
   * Escape → `kembalikanFokus` true bila fokus sedang di dalam panel; klik di
   * luar → false. Pemanggil yang menutup panel dan memindahkan fokusnya.
   */
  onTutup: (kembalikanFokus: boolean) => void
  isolasiEvent?: boolean
  /** Footer (DateRangePicker: Batal/Terapkan). */
  children?: ReactNode
}

/** Dirender HANYA selama terbuka: keadaan hover/fokus segar tiap kali dibuka. */
export function KalenderPanel({
  jangkarRef,
  wadahRef,
  label,
  viewYear,
  viewMonth,
  onViewChange,
  range,
  tunggal = false,
  jumlahBulan = 2,
  batas,
  onDayClick,
  onTutup,
  isolasiEvent = false,
  children,
}: KalenderPanelProps) {
  const [hoverDate, setHoverDate] = useState<Date | null>(null)
  // Tanggal yang terakhir difokus di kalender — penentu sel Tab (roving
  // tabindex) dan titik awal navigasi panah. Segar tiap panel dibuka.
  const [fokusTanggal, setFokusTanggal] = useState<Date | null>(null)
  // Tujuan panah yang jatuh di bulan yang belum tampil: tampilan digeser dulu,
  // lalu efek di bawah memfokuskannya setelah sel itu ter-render.
  const fokusTertunda = useRef<string | null>(null)
  // Pendengar dokumen dipasang sekali; panggilan tutup terbaru dibaca dari ref.
  const tutup = useRef(onTutup)
  useEffect(() => {
    tutup.current = onTutup
  })
  // Node panel disimpan di ref (satu-satunya tempat yang boleh dimutasi — kita
  // menulis .style langsung ke sana), sementara `panelReady` hanyalah PEMICU
  // supaya efek penempatan jalan ULANG begitu node-nya menempel.
  //
  // Pemisahan ini perlu karena ModalPortal sengaja mengembalikan null di render
  // pertamanya (gerbang `mounted` demi SSR): pada render saat panel baru dibuka,
  // panel BELUM ada. Efek yang cuma bergantung pada pembukaan akan jalan sekali,
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

  // Panel di-portal ke <body> (lihat komentar di blok render), jadi ia BUKAN
  // keturunan jangkar — klik di dalam kalender harus dikecualikan secara
  // eksplisit, kalau tidak panel menutup sendiri begitu tanggal diklik.
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const t = e.target as Node
      if (jangkarRef.current?.contains(t) || wadahRef?.current?.contains(t)) return
      if (panelRef.current?.contains(t)) return
      tutup.current(false)
    }
    const handleKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      // Fokus dikembalikan HANYA bila ia sedang di dalam panel — Escape di
      // tempat lain di halaman tidak boleh menarik fokus ke pemicu ini.
      tutup.current(panelRef.current?.contains(document.activeElement) === true)
    }
    // Fase CAPTURE: berjalan sebelum handler React. `isolasiEvent` menghentikan
    // perambatan di akar panel, dan stopPropagation React ikut menghentikan
    // event aslinya — di fase bubble, Escape dari dalam panel tidak pernah
    // sampai ke sini (terbukti di uji klik DatePicker 2026-10-30).
    document.addEventListener('mousedown', handleClickOutside, true)
    document.addEventListener('keydown', handleKey, true)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside, true)
      document.removeEventListener('keydown', handleKey, true)
    }
  }, [jangkarRef, wadahRef])

  // Penempatan panel dilakukan imperatif (tulis .style langsung) dan bukan lewat
  // state: posisi hanya boleh dihitung SETELAH panel punya ukuran nyata, dan
  // useLayoutEffect berjalan sebelum paint sehingga tidak ada kedipan. Lewat
  // state, tiap event scroll akan memicu render ulang seluruh kalender.
  useLayoutEffect(() => {
    if (!panelReady) return
    const GAP = 8

    const place = () => {
      const anchor = jangkarRef.current
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
  }, [panelReady, jangkarRef])

  // Fokus MASUK ke kalender saat dibuka. Panelnya di-portal ke ujung <body>,
  // jadi tanpa ini Tab dari tombol pemicu berjalan ke sisa halaman dulu dan
  // sel tanggal baru tercapai paling akhir — praktis tidak terjangkau
  // keyboard. Sasarannya tanggal yang terpilih, atau sel Tab bulan yang
  // tampil. Passive effect: berjalan SETELAH useLayoutEffect di atas membuka
  // `visibility`, karena elemen tersembunyi tidak bisa difokus.
  useEffect(() => {
    if (!panelReady) return
    const panel = panelRef.current
    const sasaran =
      panel?.querySelector<HTMLButtonElement>('button[data-hari][aria-pressed="true"]:not(:disabled)') ??
      panel?.querySelector<HTMLButtonElement>('button[data-hari][tabindex="0"]')
    sasaran?.focus({ preventScroll: true })
  }, [panelReady])

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
    const arah = tujuanTombol(date, e.key, e.shiftKey)
    if (!arah) return
    e.preventDefault()
    // Di luar min/max: berhenti di batasnya (tanpa batas: tanggal yang sama).
    const tujuan = jepitTanggal(arah, batas)
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
    onViewChange(tujuan.getFullYear(), tujuan.getMonth())
  }

  const secondMonth = viewMonth === 11 ? 0 : viewMonth + 1
  const secondYear = viewMonth === 11 ? viewYear + 1 : viewYear
  const kandidatAktif = [fokusTanggal, range?.from, TODAY]
  // Tombol bulan mati bila bulan yang akan tampil seluruhnya di luar min/max
  // (tanpa batas: selalu hidup). aria-disabled, bukan disabled: tombol yang
  // sedang difokus tidak boleh membuang fokusnya ke <body>.
  const prev = viewMonth === 0 ? { y: viewYear - 1, m: 11 } : { y: viewYear, m: viewMonth - 1 }
  const lastShown = jumlahBulan === 2 ? { y: secondYear, m: secondMonth } : { y: viewYear, m: viewMonth }
  const afterLast = lastShown.m === 11 ? { y: lastShown.y + 1, m: 0 } : { y: lastShown.y, m: lastShown.m + 1 }
  const bisaMundur = bulanDalamBatas(prev.y, prev.m, batas)
  const bisaMaju = bulanDalamBatas(afterLast.y, afterLast.m, batas)

  const handlePrev = () => {
    if (bisaMundur) onViewChange(prev.y, prev.m)
  }

  const handleNext = () => {
    if (!bisaMaju) return
    if (viewMonth === 11) onViewChange(viewYear + 1, 0)
    else onViewChange(viewYear, viewMonth + 1)
  }

  const henti = (e: SyntheticEvent) => e.stopPropagation()
  const isolasi = isolasiEvent ? { onKeyDown: henti, onMouseDown: henti, onClick: henti } : {}

  const bulan = (year: number, month: number) => (
    <CalendarMonth
      year={year}
      month={month}
      range={range}
      hoverDate={hoverDate}
      aktif={hariAktif(year, month, kandidatAktif, batas)}
      tunggal={tunggal}
      batas={batas}
      onDayClick={onDayClick}
      onDayHover={setHoverDate}
      onDayFocus={setFokusTanggal}
      onDayKeyDown={handleDayKeyDown}
    />
  )

  return (
    // Dropdown — di-portal ke <body>.
    // Versi lama memakai `absolute … z-50` di dalam card. Itu tidak pernah
    // bisa menang: tiap SectionCard ber-`.ng-rise`/`.animate-slide-up`
    // menyisakan transform (fill-mode: both) sehingga jadi stacking context
    // sendiri, dan card BERIKUTNYA di DOM otomatis melukis di atas seluruh
    // isi card sebelumnya — z-index setinggi apa pun di dalam tidak terbaca
    // dari luar. Gejalanya: panel tanggal "Detail Laporan" tertimpa card
    // "Detail Laba Rugi". Sama persis dengan bug dialog COA (lihat
    // modal-portal.tsx). Portal + position:fixed melepaskan panel dari
    // leluhur mana pun; z-[70] di atas ModalShell (z-50) dan PdfPreview
    // (z-60) supaya tetap benar saat picker dipakai DI DALAM modal.
    <ModalPortal>
      <div
        ref={setPanel}
        role="dialog"
        aria-label={label}
        // Bisa difokus lewat kode saja: klik di bagian panel yang tidak bisa
        // difokus (judul bulan, sel tanggal yang mati) memindahkan fokus ke
        // panel, bukan ke <body> — Escape sesudahnya tetap mengembalikan fokus
        // ke pemicu / sel grid (uji klik DatePicker 2026-10-30).
        tabIndex={-1}
        className="fixed z-[70] rounded-3xl overflow-y-auto overflow-x-hidden outline-none"
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
        {...isolasi}
      >
        {/* Nav + Calendars */}
        <div className="px-5 pt-5 pb-3">
          {/* Navigation row */}
          <div className="flex items-center justify-between mb-4">
            <button
              type="button"
              onClick={handlePrev}
              aria-label="Bulan sebelumnya"
              aria-disabled={!bisaMundur || undefined}
              className="drp-nav w-7 h-7 rounded-full flex items-center justify-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-accent-primary)"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={handleNext}
              aria-label="Bulan berikutnya"
              aria-disabled={!bisaMaju || undefined}
              className="drp-nav w-7 h-7 rounded-full flex items-center justify-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-accent-primary)"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Two months side by side — second month hidden on mobile */}
          <div className="flex gap-6 overflow-x-auto">
            {bulan(viewYear, viewMonth)}
            {jumlahBulan === 2 && (
              <>
                <div className="hidden sm:block" style={{ width: '1px', background: 'rgba(255,255,255,0.06)', flexShrink: 0 }} />
                <div className="hidden sm:block">{bulan(secondYear, secondMonth)}</div>
              </>
            )}
          </div>
        </div>

        {children}
      </div>
    </ModalPortal>
  )
}
