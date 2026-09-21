// Kebijakan akses HALAMAN per-role. Murni (tanpa I/O) supaya dipakai bareng
// oleh guard proxy (authorized callback di lib/auth.ts, lapisan middleware yang
// jalan SEBELUM render) dan filter menu sidebar — satu sumber kebenaran, dan
// bisa diuji tanpa NextAuth/DB (pola sama dengan lib/roles.ts & retry-policy.ts).
//
// Spek role: 'user' (klien) = read-only. Boleh Dashboard, Analytics, Laporan
// (monitoring bulan mana yang sudah/belum di-upload), dan Settings terbatas
// (General + Master COA, read-only). TIDAK boleh proses kerja: upload, COA
// mapping, extraction review, admin overview. owner & akunting = staf, penuh.

import { canDoAccounting, canViewContracts, isInternal, type Role } from '@/lib/roles'

// Prefix surface KERJA AKUNTING (dan turunannya, mis. /coa-mapping/abc).
// Catatan: /laporan & /settings SENGAJA TIDAK di sini — user boleh membukanya
// (read-only; kontrol tulis disembunyikan di komponen & ditegakkan
// requireAkunting/Owner di API).
export const ACCOUNTING_ONLY_PREFIXES = [
  '/upload',
  '/jurnal',
  // Buku besar = jurnal yang sama dibaca per akun. Gerbangnya WAJIB sama dengan
  // /jurnal: gerbang yang lebih longgar di salah satunya membuat yang lebih
  // ketat jadi kosmetik, karena isinya bisa dibaca lewat pintu sebelah.
  '/buku-besar',
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
export const INTERNAL_ONLY_PREFIXES = [
  '/admin-overview',
  // Modul pembelian (D45): finance MELIHAT kewajiban klien dan mengunduhnya,
  // menulis tetap milik akunting (requireAkunting di API). Klien tidak melihat
  // sama sekali — isInternal menutupnya, bukan requireUser.
  '/pembelian',
] as const

/**
 * Prefix KONTRAK — bentuk KETIGA, dan sengaja tidak dilipat ke dua daftar di
 * atas karena tidak berbentuk seperti keduanya: yang boleh adalah owner,
 * finance, DAN klien, sementara **akunting ditolak**.
 *
 * Ini satu-satunya surface tempat klien boleh masuk tapi akunting tidak, jadi
 * ia tidak bisa ikut STAFF_ONLY_PREFIXES (yang justru berarti "klien dilarang").
 * Kebijakan role-nya sendiri ada di canViewContracts() — di lib/roles.ts
 * bersama predikat role lain, bukan diulang di sini.
 *
 * Aman terhadap pantulan useRequireClient: hook itu memantulkan role INTERNAL
 * tanpa klien aktif ke /admin-overview, dan owner + finance dua-duanya lolos
 * INTERNAL_ONLY_PREFIXES di sana — jadi tidak ada loop seperti kasus finance
 * 2026-08-06. Klien tidak pernah dipantulkan (ia dipin ke kliennya sendiri).
 */
export const CONTRACT_PREFIXES = ['/kontrak'] as const

/** Gabungan keduanya — surface yang tertutup untuk role 'user' (klien).
 *  CONTRACT_PREFIXES SENGAJA tidak ikut: klien justru boleh ke sana. */
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
  // Surface kontrak: owner + finance + klien, TANPA akunting. Digerbangi di
  // sini dan bukan hanya di filter menu sidebar — item menu yang disembunyikan
  // bukan kontrol akses, ia cuma tidak diklik.
  if (CONTRACT_PREFIXES.some((p) => matchesPrefix(pathname, p))) {
    return canViewContracts(role)
  }
  // Sisanya terbuka untuk semua role yang login.
  return true
}
