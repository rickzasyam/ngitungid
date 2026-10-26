import { NextResponse } from 'next/server'
import { requireInternal } from '@/lib/api/guards'
import { canAccessClientData } from '@/lib/roles'
import { isValidYmd } from '@/lib/contracts'
import { hariIniJakarta } from '@/lib/ymd'

// Penjaga bersama keempat route /api/hutang.
//
// ══ SELURUHNYA BACA-SAJA, requireInternal (D45) ══════════════════════════
// Monitoring hutang tidak punya jalur tulis sama sekali: angkanya turunan, dan
// yang mengubahnya adalah invoice (M4) dan alokasi (N4). Finance MEMBACA dan
// mengunduh; tidak ada yang perlu digerbangi requireAkunting di sini karena
// tidak ada yang bisa ditulis.
//
// ══ `asOf` PUNYA BAWAAN, DAN BAWAANNYA HARI INI ══════════════════════════
// Umur hutang selalu dilihat dari suatu tanggal. Membiarkannya wajib berarti
// setiap pemanggil menyusun tanggal hari ini sendiri — dan pemanggil yang
// memakai `new Date().toISOString()` akan meleset satu hari di zona WIB untuk
// sebagian jam (P2).

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type HutangGuard =
  | { error: NextResponse }
  | { clientId: string; asOf: string }

export async function guardHutang(req: Request): Promise<HutangGuard> {
  const g = await requireInternal()
  // `error` di tipe Guarded bersifat opsional, jadi `'error' in g` saja belum
  // menyempitkannya ke NextResponse di mata TypeScript.
  if (g.error) return { error: g.error }

  const url = new URL(req.url)
  const clientId = url.searchParams.get('clientId') ?? ''
  if (!UUID_RE.test(clientId)) {
    return { error: NextResponse.json({ error: 'clientId tidak valid.' }, { status: 400 }) }
  }
  if (!canAccessClientData(g.user.role, g.user.clientId, clientId)) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }

  const asOfParam = url.searchParams.get('asOf')
  if (asOfParam !== null && !isValidYmd(asOfParam)) {
    return {
      error: NextResponse.json({ error: 'asOf tidak valid (format YYYY-MM-DD).' }, { status: 400 }),
    }
  }

  return { clientId, asOf: asOfParam ?? hariIniJakarta() }
}

export { UUID_RE }
