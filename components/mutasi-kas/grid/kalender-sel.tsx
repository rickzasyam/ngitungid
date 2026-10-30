'use client'

// Ikon kalender di sel Tanggal (D66): membuka DATE PICKER YANG SUDAH ADA,
// `components/date-range-picker.tsx`, APA ADANYA — berkasnya tidak diubah
// (Stream B sedang merapikan aksesibilitasnya). Konsekuensinya, dan cara
// grid menyiasatinya tanpa menyentuh komponennya:
//
// 1. Pemicunya adalah tombol lebar berlabel; di sel ia dipersempit jadi ikon
//    lewat CSS `.gm-kalender` (grid-mutasi.css). Label tanggalnya disembunyikan
//    secara VISUAL saja, supaya tombol tetap punya nama yang dibacakan.
// 2. Tidak ada API untuk membukanya dari luar: Alt+↓ di grid MENGEKLIK tombol
//    pemicu itu (`bukaKalenderDi`).
// 3. Ia pemilih RENTANG, dan nilai awalnya (tanggal sel) sudah menjadi
//    "tanggal mulai": klik SATU tanggal menutup rentang [awal, klik] (atau
//    [klik, awal]). Yang dipakai = tanggal yang BUKAN nilai awal
//    (`tanggalDariRentang`).
//    Footer panelnya karena itu menampilkan rentang — keterbatasan komponen.
// 4. Tanpa nilai, ia terbuka di Januari; jadi sel kosong diberi tanggal 1
//    bulan grid sebagai nilai awal.
// 5. Sesudah ditutup, ia mengembalikan fokus ke pemicunya (di dalam sel).
//    Fokus itu dikembalikan ke sel grid supaya navigasi panah jalan lagi.
// 6. Panelnya di-portal ke <body>, tapi tetap anak React sel ini — event
//    React-nya merambat ke react-data-grid (Tab/Enter di kalender akan
//    menggerakkan grid). Event yang datang dari panel dihentikan di sini.
// 7. Label pemicu = tanggal yang sama dengan isi sel; pembaca layar akan
//    membacanya dua kali. Wadahnya `aria-hidden`: ini jalur MOUSE — jalur
//    keyboard dan pembaca layar adalah Alt+↓, yang membuka panel (dialog
//    berlabel) langsung.

import { DateRangePicker } from '@/components/date-range-picker'
import { ymdToLocalDate } from '@/lib/ymd'
import { namaBulanGrid, tanggalDariRentang, type BulanGrid } from '@/lib/mutasi-tanggal'

type Props = {
  /** Tanggal sel bila sudah satu tanggal pasti di bulan grid, selain itu null. */
  ymd: string | null
  bulanGrid: BulanGrid
  onPilih: (ymd: string) => void
}

/** Fokus ke sel grid yang memuat `el` (sel aktif ber-tabIndex 0). */
const fokusSel = (el: Element | null) => el?.closest<HTMLElement>('[role="gridcell"]')?.focus()

const pemicuDi = (akar: ParentNode | null) => akar?.querySelector<HTMLButtonElement>('.gm-kalender button[aria-haspopup="dialog"]') ?? null

/** Alt+↓: buka kalender sel Tanggal di dalam `akar` (sel aktif). */
export function bukaKalenderDi(akar: ParentNode | null): boolean {
  const t = pemicuDi(akar)
  if (!t) return false
  t.click()
  return true
}

export function KalenderSel({ ymd, bulanGrid, onPilih }: Props) {
  const awal = ymd ?? `${bulanGrid.tahun}-${String(bulanGrid.bulan).padStart(2, '0')}-01`
  // Event dari panel (portal) tidak boleh sampai ke react-data-grid.
  const dariPanel = (e: React.SyntheticEvent<HTMLElement>) => !e.currentTarget.contains(e.target as Node)
  const henti = (e: React.SyntheticEvent<HTMLElement>) => {
    if (dariPanel(e)) e.stopPropagation()
  }
  return (
    <span
      className="gm-picu gm-kalender"
      aria-hidden="true"
      onKeyDown={e => {
        // Escape TIDAK dihentikan: stopPropagation React ikut menghentikan
        // event native, dan date-range-picker menutup panelnya lewat listener
        // keydown di `document`. Grid tidak bereaksi pada Escape di sel aktif.
        if (e.key !== 'Escape') henti(e)
      }}
      onClick={henti}
      onDoubleClick={henti}
      onMouseDown={e => {
        if (dariPanel(e)) e.stopPropagation()
        // Klik pemicu tidak memindah fokus ke sana (klik tetap membukanya).
        else e.preventDefault()
      }}
      onFocus={e => {
        if (dariPanel(e)) {
          e.stopPropagation()
          return
        }
        const t = e.target as HTMLElement
        if (!t.matches('button[aria-haspopup="dialog"]')) return
        // Fokus jatuh ke pemicu saat panel DITUTUP (Terapkan/Batal/Esc) →
        // kembalikan ke sel. Saat panel terbuka, fokus ada di dalam panel.
        window.setTimeout(() => {
          if (document.activeElement === t && t.getAttribute('aria-expanded') !== 'true') fokusSel(t)
        }, 0)
      }}
    >
      <DateRangePicker
        value={{ from: ymdToLocalDate(awal), to: undefined }}
        onChange={r => {
          const ymdPilih = tanggalDariRentang(r, awal)
          if (ymdPilih) onPilih(ymdPilih)
        }}
        placeholder={`Pilih tanggal ${namaBulanGrid(bulanGrid)}`}
      />
    </span>
  )
}
