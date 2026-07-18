// Kebijakan akses HALAMAN per-role. Murni (tanpa I/O) supaya dipakai bareng
// oleh guard proxy (authorized callback di lib/auth.ts, lapisan middleware yang
// jalan SEBELUM render) dan filter menu sidebar — satu sumber kebenaran, dan
// bisa diuji tanpa NextAuth/DB (pola sama dengan lib/roles.ts & retry-policy.ts).
//
// Spek role: 'user' (klien) = read-only. Boleh Dashboard, Analytics, Laporan
// (monitoring bulan mana yang sudah/belum di-upload), dan Settings terbatas
// (General + Master COA, read-only). TIDAK boleh proses kerja: upload, COA
// mapping, extraction review, admin overview. owner & akunting = staf, penuh.

import type { Role } from '@/lib/roles'

// Prefix surface KERJA staf yang tetap terkunci untuk 'user' (dan turunannya,
// mis. /coa-mapping/abc). /extraction-review & /admin-overview ikut walau tak
// punya item nav 1:1 — keduanya alur kerja staf. Catatan: /laporan & /settings
// SENGAJA TIDAK di sini — user boleh membukanya (read-only; kontrol tulis
// disembunyikan di komponen & ditegakkan requireAkunting/Owner di API).
export const STAFF_ONLY_PREFIXES = [
  '/upload',
  '/coa-mapping',
  '/extraction-review',
  '/admin-overview',
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
  if (role !== 'user') return true
  return !STAFF_ONLY_PREFIXES.some((p) => matchesPrefix(pathname, p))
}
