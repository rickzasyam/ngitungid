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
 * Tanggal HARI INI di Jakarta (WIB, UTC+7), sebagai 'YYYY-MM-DD'.
 *
 * SATU-SATUNYA pembaca jam untuk urusan tanggal kalender — di server MAUPUN
 * browser (keputusan Ricko 2026-10-26; menggantikan pembaca lama yang memakai jam
 * lokal). Alasannya: Vercel berjalan di UTC, jadi jam server masih "kemarin"
 * antara 00.00 dan 07.00 WIB, dan perangkat di zona lain melihat tanggal lain.
 * Bisnis klien berjalan di WIB, jadi "hari ini" juga WIB, di mana pun kodenya jalan.
 *
 * Komponen TIDAK boleh membacanya sendiri-sendiri: halaman menghitungnya sekali
 * lalu MENERUSKANNYA ke bawah — dua pembaca bisa berbeda tepat saat tengah malam
 * lewat. Pemanggil yang butuh objek Date memakai `ymdToLocalDate(hariIniJakarta())`.
 */
export function hariIniJakarta(sekarang: Date = new Date()): string {
  // en-CA memformat tanggal sebagai YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(sekarang)
}

export const BULAN_PENDEK = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des']

/** 'YYYY-MM-DD' → '15 Sep 2026'. Dipecah sebagai STRING, tanpa objek Date (P2).
 *  Di sini, bukan di komponen, supaya pesan server memakai format yang sama. */
export function fmtTanggal(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number)
  return `${d} ${BULAN_PENDEK[m - 1] ?? '?'} ${y}`
}
