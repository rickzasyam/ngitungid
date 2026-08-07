// Kebijakan akses HALAMAN per-role. Murni (tanpa I/O) supaya dipakai bareng
// oleh guard proxy (authorized callback di lib/auth.ts, lapisan middleware yang
// jalan SEBELUM render) dan filter menu sidebar — satu sumber kebenaran, dan
// bisa diuji tanpa NextAuth/DB (pola sama dengan lib/roles.ts & retry-policy.ts).
//
// Spek role: 'user' (klien) = read-only. Boleh Dashboard, Analytics, Laporan
// (monitoring bulan mana yang sudah/belum di-upload), dan Settings terbatas
// (General + Master COA, read-only). TIDAK boleh proses kerja: upload, COA
// mapping, extraction review, admin overview. owner & akunting = staf, penuh.

import { canDoAccounting, isInternal, type Role } from '@/lib/roles'

// Prefix surface KERJA AKUNTING (dan turunannya, mis. /coa-mapping/abc).
// Catatan: /laporan & /settings SENGAJA TIDAK di sini — user boleh membukanya
// (read-only; kontrol tulis disembunyikan di komponen & ditegakkan
// requireAkunting/Owner di API).
export const ACCOUNTING_ONLY_PREFIXES = [
  '/upload',
  '/coa-mapping',
  '/extraction-review',
] as const

/**
 * Prefix untuk ORANG DALAM, tapi BUKAN pekerjaan akunting.
 *
 * /admin-overview adalah PEMILIH KLIEN — persis yang dibutuhkan setiap role
 * internal, termasuk finance. Tidak ada pekerjaan akunting di halaman itu, dan
 * aksi destruktifnya (hapus klien) sudah digerbangi isOwner sejak pemecahan
 * kebab 2026-08-06.
 *
 * KENAPA DIPISAH: dulu /admin-overview satu daftar dengan surface akunting,
 * sementara useRequireClient memantulkan SETIAP role internal tanpa klien aktif
 * ke sana. Untuk role internal yang tidak boleh akunting (finance) itu berarti:
 * dipantulkan ke /admin-overview → proxy menolak → dilempar ke /dashboard →
 * dipantulkan lagi. Loop tak berujung, dan baru terpicu saat akun finance
 * PERTAMA dibuat. Setiap prefix baru di sini WAJIB dicek terhadap tujuan
 * pantulan useRequireClient.
 */
export const INTERNAL_ONLY_PREFIXES = ['/admin-overview'] as const

/** Gabungan keduanya — surface yang tertutup untuk role 'user' (klien). */
export const STAFF_ONLY_PREFIXES = [
  ...ACCOUNTING_ONLY_PREFIXES,
  ...INTERNAL_ONLY_PREFIXES,
] as const

/** Tujuan redirect saat 'user' mencoba membuka surface staf. */
export const USER_HOME = '/dashboard'

/** Cocokkan path ke prefix: sama persis ATAU sub-path (`/x` cocok `/x` & `/x/..`
 *  tapi BUKAN `/xyz`). */
function matchesPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(prefix + '/')
}

/**
 * Boleh-kah `role` mengakses `pathname`?
 * owner & akunting: selalu true (staf, akses penuh).
 * user: false untuk STAFF_ONLY_PREFIXES (dan turunannya), true selain itu
 * (Dashboard, Analytics, dsb).
 */
export function isPathAllowedForRole(role: Role, pathname: string): boolean {
  // Surface kerja akunting: HANYA yang boleh mengerjakan akunting.
  //
  // Dulu barisnya `if (role !== 'user') return true` — gagal terbuka, sama
  // seperti canAccessClientData. Setiap role baru otomatis mendapat Upload,
  // Extraction Review, dan COA Mapping tanpa ada yang memutuskan begitu.
  // Sekarang gerbangnya canDoAccounting(), jadi 'finance' ditolak secara
  // EKSPLISIT — bukan karena kebetulan tidak ada di daftar mana pun.
  if (ACCOUNTING_ONLY_PREFIXES.some((p) => matchesPrefix(pathname, p))) {
    return canDoAccounting(role)
  }
  // Surface orang dalam (pemilih klien): semua role internal, termasuk finance.
  // Digerbangi isInternal — bukan canDoAccounting — supaya tidak bertabrakan
  // dengan pantulan useRequireClient ke halaman yang sama.
  if (INTERNAL_ONLY_PREFIXES.some((p) => matchesPrefix(pathname, p))) {
    return isInternal(role)
  }
  // Sisanya terbuka untuk semua role yang login.
  return true
}
