// Navigasi keyboard kalender (DateRangePicker & DatePicker, panel bersama) — MURNI (tanpa React, tanpa DOM),
// supaya bisa diuji di environment node seperti lib lain.
//
// Pola "date grid" WAI-ARIA APG: panah kiri/kanan = ±1 hari, atas/bawah = ±1
// minggu, Home/End = awal/akhir minggu (Senin–Minggu, sama dengan kolom
// kalender), PageUp/PageDown = ±1 bulan, Shift+PageUp/PageDown = ±1 tahun.
// Semua tanggal adalah Date tengah malam LOKAL (lib/ymd.ts) dan dibentuk lewat
// konstruktor (tahun, bulan, tanggal) — tidak ada aritmetika milidetik, jadi
// pergantian jam musim panas tidak menggeser hari.

import { dalamBatas, type BatasKalender } from './kalender-batas'
import { localDateToYmd } from './ymd'

/** Kolom kalender: Senin = 0 … Minggu = 6. */
const kolomMinggu = (d: Date) => (d.getDay() + 6) % 7

const tambahHari = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)

/** ±n bulan; tanggal dipotong ke akhir bulan tujuan (31 Jan + 1 bulan = 28/29 Feb, bukan 2/3 Mar). */
function tambahBulan(d: Date, n: number): Date {
  const akhir = new Date(d.getFullYear(), d.getMonth() + n + 1, 0).getDate()
  return new Date(d.getFullYear(), d.getMonth() + n, Math.min(d.getDate(), akhir))
}

/**
 * Tanggal tujuan untuk satu tombol, atau null bila tombol itu bukan navigasi
 * (Enter/Spasi/Tab/Escape dibiarkan ke perilaku tombol asli & panel).
 */
export function tujuanTombol(tanggal: Date, key: string, shift = false): Date | null {
  switch (key) {
    case 'ArrowLeft':
      return tambahHari(tanggal, -1)
    case 'ArrowRight':
      return tambahHari(tanggal, 1)
    case 'ArrowUp':
      return tambahHari(tanggal, -7)
    case 'ArrowDown':
      return tambahHari(tanggal, 7)
    case 'Home':
      return tambahHari(tanggal, -kolomMinggu(tanggal))
    case 'End':
      return tambahHari(tanggal, 6 - kolomMinggu(tanggal))
    case 'PageUp':
      return tambahBulan(tanggal, shift ? -12 : -1)
    case 'PageDown':
      return tambahBulan(tanggal, shift ? 12 : 1)
    default:
      return null
  }
}

/**
 * Tanggal (1…akhir bulan) yang menjadi SATU-SATUNYA sel Tab di bulan ini
 * (roving tabindex): kandidat pertama yang jatuh di bulan ini — urutannya dari
 * pemanggil (tanggal yang sedang difokus, tanggal awal terpilih, hari ini) —
 * selain itu tanggal 1. Tiap bulan yang tampil punya tepat satu, jadi kalender
 * tetap terjangkau Tab walau bulan kedua disembunyikan di layar sempit.
 *
 * Dengan `batas` (DatePicker min/max): sel di luar batas MATI dan tidak bisa
 * difokus, jadi kandidat di luar batas dilewati dan penggantinya tanggal
 * pertama yang boleh dipilih — bukan tanggal 1 yang mungkin mati.
 */
export function hariAktif(tahun: number, bulan: number, kandidat: readonly (Date | null | undefined)[], batas?: BatasKalender): number {
  const boleh = (tanggal: number) => dalamBatas(localDateToYmd(new Date(tahun, bulan, tanggal)), batas)
  for (const k of kandidat) {
    if (k && k.getFullYear() === tahun && k.getMonth() === bulan && boleh(k.getDate())) return k.getDate()
  }
  const akhir = new Date(tahun, bulan + 1, 0).getDate()
  for (let t = 1; t <= akhir; t++) if (boleh(t)) return t
  return 1
}
