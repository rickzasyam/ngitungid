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
 * Baca daftar id dari localStorage. TIDAK PERNAH MELEMPAR.
 *
 * Isi localStorage adalah input tak terpercaya: bisa ditulis versi app yang
 * lebih lama, disunting tangan lewat devtools, atau terpotong. Satu
 * `JSON.parse` telanjang di jalur ini akan melempar saat render provider dan
 * mematikan seluruh app — jauh lebih mahal daripada kehilangan daftar pintasan.
 * Setiap bentuk yang tidak dikenali diperlakukan sama: daftar kosong.
 *
 * Entri non-string ikut dibuang (mis. `[1,2]` dari versi lama), duplikat
 * digabung, dan hasilnya dipotong `limit` supaya storage yang membengkak tidak
 * bisa membanjiri modal.
 */
export function parseRecent(raw: string | null, limit: number = RECENT_LIMIT): string[] {
  if (!raw) return []
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return []
  }
  if (!Array.isArray(parsed)) return []
  const bersih = parsed.filter((v): v is string => typeof v === 'string' && v.trim() !== '')
  return [...new Set(bersih)].slice(0, limit)
}

/**
 * Buang id yang kliennya sudah tidak ada — DIPANGGIL SAAT MEMBACA, bukan saat
 * merender. Klien yang dihapus tidak boleh menyisakan baris mati di modal, dan
 * membuangnya lebih awal juga mencegahnya memakan slot pintasan selamanya.
 */
export function pruneRecent(
  ids: readonly string[],
  clients: readonly { id: string }[]
): string[] {
  const known = new Set(clients.map(c => c.id))
  return ids.filter(id => known.has(id))
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
