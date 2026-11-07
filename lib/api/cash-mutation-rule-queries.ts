import { NextResponse } from 'next/server'
import { loadCashAccount, assertAccountBelongsToClient } from '@/lib/api/cash-mutation-queries'
import type { AturanValue } from '@/lib/aturan-mutasi'

// Penjaga akun untuk aturan mutasi (D57) — dipakai POST & PATCH. Hidup di sini
// karena Next menolak export non-handler di berkas route.

/**
 * Akun lawan: akun MANA PUN milik klien (sama dengan akun lawan mutasi).
 * Akun kas (bila diisi): harus akun KAS milik klien — aturan yang dibatasi ke
 * akun non-kas tidak akan pernah berlaku di grid mana pun.
 */
export async function assertAkunAturanMilikKlien(
  v: Pick<AturanValue, 'akunLawanId' | 'akunKasId'>,
  clientId: string
): Promise<NextResponse | null> {
  const lawan = await assertAccountBelongsToClient(v.akunLawanId, clientId)
  if (lawan) return lawan
  if (v.akunKasId !== null) {
    const kas = await loadCashAccount(clientId, v.akunKasId)
    if (!kas) {
      return NextResponse.json({ error: 'Akun kas aturan bukan akun kas milik klien ini.' }, { status: 400 })
    }
  }
  return null
}
