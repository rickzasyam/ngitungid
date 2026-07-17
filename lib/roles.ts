// Satu sumber kebenaran untuk semantik role. Murni (tanpa I/O) supaya dipakai
// bareng oleh guard API (server) dan komponen UI (client) — tanpa union
// 'owner' | 'akunting' yang disalin-tempel ke belasan tempat dan gampang
// menyimpang saat ada role baru.
//
// Harus sinkron dengan userRoleEnum (lib/db/schema.ts) & types/next-auth.d.ts.

export type Role = 'owner' | 'akunting' | 'user'

/**
 * Staf internal NgitungID: boleh upload, review, mapping, kelola klien, dan
 * melihat SEMUA klien. Owner sengaja termasuk — ia mewarisi seluruh kemampuan
 * akunting, bukan role terpisah yang lebih sempit.
 */
export function isStaff(role: Role | null | undefined): boolean {
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
}

/** Role yang boleh dibuat lewat UI "Buat Akun" oleh Owner. */
export const CREATABLE_ROLES: Role[] = ['akunting', 'owner']
