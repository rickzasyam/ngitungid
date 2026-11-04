'use client'

import { useState, useRef } from 'react'
import { Calendar, X } from 'lucide-react'
import { KalenderPanel, TODAY, formatDate, isSameDay } from '@/components/kalender-panel'

// Panel kalendernya (sel tanggal, penempatan, fokus, Escape, navigasi panah)
// ada di components/kalender-panel.tsx, dipakai bersama DatePicker satu tanggal.
// Di sini tinggal yang khusus rentang: pemicu, tombol hapus, pemilihan dua
// tanggal, dan footer Batal/Terapkan.

interface DateRange {
  from: Date | undefined
  to: Date | undefined
}

interface DateRangePickerProps {
  value: DateRange | undefined
  onChange: (range: DateRange | undefined) => void
  placeholder?: string
}

const formatRangeLabel = (range: DateRange | undefined) => {
  if (!range?.from) return null
  if (!range.to) return formatDate(range.from)
  return `${formatDate(range.from)} – ${formatDate(range.to)}`
}

export function DateRangePicker({ value, onChange, placeholder = 'Pilih periode laporan' }: DateRangePickerProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [tempRange, setTempRange] = useState<DateRange | undefined>(value)
  const [viewYear, setViewYear] = useState(value?.from?.getFullYear() ?? TODAY.getFullYear())
  const [viewMonth, setViewMonth] = useState(value?.from?.getMonth() ?? 0)
  const containerRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)

  /** Tutup lewat tombol di dalam panel — fokus kembali ke pemicunya. */
  const tutupKePemicu = () => {
    setIsOpen(false)
    triggerRef.current?.focus()
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

      {/* Panel bersama (components/kalender-panel.tsx) — di-portal ke <body>;
          alasannya di sana. Dirender hanya selama terbuka. */}
      {isOpen && (
        <KalenderPanel
          jangkarRef={containerRef}
          label="Pilih rentang tanggal"
          viewYear={viewYear}
          viewMonth={viewMonth}
          onViewChange={(tahun, bulan) => {
            setViewYear(tahun)
            setViewMonth(bulan)
          }}
          range={tempRange}
          jumlahBulan={2}
          onDayClick={handleDayClick}
          onTutup={kembalikanFokus => {
            if (kembalikanFokus) triggerRef.current?.focus()
            setIsOpen(false)
          }}
        >
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
        </KalenderPanel>
      )}
    </div>
  )
}