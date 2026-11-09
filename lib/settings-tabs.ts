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

import { isOwner, isInternal, canManageCommercial, type Role } from '@/lib/roles'

export type SettingsTabId =
  | 'general'
  | 'coa'
  | 'supplier'
  | 'pembukuan'
  | 'aturan-mutasi'
  | 'analytics'
  | 'users'
  | 'layanan'
  | 'account'
  | 'notifications'

/** Urutan array = urutan tampil di nav kiri. */
export const SETTINGS_TABS: { id: SettingsTabId; ownerOnly?: boolean; commercialOnly?: boolean }[] = [
  { id: 'general' },
  { id: 'coa' },
  { id: 'supplier' },
  // Pembukuan: setelan yang mengubah PERILAKU pembukuan klien — akun PPN
  // Masukan (D33) dan sakelar "posting bisa diedit" (D42). Kelak menampung
  // kunci periode (§7.B, K4).
  //
  // BUKAN untuk finance, dan itu keputusan: ia menyetel bagaimana pembukuan
  // dikerjakan, bukan melihat hasilnya. Tidak ada di FINANCE_VISIBLE_TABS, jadi
  // ia tersaring di cabang finance sebelum sampai ke isInternal.
  { id: 'pembukuan' },
  // Aturan Mutasi (D57): "uraian mengandung X → akun lawan Y" per klien. Tulis
  // = akunting/owner; finance MELIHAT read-only (FINANCE_VISIBLE_TABS), sama
  // pembelahannya dengan Supplier. Klien tidak melihatnya.
  { id: 'aturan-mutasi' },
  { id: 'analytics' },
  { id: 'users', ownerOnly: true },
  // Master Layanan: katalog jasa yang dijual. owner + finance, TANPA akunting —
  // akunting mengerjakan pembukuan klien, bukan menentukan apa yang dijual.
  { id: 'layanan', commercialOnly: true },
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

/**
 * Tab yang boleh dilihat role 'finance'. Daftar SENDIRI, bukan turunan.
 *
 * finance adalah orang dalam, jadi tanpa cabang khusus ia akan jatuh ke cabang
 * isInternal() dan melihat SEMUA tab termasuk Master COA & Analytics Display —
 * padahal ia tidak mengerjakan akunting. Cabangnya diperiksa LEBIH DULU
 * daripada isInternal() justru karena itu.
 */
// CATATAN: 'layanan' TIDAK di daftar ini — tab commercialOnly ditangani lebih
// dulu lewat canManageCommercial(), jadi finance mendapatnya dari sana.
// 'supplier' ADA di sini sejak R4 (jawaban Ricko 2026-09-15): finance boleh
// MELIHAT daftar rekanan, tapi tidak mengelolanya. Tab-nya dirender read-only
// lewat prop readOnly, dan API-nya menegakkan pembelahan yang sama — baca
// requireInternal, tulis requireAkunting. Menyembunyikan tombol saja bukan
// kontrol keamanan; yang menegakkan tetap penjaga di route.
// 'aturan-mutasi' ADA di sini (S4, D57): pola yang sama dengan Supplier — baca
// requireInternal, tulis requireAkunting, tab dirender read-only.
export const FINANCE_VISIBLE_TABS: SettingsTabId[] = ['general', 'supplier', 'aturan-mutasi', 'account']

/** Boleh-kah `role` melihat tab `id`? */
export function isSettingsTabVisible(role: Role | null | undefined, id: SettingsTabId): boolean {
  const tab = SETTINGS_TABS.find(t => t.id === id)
  if (!tab) return false
  // commercialOnly PALING DULU — berlaku lintas role, termasuk owner (yang
  // lolos lewat canManageCommercial) dan akunting (yang TIDAK, walau ia
  // isInternal dan tab-nya bukan ownerOnly).
  if (tab.commercialOnly) return canManageCommercial(role)
  // finance berikutnya — ia juga isInternal, jadi kalau urutannya dibalik ia
  // akan ikut mendapat Master COA, Analytics Display, dan Kelola Akun.
  if (role === 'finance') return FINANCE_VISIBLE_TABS.includes(id)
  // Orang dalam lain: semua tab, kecuali yang ownerOnly hanya untuk owner.
  if (isInternal(role)) return !tab.ownerOnly || isOwner(role)
  return USER_VISIBLE_TABS.includes(id)
}

/** Daftar tab yang terlihat untuk `role`, dalam urutan tampil. */
export function visibleSettingsTabs(role: Role | null | undefined): SettingsTabId[] {
  return SETTINGS_TABS.filter(t => isSettingsTabVisible(role, t.id)).map(t => t.id)
}
