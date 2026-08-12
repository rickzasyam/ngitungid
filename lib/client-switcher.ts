// Aturan pemilih klien (modal switcher). MURNI — tanpa I/O, tanpa React.
//
// Dipisah dari komponennya karena proyek ini tidak punya setup
// component-testing: pencarian, daftar "terakhir dibuka", dan kapan seksi itu
// muncul semuanya bisa salah tanpa ketahuan kalau hanya hidup di dalam JSX.

import type { ClientInfo } from '@/lib/client-context'

/** Maksimal entri "Terakhir Dibuka". */
export const RECENT_LIMIT = 5

/**
 * Daftar panjang barulah yang membuat pintasan berguna. Di bawah ambang ini,
 * seksi "Terakhir Dibuka" hanya mengulang daftar yang sudah kelihatan penuh.
 */
export const RECENT_MIN_CLIENTS = 6

/**
 * Cocokkan nama klien: SUBSTRING, case-insensitive — "ras" menemukan "Rasyuka".
 *
 * Sengaja hanya `name`, bukan `type`: mengetik "jasa" saat mencari sebuah nama
 * akan memunculkan setiap klien berjenis Jasa dan menenggelamkan yang dicari.
 * Query kosong / whitespace mengembalikan semuanya apa adanya.
 */
export function filterClients(clients: readonly ClientInfo[], query: string): ClientInfo[] {
  const q = query.trim().toLowerCase()
  if (q === '') return [...clients]
  return clients.filter(c => c.name.toLowerCase().includes(q))
}

/**
 * Catat klien yang baru dibuka: paling depan, tanpa duplikat, dipotong `limit`.
 *
 * Mengembalikan array BARU — tidak pernah memutasi yang lama, supaya aman
 * dipakai langsung sebagai state React.
 */
export function pushRecent(
  ids: readonly string[],
  id: string,
  limit: number = RECENT_LIMIT
): string[] {
  return [id, ...ids.filter(x => x !== id)].slice(0, limit)
}

/**
 * Ubah id "terakhir dibuka" jadi klien yang benar-benar masih ada.
 *
 * `excludeId` membuang klien yang SEDANG aktif: ia selalu yang paling baru
 * dibuka, jadi menampilkannya di pintasan membuang satu slot untuk satu-satunya
 * klien yang pasti tidak sedang dicari orang yang membuka modal ini.
 *
 * Id yang kliennya sudah tidak ada (terhapus) dilewati diam-diam — daftar ini
 * kenyamanan, bukan riwayat yang harus akurat.
 */
export function recentClients(
  clients: readonly ClientInfo[],
  recentIds: readonly string[],
  { excludeId, limit = RECENT_LIMIT }: { excludeId?: string | null; limit?: number } = {}
): ClientInfo[] {
  const byId = new Map(clients.map(c => [c.id, c]))
  const out: ClientInfo[] = []
  for (const id of recentIds) {
    if (id === excludeId) continue
    const c = byId.get(id)
    if (c) out.push(c)
    if (out.length >= limit) break
  }
  return out
}

/**
 * Tampilkan seksi "Terakhir Dibuka"?
 *
 * Tidak saat sedang mencari (mengetik berarti sudah tahu yang dicari, dan
 * pintasan cuma menggeser hasilnya ke bawah), dan tidak untuk daftar pendek.
 */
export function shouldShowRecents(
  totalClients: number,
  recentsCount: number,
  query: string
): boolean {
  return query.trim() === '' && recentsCount > 0 && totalClients >= RECENT_MIN_CLIENTS
}
