// Kunci periode — sisi DB. Aturannya hidup MURNI di lib/period-lock.ts (K1);
// berkas ini hanya membaca `period_locks` dan menyusun penolakannya.
//
// ══ SATU PINTU UNTUK SEMUA JALUR TULIS ══════════════════════════════════
// Sejak Fase 2 bentuk `periodLockChecker` sudah final (satu query per klien,
// hasilnya dipakai untuk beberapa tanggal) dan selalu menjawab "tidak terkunci".
// K2 (2026-10-26) mengisinya dengan query sungguhan — pemanggilnya tidak
// berubah. Route yang menulis jurnal ATAU mutasi kas memanggil
// `tolakBilaPeriodeTerkunci` dengan SEMUA tanggal yang disentuhnya: tanggal
// lama dan baru pada perubahan (memindahkan baris keluar dari periode terkunci
// juga mengubah periode itu), tanggal dokumen pada penghapusan.
//
// canPost() sengaja tetap MURNI dan menerima `isLocked` sebagai parameter.

import { NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { periodLocks } from '@/lib/db/schema'
import { isDateLocked, latestLock } from '@/lib/period-lock'

/** Seluruh baris kunci satu klien — kunci yang berlaku = `latestLock`. */
export async function loadPeriodLocks(clientId: string) {
  return db
    .select({
      id: periodLocks.id,
      terkunciSampai: periodLocks.terkunciSampai,
      dikunciOleh: periodLocks.dikunciOleh,
      createdAt: periodLocks.createdAt,
    })
    .from(periodLocks)
    .where(eq(periodLocks.clientId, clientId))
}

/** Pemeriksa "tanggal ini di dalam periode terkunci?" untuk satu klien. */
export async function periodLockChecker(clientId: string): Promise<(tanggal: string) => boolean> {
  const locks = await loadPeriodLocks(clientId)
  return tanggal => isDateLocked(tanggal, locks)
}

/**
 * 409 `{ error, lockedUntil }` bila SALAH SATU tanggal berada di periode
 * terkunci; null bila semuanya terbuka. Tanggal kosong dilewati (mis. dokumen
 * lama tanpa tanggal tidak mungkin ada, tapi pemanggil tidak perlu menyaringnya).
 */
export async function tolakBilaPeriodeTerkunci(
  clientId: string,
  tanggal: readonly (string | null | undefined)[]
): Promise<NextResponse | null> {
  const locks = await loadPeriodLocks(clientId)
  const kunci = latestLock(locks)
  if (!kunci) return null
  const kena = tanggal.find((t): t is string => typeof t === 'string' && isDateLocked(t, locks))
  if (!kena) return null
  return NextResponse.json(
    {
      error: `Periode sudah dikunci sampai ${kunci.terkunciSampai} — tanggal ${kena} tidak bisa diubah.`,
      lockedUntil: kunci.terkunciSampai,
      details: [
        'Kunci periode mengalahkan setelan "posting bisa diedit".',
        'Owner bisa membuka kunci di Settings › Pembukuan, dengan alasan yang tercatat di riwayat.',
      ],
    },
    { status: 409 }
  )
}
