// Batas pilihan kalender (min/max) dan bulan yang tampil saat kalender dibuka —
// MURNI (tanpa React, tanpa DOM), untuk DatePicker dan panel kalender bersama
// (components/kalender-panel.tsx).
//
// Tanggal dibandingkan sebagai STRING 'YYYY-MM-DD': urutan leksikografisnya
// sama dengan urutan tanggal. Date hanya dibentuk lewat lib/ymd (komponen
// lokal) — tidak pernah `new Date(string)`. Tanpa ekspresi reguler.

import { localDateToYmd, ymdToLocalDate } from './ymd'

/** Batas inklusif 'YYYY-MM-DD'; tidak diisi = tanpa batas di sisi itu. */
export type BatasKalender = { min?: string; max?: string }

/** 'YYYY-MM-DD' yang benar-benar ada (2026-02-30 dan '2026-2-3' ditolak). */
export function ymdSah(s: string): boolean {
  if (s.length !== 10 || s[4] !== '-' || s[7] !== '-') return false
  for (const i of [0, 1, 2, 3, 5, 6, 8, 9]) if (s[i] < '0' || s[i] > '9') return false
  return localDateToYmd(ymdToLocalDate(s)) === s
}

/** Batas dari props: nilai yang bukan tanggal sah diabaikan, bukan dibandingkan sebagai teks. */
export function batasSah(min?: string, max?: string): BatasKalender {
  return { min: min && ymdSah(min) ? min : undefined, max: max && ymdSah(max) ? max : undefined }
}

export function dalamBatas(ymd: string, batas?: BatasKalender): boolean {
  return !(batas?.min && ymd < batas.min) && !(batas?.max && ymd > batas.max)
}

/** Tujuan navigasi keyboard di luar batas berhenti DI batasnya. Di dalam batas: Date yang sama. */
export function jepitTanggal(d: Date, batas?: BatasKalender): Date {
  const ymd = localDateToYmd(d)
  if (batas?.min && ymd < batas.min) return ymdToLocalDate(batas.min)
  if (batas?.max && ymd > batas.max) return ymdToLocalDate(batas.max)
  return d
}

/** Bulan (bulan 0–11) masih memuat setidaknya satu tanggal yang boleh dipilih. */
export function bulanDalamBatas(tahun: number, bulan: number, batas?: BatasKalender): boolean {
  const awal = localDateToYmd(new Date(tahun, bulan, 1))
  const akhir = localDateToYmd(new Date(tahun, bulan + 1, 0))
  return !(batas?.min && akhir < batas.min) && !(batas?.max && awal > batas.max)
}

/**
 * Bulan pertama yang tampil saat kalender dibuka: bulan nilai yang terpilih →
 * `bulanAwal` ('YYYY-MM') → hari ini, dijepit ke batas (kalender yang dibatasi
 * ke bulan grid tidak boleh terbuka di bulan yang seluruhnya mati).
 */
export function bulanAwalTampil(p: { value: string; bulanAwal?: string; batas?: BatasKalender; hariIni: string }): { tahun: number; bulan: number } {
  const dari = ymdSah(p.value)
    ? p.value
    : p.bulanAwal && ymdSah(`${p.bulanAwal}-01`)
      ? `${p.bulanAwal}-01`
      : localDateToYmd(jepitTanggal(ymdToLocalDate(p.hariIni), p.batas))
  const d = ymdToLocalDate(dari)
  return { tahun: d.getFullYear(), bulan: d.getMonth() }
}
