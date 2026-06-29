'use client'

import { useState, useRef, useEffect } from 'react'
import { Calendar, X, ChevronLeft, ChevronRight } from 'lucide-react'

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

const TODAY = new Date()

const isSameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate()

const isInRange = (date: Date, from: Date, to: Date) => {
  const d = date.getTime()
  return d > from.getTime() && d < to.getTime()
}

const getDaysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate()

const getFirstDayOfWeek = (year: number, month: number) => {
  const day = new Date(year, month, 1).getDay()
  return day === 0 ? 6 : day - 1
}

const formatDate = (date: Date) =>
  date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })

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
  onDayClick,
  onDayHover,
}: {
  year: number
  month: number
  range: DateRange | undefined
  hoverDate: Date | null
  onDayClick: (date: Date) => void
  onDayHover: (date: Date | null) => void
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

                return (
                  <div
                    key={colIdx}
                    className="relative flex items-center justify-center h-8"
                    style={{ zIndex: 1 }}
                    onClick={() => onDayClick(date)}
                    onMouseEnter={() => onDayHover(date)}
                    onMouseLeave={() => onDayHover(null)}
                  >
                    <div
                      className="flex items-center justify-center transition-all duration-150 cursor-pointer"
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
                  </div>
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
  const [viewYear, setViewYear] = useState(value?.from?.getFullYear() ?? new Date().getFullYear())
  const [viewMonth, setViewMonth] = useState(value?.from?.getMonth() ?? 0)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const secondMonth = viewMonth === 11 ? 0 : viewMonth + 1
  const secondYear = viewMonth === 11 ? viewYear + 1 : viewYear

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
    setIsOpen(false)
  }

  const handleClear = () => {
    setTempRange(undefined)
    onChange(undefined)
  }

  return (
    <div ref={containerRef} className="relative">

      {/* Trigger button */}
      <button
        onClick={() => {
          setTempRange(value)
          if (value?.from) {
            setViewYear(value.from.getFullYear())
            setViewMonth(value.from.getMonth())
          }
          setIsOpen(!isOpen)
        }}
        className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-left transition-all duration-200"
        style={{
          background: 'white',
          border: isOpen ? '1.5px solid #bbb3f3' : '1.5px solid #e5e5e5',
          boxShadow: isOpen ? '0 0 0 3px rgba(187,179,243,0.12)' : 'none',
        }}
      >
        <Calendar
          className="w-4 h-4 flex-shrink-0"
          style={{ color: value?.from ? '#bbb3f3' : '#9ca3af' }}
        />
        <span
          className="flex-1 text-sm"
          style={{
            color: value?.from ? '#2d2d2d' : '#9ca3af',
            fontWeight: value?.from ? 500 : 400,
          }}
        >
          {formatRangeLabel(value) ?? placeholder}
        </span>
        {value?.from && (
          <span
            onClick={(e) => { e.stopPropagation(); handleClear() }}
            className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 cursor-pointer transition-colors"
            style={{ background: '#f0f0f0' }}
            onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = '#e5e5e5'}
            onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = '#f0f0f0'}
          >
            <X className="w-2.5 h-2.5" style={{ color: '#6b7280' }} />
          </span>
        )}
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div
          className="absolute top-full right-0 mt-2 z-50 rounded-3xl overflow-hidden"
          style={{
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
                onClick={handlePrev}
                className="w-7 h-7 rounded-full flex items-center justify-center transition-colors"
                style={{ background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.5)' }}
                onMouseEnter={e => {
                  e.currentTarget.style.background = 'rgba(255,255,255,0.12)'
                  e.currentTarget.style.color = 'white'
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.background = 'rgba(255,255,255,0.06)'
                  e.currentTarget.style.color = 'rgba(255,255,255,0.5)'
                }}
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={handleNext}
                className="w-7 h-7 rounded-full flex items-center justify-center transition-colors"
                style={{ background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.5)' }}
                onMouseEnter={e => {
                  e.currentTarget.style.background = 'rgba(255,255,255,0.12)'
                  e.currentTarget.style.color = 'white'
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.background = 'rgba(255,255,255,0.06)'
                  e.currentTarget.style.color = 'rgba(255,255,255,0.5)'
                }}
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
                onDayClick={handleDayClick}
                onDayHover={setHoverDate}
              />
              <div className="hidden sm:block" style={{ width: '1px', background: 'rgba(255,255,255,0.06)', flexShrink: 0 }} />
              <div className="hidden sm:block">
                <CalendarMonth
                  year={secondYear}
                  month={secondMonth}
                  range={tempRange}
                  hoverDate={hoverDate}
                  onDayClick={handleDayClick}
                  onDayHover={setHoverDate}
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
                onClick={() => setIsOpen(false)}
                className="px-4 py-1.5 rounded-full text-xs font-medium transition-all"
                style={{ color: 'rgba(255,255,255,0.5)', background: 'rgba(255,255,255,0.06)' }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
                onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.06)'}
              >
                Batal
              </button>
              <button
                onClick={handleApply}
                disabled={!tempRange?.from}
                className="px-4 py-1.5 rounded-full text-xs font-semibold transition-all"
                style={{
                  background: tempRange?.from ? '#daf163' : 'rgba(255,255,255,0.1)',
                  color: tempRange?.from ? '#222124' : 'rgba(255,255,255,0.3)',
                  cursor: tempRange?.from ? 'pointer' : 'not-allowed',
                }}
                onMouseEnter={e => {
                  if (tempRange?.from) e.currentTarget.style.boxShadow = '0 4px 12px rgba(218,241,99,0.35)'
                }}
                onMouseLeave={e => { e.currentTarget.style.boxShadow = 'none' }}
              >
                Terapkan
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}