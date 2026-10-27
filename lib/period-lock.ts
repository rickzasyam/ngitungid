// Kunci periode — aturan MURNI (tanpa I/O). Master plan §7.B, D17 & D26
// (disetujui Ricko 2026-10-26).
//
// ══ SATU ANGKA YANG BERLAKU: TERKUNCI SAMPAI ═════════════════════════════
// Setiap tindakan mengunci menambah satu baris `period_locks`; kunci yang
// berlaku adalah `terkunci_sampai` TERBESAR. Tanggal ≤ angka itu terkunci untuk
// SEMUA jalur tulis jurnal — termasuk draf, karena draf yang lahir di periode
// yang sudah diserahkan ke klien akan ikut terposting suatu hari. Membuka =
// menghapus baris terbaru, sehingga kunci sebelumnya berlaku lagi.
//
// Tanggal = string YYYY-MM-DD ujung ke ujung (P2): format itu terurut secara
// leksikografis, jadi perbandingan string = perbandingan kalender — tanpa
// `new Date(string)` dan tanpa zona waktu.

import { isValidYmd } from '@/lib/contracts'
import { canDoAccounting, isOwner, type Role } from '@/lib/roles'
import { fmtTanggal } from '@/lib/ymd'

export type PeriodLockLike = { terkunciSampai: string }

/** Minimal panjang alasan membuka kunci (D17: buka terbatas, dengan catatan). */
export const ALASAN_BUKA_MIN = 10

/** Kunci yang berlaku — `terkunciSampai` terbesar — atau null bila belum pernah dikunci. */
export function latestLock<T extends PeriodLockLike>(locks: readonly T[]): T | null {
  let terbaru: T | null = null
  for (const l of locks) {
    if (terbaru === null || l.terkunciSampai > terbaru.terkunciSampai) terbaru = l
  }
  return terbaru
}

/** Apakah `tanggal` berada di periode terkunci? Batasnya INKLUSIF. */
export function isDateLocked(tanggal: string, locks: readonly PeriodLockLike[]): boolean {
  const kunci = latestLock(locks)
  return kunci !== null && tanggal <= kunci.terkunciSampai
}

export type LockCheck = { ok: true; value: { terkunciSampai: string } } | { ok: false; error: string }

/**
 * Validasi tindakan MENGUNCI.
 *
 * Harus MAJU dari kunci yang berlaku — mundur berarti membuka sebagian, dan
 * membuka punya jalur sendiri (owner + alasan). Sama dengan kunci yang berlaku
 * juga ditolak: tidak ada yang berubah, tapi riwayatnya akan mencatat tindakan.
 * Tidak boleh melewati `hariIni`: periode yang belum berakhir belum bisa
 * diserahkan, dan kunci di masa depan akan menolak pencatatan transaksi hari ini.
 */
export function validateLockInput(
  input: { terkunciSampai?: unknown },
  opts: { latest: PeriodLockLike | null; hariIni: string }
): LockCheck {
  const t = input.terkunciSampai
  if (!isValidYmd(t)) return { ok: false, error: 'Tanggal kunci tidak valid (format YYYY-MM-DD).' }
  if (t > opts.hariIni) return { ok: false, error: 'Tanggal kunci tidak boleh melewati hari ini.' }
  if (opts.latest && t <= opts.latest.terkunciSampai) {
    return {
      ok: false,
      error: `Periode sudah terkunci sampai ${fmtTanggal(opts.latest.terkunciSampai)} — tanggal kunci baru harus sesudahnya.`,
    }
  }
  return { ok: true, value: { terkunciSampai: t } }
}

export type UnlockCheck = { ok: true; value: string } | { ok: false; error: string }

/** Validasi alasan MEMBUKA kunci — wajib, minimal ALASAN_BUKA_MIN karakter. */
export function validateUnlockReason(alasan: unknown): UnlockCheck {
  const a = typeof alasan === 'string' ? alasan.trim() : ''
  if (a.length < ALASAN_BUKA_MIN) {
    return { ok: false, error: `Alasan membuka kunci wajib diisi, minimal ${ALASAN_BUKA_MIN} karakter.` }
  }
  return { ok: true, value: a }
}

/** Mengunci = akunting atau owner (D17). */
export function canLock(role: Role | null | undefined): boolean {
  return canDoAccounting(role)
}

/** Membuka = owner saja (D17) — akunting yang mengunci tidak bisa membukanya sendiri. */
export function canUnlock(role: Role | null | undefined): boolean {
  return isOwner(role)
}
