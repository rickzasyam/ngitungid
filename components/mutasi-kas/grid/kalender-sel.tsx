'use client'

// Ikon kalender di sel Tanggal (D66) — `components/date-picker.tsx` (PR #6,
// satu tanggal, satu bulan per panel) dipakai apa adanya:
//
// 1. Pemicu = ikon (`renderPemicu`), di dalam wadah `aria-hidden` dan
//    tabIndex -1: ini jalur MOUSE. Jalur keyboard & pembaca layar adalah
//    Alt+↓, yang membuka panel (dialog berlabel) lewat `open`/`onOpenChange`
//    — grid memegang keadaan buka/tutupnya (`terbuka`/`onBuka`).
// 2. Kalender terbuka di bulan grid dan hanya tanggal bulan itu yang bisa
//    dipilih (`batasKalenderGrid`). Satu klik langsung memilih.
// 3. Panel ditempatkan relatif ke SEL grid, dan fokus kembali ke sel itu
//    sesudah memilih atau Escape — navigasi panah grid jalan lagi.
// 4. Panel di-portal ke <body> tapi tetap anak React sel ini, jadi event
//    React-nya merambat ke react-data-grid. `isolasiEvent` panel menghentikan
//    keydown/mousedown/click; event lain yang ditangani grid (klik ganda =
//    buka editor, salin/tempel, menu konteks, fokus, keyup) dihentikan di
//    wadah ini bila datang dari panel.

import { useRef, type SyntheticEvent } from 'react'
import { Calendar } from 'lucide-react'
import { DatePicker } from '@/components/date-picker'
import { batasKalenderGrid, namaBulanGrid, type BulanGrid } from '@/lib/mutasi-tanggal'

type Props = {
  /** Tanggal sel bila sudah satu tanggal pasti di bulan grid, selain itu ''. */
  ymd: string
  bulanGrid: BulanGrid
  terbuka: boolean
  onBuka: (buka: boolean) => void
  onPilih: (ymd: string) => void
}

export function KalenderSel({ ymd, bulanGrid, terbuka, onBuka, onPilih }: Props) {
  const selRef = useRef<HTMLElement | null>(null)
  const batas = batasKalenderGrid(bulanGrid)
  // Event dari panel (portal) tidak boleh sampai ke react-data-grid.
  const henti = (e: SyntheticEvent<HTMLElement>) => {
    if (!e.currentTarget.contains(e.target as Node)) e.stopPropagation()
  }
  return (
    <span
      ref={el => {
        selRef.current = el?.closest<HTMLElement>('[role="gridcell"]') ?? null
      }}
      className="gm-picu"
      aria-hidden="true"
      onDoubleClick={henti}
      onKeyUp={henti}
      onCopy={henti}
      onPaste={henti}
      onContextMenu={henti}
      onFocus={henti}
    >
      <DatePicker
        value={ymd}
        onChange={v => {
          if (v) onPilih(v)
        }}
        open={terbuka}
        onOpenChange={onBuka}
        jangkarRef={selRef}
        fokusKembaliKe={selRef}
        bulanAwal={batas.bulanAwal}
        min={batas.min}
        max={batas.max}
        renderPemicu={p => (
          <button
            {...p}
            tabIndex={-1}
            aria-label={`Pilih tanggal ${namaBulanGrid(bulanGrid)}`}
            title="Pilih tanggal (Alt+↓)"
            className="gm-panah"
            // Klik pemicu tidak memindah fokus dari sel (klik tetap membuka).
            onMouseDown={e => e.preventDefault()}
          >
            <Calendar size={14} aria-hidden="true" />
          </button>
        )}
      />
    </span>
  )
}
