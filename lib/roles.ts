// Satu sumber kebenaran untuk semantik role. Murni (tanpa I/O) supaya dipakai
// bareng oleh guard API (server) dan komponen UI (client) — tanpa union
// 'owner' | 'akunting' yang disalin-tempel ke belasan tempat dan gampang
// menyimpang saat ada role baru.
//
// Harus sinkron dengan userRoleEnum (lib/db/schema.ts) & types/next-auth.d.ts.

export type Role = 'owner' | 'akunting' | 'user' | 'finance'

/**
 * Orang DALAM NgitungID (lawan kata: klien). Boleh berpindah klien, melihat
 * kartu workspace & indikator progres, dan dipantulkan ke Admin Overview saat
 * belum memilih klien.
 *
 * DIPISAH dari canDoAccounting() dengan sengaja. Dulu keduanya satu fungsi
 * bernama isStaff(), yang diam-diam berarti DUA hal sekaligus: "pegawai
 * internal" DAN "boleh mengerjakan pekerjaan akunting". Selama hanya ada
 * owner/akunting/user keduanya kebetulan sama, jadi tidak ada yang terasa.
 * Begitu ada role internal yang TIDAK mengerjakan akunting, satu fungsi itu
 * akan memberinya Upload/Extraction Review/COA Mapping tanpa ada yang
 * memutuskan begitu. Pisahkan dulu, baru tambah role.
 */
export function isInternal(role: Role | null | undefined): boolean {
  return role === 'owner' || role === 'akunting' || role === 'finance'
}

/**
 * Boleh mengerjakan pekerjaan AKUNTING: upload, extraction review, COA mapping,
 * mengganti/menghapus laporan, dan mengubah Master COA.
 *
 * Subset dari isInternal(): setiap yang boleh akunting pasti orang dalam, tapi
 * tidak sebaliknya. Kalau ragu memilih di antara keduanya, tanyakan "apakah
 * yang digerbangi ini MENGUBAH data akuntansi klien?" — kalau ya, ini
 * fungsinya.
 */
export function canDoAccounting(role: Role | null | undefined): boolean {
  return role === 'owner' || role === 'akunting'
}

/**
 * Kemampuan tingkat tertinggi yang TIDAK dimiliki akunting:
 * membuat akun baru & assign akunting ke klien.
 */
export function isOwner(role: Role | null | undefined): boolean {
  return role === 'owner'
}

/** Label untuk ditampilkan ke pengguna (bahasa produk, bukan nama teknis). */
export const ROLE_LABEL: Record<Role, string> = {
  owner: 'Owner',
  akunting: 'Akunting',
  user: 'Klien',
  finance: 'Finance',
}

/**
 * Role yang boleh dibuat lewat UI "Buat Akun" (Kelola Akun) oleh Owner.
 * 'user' (klien) TERMASUK, tapi validasinya berbeda: akun user WAJIB terikat
 * satu `clientId` yang valid, sedangkan staf (akunting/owner) justru DIPAKSA
 * `clientId` null — lihat `resolveNewAccountClientId` di lib/api/account.ts.
 * Urutan array = urutan tampil di dropdown Role.
 */
export const CREATABLE_ROLES: Role[] = ['akunting', 'owner', 'user', 'finance']

/**
 * Boleh mengelola data KOMERSIAL: master Layanan, dan (Phase 3) Kontrak.
 *
 * owner + finance, TANPA akunting. Bukan turunan dari predikat lain: akunting
 * mengerjakan pembukuan klien, bukan menentukan jasa apa yang dijual dan dengan
 * harga berapa. Memakai canDoAccounting di sini akan memberi akunting kendali
 * atas katalog komersial, dan memakai isInternal akan memberikannya juga.
 *
 * Dipisah sebagai PREDIKAT, bukan cek role inline di route, supaya kalau
 * kelak ada role komersial lain cukup satu tempat yang berubah.
 */
export function canManageCommercial(role: Role | null | undefined): boolean {
  return role === 'owner' || role === 'finance'
}

/**
 * Role yang boleh MELIHAT halaman Kontrak (/kontrak).
 *
 * ALLOWLIST, dan bentuknya tidak sama dengan predikat mana pun di atas:
 * owner + finance + **user**, dengan **akunting satu-satunya yang ditolak**.
 * Itu bukan kekeliruan urutan — ini predikat pertama yang memberi klien sesuatu
 * yang tidak dimiliki akunting:
 *   - akunting membukukan pekerjaan klien; kontrak (apa yang dijual, berapa
 *     harganya, kapan ditagih) bukan bagian dari pembukuan itu.
 *   - klien BOLEH melihat kontraknya sendiri — itu dokumen miliknya. Batas
 *     antar-kliennya dijaga canAccessClientData di API, bukan di sini.
 *
 * Karena itu ia tidak bisa disusun dari canManageCommercial (kehilangan klien)
 * maupun isInternal (kebalikannya: memasukkan akunting, membuang klien).
 *
 * **Role baru WAJIB ditambahkan dengan sadar** — daftar ini menolak secara
 * default, sama seperti ALL_CLIENT_ACCESS_ROLES di bawah dan karena alasan yang
 * sama.
 */
export const CONTRACT_VIEW_ROLES: readonly Role[] = ['owner', 'finance', 'user']

export function canViewContracts(role: Role | null | undefined): boolean {
  return !!role && CONTRACT_VIEW_ROLES.includes(role)
}

/**
 * Role yang boleh membaca data KLIEN MANA PUN.
 *
 * ALLOWLIST, bukan blocklist — dan itu inti perubahannya. Versi lama berbunyi
 * `if (role !== 'user') return true`, yang berarti fungsi ini GAGAL TERBUKA:
 * setiap role baru otomatis mendapat akses ke seluruh data setiap klien, tanpa
 * satu baris pun diubah dan tanpa satu test pun merah. Untuk fungsi yang
 * menjaga batas antar-klien, default-nya harus menolak.
 *
 * **Role baru WAJIB ditambahkan di sini dengan sadar.** Kalau sebuah role tidak
 * ada di daftar ini, ia hanya bisa melihat kliennya sendiri — itu default yang
 * benar untuk kesalahan.
 */
// finance ditambahkan dengan sadar: ia MEMBUAT klien, jadi harus melihat
// semuanya. Bukan warisan otomatis — daftar ini allowlist.
export const ALL_CLIENT_ACCESS_ROLES: readonly Role[] = ['owner', 'akunting', 'finance']

/**
 * Boleh-kah pengguna dengan `role` ini melihat DATA milik `targetClientId`?
 * ASIMETRIS by design:
 *   - role di ALL_CLIENT_ACCESS_ROLES: klien mana pun.
 *   - selain itu (termasuk role tak dikenal): HANYA klien miliknya sendiri
 *     (`ownClientId`), dan kalau `ownClientId` kosong → ditolak sama sekali.
 * Dipakai untuk scoping per-request di route API yang `requireUser` (mis. GET
 * reports/[id]/pdf, clients/[id]/coa) supaya user tidak bisa membaca data klien
 * lain hanya dengan mengutak-atik id di request. Penjaga ROLE-nya sendiri tetap
 * di requireUser/requireAkunting — helper ini khusus batas ANTAR-klien.
 */
export function canAccessClientData(
  role: Role | null | undefined,
  ownClientId: string | null | undefined,
  targetClientId: string
): boolean {
  if (role && ALL_CLIENT_ACCESS_ROLES.includes(role)) return true
  return !!ownClientId && ownClientId === targetClientId
}
