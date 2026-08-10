// Kebijakan TOMBOL di halaman Kontrak, per role. Murni (tanpa I/O, tanpa React).
//
// Ada sebagai modul terpisah karena proyek ini tidak punya setup
// component-testing — jadi kebijakan UI diuji sebagai PREDIKAT, bukan lewat
// render. Preseden: kebab Admin Overview (2026-08-06), yang diuji dengan cara
// yang sama.
//
// Yang dijaga di sini: role 'user' (klien) BOLEH membuka /kontrak, dan itu
// membuatnya satu-satunya halaman tempat klien melihat tombol-tombol tulis
// kalau tidak ada yang menahannya. API sudah menolak lewat requireCommercial,
// tapi tombol yang bisa diklik lalu gagal 403 adalah bug UI, bukan keamanan
// yang bekerja.

import { canManageCommercial, canViewContracts, type Role } from '@/lib/roles'

export interface ContractActions {
  /** Boleh membuka halamannya sama sekali. */
  lihat: boolean
  /** Preview dokumen PDF — hak baca, sama luasnya dengan `lihat`. */
  preview: boolean
  buat: boolean
  ganti: boolean
  hapus: boolean
  /** Tombol "+ Layanan Baru" di dalam form — menulis ke katalog GLOBAL. */
  layananBaru: boolean
}

/**
 * Dua sumbu, bukan satu tangga:
 *   canViewContracts   → owner + finance + klien (akunting DITOLAK)
 *   canManageCommercial → owner + finance        (akunting & klien DITOLAK)
 *
 * Setiap aksi tulis di-AND dengan `lihat`. Itu bukan hiasan: kalau suatu saat
 * sebuah role masuk canManageCommercial tapi tidak canViewContracts, ia akan
 * mendapat tombol di halaman yang tidak boleh ia buka — kombinasi yang tidak
 * akan pernah terlihat sampai role itu benar-benar dibuat.
 */
/**
 * Boleh membuka form "Kontrak Baru" SEKARANG?
 *
 * Dua syarat, dan yang kedua bukan soal role: kontrak selalu dibuat untuk klien
 * AKTIF (switcher sidebar), jadi tanpa klien aktif tidak ada `clientId` yang
 * bisa dikirim sama sekali. Form yang terbuka tapi pasti gagal saat Simpan
 * adalah cara paling mahal untuk menyampaikan "pilih klien dulu" — pengguna
 * baru tahu setelah mengisi delapan field.
 *
 * Halaman ini memang sudah memantulkan pengguna tanpa klien aktif lewat
 * useRequireClient, jadi hari ini syarat kedua jarang tersentuh. Ia tetap
 * ditulis: gerbangnya milik tombol, bukan milik kebetulan halaman lain.
 */
export function canCreateContract(
  role: Role | null | undefined,
  activeClientId: string | null | undefined
): boolean {
  return contractActions(role).buat && !!activeClientId
}

export function contractActions(role: Role | null | undefined): ContractActions {
  const lihat = canViewContracts(role)
  const kelola = lihat && canManageCommercial(role)
  return {
    lihat,
    preview: lihat,
    buat: kelola,
    ganti: kelola,
    hapus: kelola,
    layananBaru: kelola,
  }
}
