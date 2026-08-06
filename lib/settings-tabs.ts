// Kebijakan VISIBILITAS tab Settings per-role. Murni (tanpa I/O, tanpa React)
// supaya bisa diuji tanpa merender halaman — pola sama dengan lib/route-access.ts.
//
// File ini memiliki DAFTAR tab-nya, bukan cuma aturannya. app/settings/page.tsx
// menempelkan label/ikon/deskripsi per id. Pemisahan itu disengaja: menambah tab
// baru WAJIB lewat SETTINGS_TABS di bawah, sehingga test visibilitas ikut gagal
// sampai keputusan aksesnya dibuat eksplisit. Kalau daftarnya hidup di page,
// tab baru bisa diam-diam bocor ke role user tanpa satu test pun merah.
//
// Ingat: menyembunyikan tab BUKAN kontrol keamanan. Penjaga sesungguhnya ada di
// requireOwner()/requireAkunting() pada route API masing-masing.

import { isOwner, isInternal, type Role } from '@/lib/roles'

export type SettingsTabId =
  | 'general'
  | 'coa'
  | 'analytics'
  | 'users'
  | 'account'
  | 'notifications'

/** Urutan array = urutan tampil di nav kiri. */
export const SETTINGS_TABS: { id: SettingsTabId; ownerOnly?: boolean }[] = [
  { id: 'general' },
  { id: 'coa' },
  { id: 'analytics' },
  { id: 'users', ownerOnly: true },
  { id: 'account' },
  { id: 'notifications' },
]

/**
 * Tab yang boleh dilihat role 'user' (klien).
 *
 * 'account' ADA di sini sejak fitur ganti password: setiap orang harus bisa
 * mengganti password akunnya sendiri, termasuk klien. Yang TETAP tersembunyi:
 * 'analytics' (Analytics Display — mengatur apa yang klien lihat, bukan untuk
 * klien), 'users' (Kelola Akun — owner-only), dan 'notifications'.
 */
export const USER_VISIBLE_TABS: SettingsTabId[] = ['general', 'coa', 'account']

/** Boleh-kah `role` melihat tab `id`? */
export function isSettingsTabVisible(role: Role | null | undefined, id: SettingsTabId): boolean {
  const tab = SETTINGS_TABS.find(t => t.id === id)
  if (!tab) return false
  // Staf: semua tab, kecuali yang ownerOnly hanya untuk owner.
  if (isInternal(role)) return !tab.ownerOnly || isOwner(role)
  return USER_VISIBLE_TABS.includes(id)
}

/** Daftar tab yang terlihat untuk `role`, dalam urutan tampil. */
export function visibleSettingsTabs(role: Role | null | undefined): SettingsTabId[] {
  return SETTINGS_TABS.filter(t => isSettingsTabVisible(role, t.id)).map(t => t.id)
}
