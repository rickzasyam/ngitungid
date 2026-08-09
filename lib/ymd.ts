// BATAS antara tanggal-sebagai-string dan objek Date. Murni (tanpa I/O, tanpa
// React).
//
// ══ KENAPA MODUL INI ADA ═══════════════════════════════════════════════════
// Aturan proyek: tanggal kalender ('YYYY-MM-DD') diperlakukan sebagai STRING
// dari ujung ke ujung — lihat kepala lib/contracts.ts. Tapi komponen kalender
// yang sudah ada (components/date-range-picker.tsx) bekerja dengan objek Date,
// dan "hari ini" memang cuma bisa dibaca dari jam sistem.
//
// Jadi konversinya harus ada. Yang berbahaya adalah konversi itu TERSEBAR:
// begitu setiap halaman menulis `new Date(ymd)`-nya sendiri, satu di antaranya
// akan memakai jalur UTC dan mundur sehari. Itu sudah pernah terjadi — periode
// laporan dikirim lewat toISOString() di WIB dan Januari terlempar ke Desember.
//
// Maka: SATU tempat, dua fungsi, dan aturan yang sama di keduanya —
//   - Konstruksi memakai `new Date(y, m - 1, d)` (komponen LOKAL), BUKAN
//     `new Date('2026-01-01')`, yang di-parse sebagai tengah malam UTC dan di
//     WIB (UTC+7) sudah jadi tanggal sebelumnya.
//   - Pembacaan memakai getFullYear/getMonth/getDate (LOKAL), BUKAN
//     toISOString(), yang mengonversi balik ke UTC dan menggeser lagi.
// Keduanya lokal, jadi round-trip-nya identitas di zona waktu MANA PUN.

/** Date (tengah malam lokal) → 'YYYY-MM-DD'. Tidak pernah lewat toISOString(). */
export function localDateToYmd(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** 'YYYY-MM-DD' → Date tengah malam LOKAL. Tidak pernah `new Date(string)`. */
export function ymdToLocalDate(ymd: string): Date {
  const [y, m, d] = ymd.split('-').map(Number)
  return new Date(y, m - 1, d)
}

/**
 * Tanggal HARI INI menurut jam lokal pengguna, sebagai 'YYYY-MM-DD'.
 *
 * SATU-SATUNYA pembaca jam untuk urusan tanggal kalender. Komponen TIDAK boleh
 * memanggilnya sendiri-sendiri: halaman menghitungnya sekali lalu MENERUSKANNYA
 * ke bawah. Kalau dua komponen membacanya masing-masing, keduanya bisa berbeda
 * tepat saat tengah malam lewat — satu badge bilang "akan berakhir", tetangganya
 * bilang "selesai", pada baris yang sama.
 */
export function todayYmd(): string {
  return localDateToYmd(new Date())
}
