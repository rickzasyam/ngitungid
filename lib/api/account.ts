import type { Role } from '@/lib/roles'

// Validasi clientId untuk pembuatan akun via Kelola Akun (POST /api/users).
// Dipisah dari route handler supaya asimetri per-role bisa diuji tanpa DB/
// NextAuth (pola sama dgn lib pemurni lain). Cek EXIST-nya DIINJEKSI lewat
// `clientExists` — handler menyediakannya via query DB; di sini cukup memutuskan
// kapan clientId wajib, kapan dipaksa null, dan kapan exist perlu dicek.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type ClientIdResolution =
  | { ok: true; clientId: string | null }
  | { ok: false; error: string }

/**
 * Tentukan clientId yang HARUS disimpan untuk akun baru — ASIMETRIS per role:
 *   - 'user' (klien): clientId WAJIB, UUID valid, & HARUS exist (via
 *     `clientExists`) → diteruskan. Kalau tidak → `{ ok:false, error }` (handler
 *     balas 400). Jangan percaya id dari client mentah — exist dicek dulu.
 *   - 'akunting' | 'owner' (staf): clientId DIPAKSA null. `rawClientId`
 *     DIABAIKAN total (`clientExists` tidak pernah dipanggil) — tidak ada cara
 *     akun staf ke-assign ke satu klien lewat request manual.
 */
export async function resolveNewAccountClientId(
  role: Role,
  rawClientId: unknown,
  clientExists: (id: string) => Promise<boolean>
): Promise<ClientIdResolution> {
  if (role !== 'user') return { ok: true, clientId: null }

  const id = typeof rawClientId === 'string' ? rawClientId.trim() : ''
  if (!UUID_RE.test(id)) {
    return { ok: false, error: 'Akun klien (User) wajib dipilihkan satu klien.' }
  }
  if (!(await clientExists(id))) {
    return { ok: false, error: 'Klien yang dipilih tidak ditemukan.' }
  }
  return { ok: true, clientId: id }
}
