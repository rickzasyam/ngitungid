'use client'

import { useRef, useState, type ReactNode, type Ref, type RefObject } from 'react'
import { Calendar, X } from 'lucide-react'
import { KalenderPanel, TODAY, formatDate } from '@/components/kalender-panel'
import { batasSah, bulanAwalTampil, ymdSah, type BatasKalender } from '@/lib/kalender-batas'
import { localDateToYmd, ymdToLocalDate } from '@/lib/ymd'

// Date picker SATU TANGGAL (keputusan Ricko 2026-10-30) — untuk sel tanggal
// grid mutasi kas (Stream A memasangnya) dan form lain.
//  - Panel kalender = panel DateRangePicker (components/kalender-panel.tsx):
//    tampilan sel, warna, keyboard (panah/Home/End/PageUp/PageDown, roving
//    tabindex, Escape) sama persis.
//  - Nilai STRING 'YYYY-MM-DD' (atau '' = kosong) masuk dan keluar; konversi ke
//    Date hanya lewat lib/ymd — tidak pernah `new Date(string)`.
//  - Satu klik = pilih + tutup; tanpa tombol Terapkan.
//  - `open`/`onOpenChange` opsional: grid membukanya sendiri (Alt+↓) tanpa
//    mengeklik tombol tersembunyi. Tanpa keduanya picker mengatur dirinya.
//  - Pemicu bisa diganti (`renderPemicu`) atau ditiadakan; fokus kembali ke
//    `fokusKembaliKe` (bawaan: pemicu) saat ditutup lewat pilihan atau Escape.
//  - Satu bulan per panel (bukan dua): min/max biasanya mengunci ke bulan grid.

/** Props yang WAJIB dipasang pada <button> pemicu pengganti (beri juga aria-label bila isinya ikon saja). */
export interface PemicuDatePicker {
  ref: Ref<HTMLButtonElement>
  type: 'button'
  'aria-haspopup': 'dialog'
  'aria-expanded': boolean
  onClick: () => void
}

export interface DatePickerProps {
  /** 'YYYY-MM-DD', atau '' bila kosong. Nilai yang bukan tanggal sah dianggap kosong. */
  value: string
  /** Selalu 'YYYY-MM-DD' saat memilih; '' saat dihapus lewat tombol hapus pemicu bawaan. */
  onChange: (ymd: string) => void
  /** Dikendalikan dari luar (mis. grid: Alt+↓). Tidak diisi = picker mengatur sendiri. */
  open?: boolean
  onOpenChange?: (open: boolean) => void
  /** Pemicu pengganti (mis. ikon saja); kembalikan null untuk tanpa pemicu. */
  renderPemicu?: (p: PemicuDatePicker) => ReactNode
  /** Acuan posisi panel (mis. sel grid). Bawaan: pembungkus pemicu. */
  jangkarRef?: RefObject<HTMLElement | null>
  /** Penerima fokus saat ditutup lewat pilihan atau Escape. Bawaan: pemicu. */
  fokusKembaliKe?: RefObject<HTMLElement | null>
  /** Bulan yang tampil bila nilai kosong, 'YYYY-MM'. Bawaan: bulan hari ini (dijepit ke min/max). */
  bulanAwal?: string
  /** Batas inklusif 'YYYY-MM-DD' — mis. awal & akhir bulan grid. */
  min?: string
  max?: string
  placeholder?: string
}

export function DatePicker({
  value,
  onChange,
  open,
  onOpenChange,
  renderPemicu,
  jangkarRef,
  fokusKembaliKe,
  bulanAwal,
  min,
  max,
  placeholder = 'Pilih tanggal',
}: DatePickerProps) {
  const [bukaSendiri, setBukaSendiri] = useState(false)
  const terkendali = open !== undefined
  const isOpen = terkendali ? open : bukaSendiri
  const wadahRef = useRef<HTMLDivElement>(null)
  // Elemen pemicu di STATE, bukan objek ref: pemicu pengganti menerimanya lewat
  // fungsi render, dan objek ref tidak boleh diteruskan saat render.
  const [pemicuEl, setPemicuEl] = useState<HTMLButtonElement | null>(null)
  const nilai = ymdSah(value) ? value : ''
  const batas = batasSah(min, max)

  const ubahBuka = (buka: boolean) => {
    if (!terkendali) setBukaSendiri(buka)
    onOpenChange?.(buka)
  }

  /** Tutup; fokus ke elemen pilihan pemanggil, selain itu ke pemicu. */
  const tutup = (kembalikanFokus: boolean) => {
    if (kembalikanFokus) (fokusKembaliKe?.current ?? pemicuEl)?.focus()
    ubahBuka(false)
  }

  // Satu klik = pilih + tutup (tanpa Terapkan).
  const handleDayClick = (date: Date) => {
    onChange(localDateToYmd(date))
    tutup(true)
  }

  const handleClear = () => {
    onChange('')
    // Tombol hapus lenyap begitu nilainya kosong — fokus jangan ikut hilang ke <body>.
    pemicuEl?.focus()
  }

  const pemicu: PemicuDatePicker = {
    ref: setPemicuEl,
    type: 'button',
    'aria-haspopup': 'dialog',
    'aria-expanded': isOpen,
    onClick: () => ubahBuka(!isOpen),
  }

  return (
    // Pemicu bawaan meniru pemicu DateRangePicker; label satu tanggal lebih
    // pendek, jadi lantainya 200px (rentang: 280px).
    <div ref={wadahRef} className="relative" style={renderPemicu ? undefined : { minWidth: 'min(200px, 100%)' }}>
      {renderPemicu ? (
        renderPemicu(pemicu)
      ) : (
        <>
          <button
            {...pemicu}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-left transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-accent-primary)"
            style={{
              background: 'white',
              border: isOpen ? '1.5px solid #bbb3f3' : '1.5px solid #e5e5e5',
              boxShadow: isOpen ? '0 0 0 3px rgba(187,179,243,0.12)' : 'none',
            }}
          >
            <Calendar className="w-4 h-4 flex-shrink-0" style={{ color: nilai ? '#bbb3f3' : 'var(--color-text-muted)' }} />
            <span
              className="flex-1 text-sm"
              style={{ color: nilai ? '#2d2d2d' : 'var(--color-text-muted)', fontWeight: nilai ? 500 : 400 }}
            >
              {nilai ? formatDate(ymdToLocalDate(nilai)) : placeholder}
            </span>
            {nilai && <span aria-hidden className="w-5 h-5 flex-shrink-0" />}
          </button>

          {/* Tombol hapus: tombol ASLI saudara pemicu, sama dengan DateRangePicker. */}
          {nilai && (
            <button
              type="button"
              aria-label="Hapus tanggal"
              onClick={handleClear}
              className="drp-clear group absolute top-1/2 cursor-pointer -translate-y-1/2 w-8 h-8 rounded-full flex items-center justify-center focus-visible:outline-none"
              style={{ right: 'calc(1rem + 1.5px - 6px)' }}
            >
              <span className="drp-clear-dot w-5 h-5 rounded-full flex items-center justify-center transition-colors group-focus-visible:ring-2 group-focus-visible:ring-(--color-accent-primary)">
                <X className="w-2.5 h-2.5" style={{ color: 'var(--color-text-muted)' }} />
              </span>
            </button>
          )}
        </>
      )}

      {isOpen && (
        <PanelTanggal
          nilai={nilai}
          bulanAwal={bulanAwal}
          batas={batas}
          jangkarRef={jangkarRef ?? wadahRef}
          wadahRef={wadahRef}
          onDayClick={handleDayClick}
          onTutup={tutup}
        />
      )}
    </div>
  )
}

/** Dipasang hanya selama terbuka: bulan yang tampil dihitung ulang tiap kali dibuka. */
function PanelTanggal({
  nilai,
  bulanAwal,
  batas,
  jangkarRef,
  wadahRef,
  onDayClick,
  onTutup,
}: {
  nilai: string
  bulanAwal: string | undefined
  batas: BatasKalender
  jangkarRef: RefObject<HTMLElement | null>
  wadahRef: RefObject<HTMLElement | null>
  onDayClick: (date: Date) => void
  onTutup: (kembalikanFokus: boolean) => void
}) {
  const [view, setView] = useState(() => bulanAwalTampil({ value: nilai, bulanAwal, batas, hariIni: localDateToYmd(TODAY) }))
  const terpilih = nilai ? ymdToLocalDate(nilai) : undefined
  return (
    <KalenderPanel
      jangkarRef={jangkarRef}
      wadahRef={wadahRef}
      label="Pilih tanggal"
      viewYear={view.tahun}
      viewMonth={view.bulan}
      onViewChange={(tahun, bulan) => setView({ tahun, bulan })}
      range={terpilih ? { from: terpilih, to: terpilih } : undefined}
      tunggal
      jumlahBulan={1}
      batas={batas}
      onDayClick={onDayClick}
      onTutup={onTutup}
      isolasiEvent
    />
  )
}
