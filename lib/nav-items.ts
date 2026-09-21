// Daftar item navigasi sidebar + siapa yang boleh melihat masing-masing.
// MURNI: tanpa I/O, tanpa React, tanpa ikon — supaya daftarnya bisa diuji
// sebagai DATA (isi persis + URUTAN persis per role).
//
// ══ KENAPA DIPISAH DARI sidebar.tsx ════════════════════════════════════════
// Daftar ini dulu literal di dalam komponen, jadi satu-satunya cara mengetahui
// apa yang dilihat sebuah role adalah membuka halamannya. Proyek ini tidak
// punya setup component-testing, sehingga urutan & isinya tidak pernah dijaga
// apa pun — dan urutan BUKAN detail kosmetik: kapsul aktif sidebar diposisikan
// dari `offsetTop` item aktif, jadi indeks yang bergeser diam-diam memindahkan
// kapsul ke slot yang salah (bug 2026-08-09: kapsul lime kosong parkir di bawah
// Settings sementara item aktifnya tak terlihat).
//
// Ikon SENGAJA tidak ada di sini. Menaruhnya berarti modul ini meng-import
// lucide-react dan berhenti bisa diuji sebagai data biasa; sidebar.tsx yang
// memetakan id → ikon.

import { canDoAccounting, canViewContracts, isInternal, type Role } from '@/lib/roles'

export type NavItemId =
  | 'dashboard'
  | 'analytics'
  | 'upload'
  | 'jurnal'
  | 'buku-besar'
  | 'pembelian'
  | 'mutasi-kas'
  | 'laporan'
  | 'kontrak'
  | 'coa-mapping'
  | 'operational'
  | 'settings'

export interface NavItem {
  id: NavItemId
  label: string
  /** Tampil tapi tidak bisa diklik (badge "SOON"). */
  comingSoon?: boolean
  /** Surface KERJA akunting — digerbangi canDoAccounting. */
  staffOnly?: boolean
  /** Surface KOMERSIAL — digerbangi canViewContracts (owner + finance + klien,
   *  TANPA akunting). Sumbu yang berbeda dari staffOnly, bukan turunannya. */
  contractOnly?: boolean
  /**
   * Surface ORANG DALAM — digerbangi isInternal (owner + akunting + finance).
   *
   * Sumbu KETIGA, dan sengaja bukan pelonggaran staffOnly: yang membedakannya
   * cuma finance. Modul pembelian, mutasi kas, dan hutang memakai ini karena
   * finance perlu MELIHAT kewajiban klien dan mengunduhnya, sementara menulis
   * tetap milik akunting (ditegakkan requireAkunting di API, D45).
   *
   * Konsekuensi yang perlu disadari: finance melihat /pembelian dan /hutang
   * tapi TIDAK /jurnal maupun /buku-besar — keduanya staffOnly. Itu koheren
   * (finance melihat kewajiban, bukan pembukuannya), tapi ia keputusan, bukan
   * kebetulan.
   */
  internalOnly?: boolean
}

/**
 * URUTAN DI SINI ADALAH URUTAN TAMPIL. Jangan menyusun ulang tanpa memperbarui
 * test urutan di nav-items.test.ts — itu memang gunanya test tersebut.
 *
 * Kontrak duduk tepat SESUDAH Laporan: keduanya "dokumen milik klien ini", dan
 * menaruhnya setelah COA Mapping membuat posisinya berbeda-beda antar role
 * (untuk finance, COA Mapping tersaring habis sehingga Kontrak seolah pindah).
 *
 * Jurnal duduk tepat SESUDAH Upload: keduanya pintu masuk DATA, dan keduanya
 * staffOnly sehingga jaraknya tidak pernah berubah antar role — beda dengan
 * menaruhnya di dekat Laporan, yang akan membuatnya melompat untuk finance.
 *
 * Buku Besar duduk tepat SESUDAH Jurnal, dengan alasan yang sama sekali bukan
 * kosmetik: isinya jurnal yang SAMA, dibaca per akun. Menaruhnya di dekat
 * Laporan akan menyarankan ia laporan periodik hasil olahan, padahal ia
 * pembacaan langsung buku — dan orang yang mencarinya akan mencarinya di
 * sebelah Jurnal.
 *
 * Pembelian menyusul sesudah Buku Besar: ia pintu masuk DATA seperti Upload
 * dan Jurnal, dan menaruhnya di sana menjaga ketiga pintu itu berdampingan.
 * Ia yang pertama memakai sumbu internalOnly, jadi jaraknya ke item sebelumnya
 * BERUBAH untuk finance — yang mengukur posisi item wajib mengukur ulang.
 */
export const NAV_ITEMS: readonly NavItem[] = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'analytics', label: 'Analytics' },
  { id: 'upload', label: 'Upload', staffOnly: true },
  { id: 'jurnal', label: 'Jurnal', staffOnly: true },
  { id: 'buku-besar', label: 'Buku Besar', staffOnly: true },
  { id: 'pembelian', label: 'Pembelian', internalOnly: true },
  { id: 'mutasi-kas', label: 'Mutasi Kas', internalOnly: true },
  { id: 'laporan', label: 'Laporan' },
  { id: 'kontrak', label: 'Kontrak', contractOnly: true },
  { id: 'coa-mapping', label: 'COA Mapping', staffOnly: true },
  { id: 'operational', label: 'Operational', comingSoon: true, staffOnly: true },
  { id: 'settings', label: 'Settings' },
]

/**
 * Item yang tampil untuk `role`.
 *
 * `sessionLoading` mengembalikan SELURUH daftar dengan sengaja: selama
 * `useSession()` masih 'loading', role belum ter-resolve (client-context
 * default-nya 'user'), dan menyembunyikan menu staf di jendela itu membuat
 * Upload/COA Mapping "hilang" sekejap tiap halaman dibuka lalu muncul lagi.
 *
 * ⚠️ KONSEKUENSINYA: SETIAP role sesaat melihat item staf. Hari ini itu cuma
 * kedipan, tapi begitu ada label nav yang isinya sendiri bersifat rahasia, ini
 * jadi kebocoran informasi. Tercatat di ROADMAP sebagai bahaya yang diketahui.
 *
 * Efek sampingnya yang lebih langsung: daftar saat loading BERBEDA panjangnya
 * dari daftar setelah settle, sehingga indeks item aktif bergeser — apa pun
 * yang mengukur posisi item WAJIB mengukur ulang saat daftarnya berubah.
 */
export function navItemsForRole(
  role: Role | null | undefined,
  { sessionLoading = false }: { sessionLoading?: boolean } = {}
): NavItem[] {
  if (sessionLoading) return [...NAV_ITEMS]
  return NAV_ITEMS.filter(item => {
    // contractOnly diperiksa DULU: sumbunya beda dari staffOnly, dan item yang
    // suatu saat punya keduanya harus tunduk pada yang lebih spesifik.
    if (item.contractOnly) return canViewContracts(role)
    // staffOnly SEBELUM internalOnly: canDoAccounting ⊂ isInternal, jadi item
    // yang (keliru) bertanda keduanya harus tunduk pada yang lebih KETAT.
    // Urutan terbalik akan diam-diam membuka surface akunting untuk finance.
    if (item.staffOnly) return canDoAccounting(role)
    if (item.internalOnly) return isInternal(role)
    return true
  })
}

/**
 * Kunci identitas daftar yang sedang dirender — dipakai sebagai dependensi efek
 * pengukur kapsul. Berubah tepat ketika himpunan/urutan item berubah, jadi
 * pengukuran offsetTop tidak pernah tertinggal di susunan yang sudah usang.
 */
export function navKey(items: readonly NavItem[]): string {
  return items.map(i => i.id).join('|')
}
