import { NextResponse } from 'next/server'
import { requireInternal } from '@/lib/api/guards'
import { canAccessClientData } from '@/lib/roles'
import { loadAccountingSettings } from '@/lib/api/accounting-settings'

export const runtime = 'nodejs'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// GET /api/clients/[id]/accounting-settings — setelan pembukuan per klien.
//
// ══ KETIADAAN BARIS DIJAWAB DENGAN NILAI BAWAAN, BUKAN 404 ════════════════
// Barisnya dibuat lazily, jadi mayoritas klien memang belum punya. Menjawab
// 404 akan memaksa setiap pemanggil menangani "belum disetel" sebagai kegagalan
// — dan pemanggil yang lupa akan menyimpulkan setelannya menyala. Respons
// selalu berbentuk sama; yang berbeda cuma isinya.
//
// `postingBisaDiedit` BAWAANNYA FALSE (D42): posting permanen kecuali klien ini
// memang pernah disetel sebaliknya.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await requireInternal()
  if ('error' in g) return g.error

  const { id } = await params
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: 'ID klien tidak valid.' }, { status: 400 })
  }
  if (!canAccessClientData(g.user.role, g.user.clientId, id)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const row = await loadAccountingSettings(id)
  return NextResponse.json({
    akunPpnMasukanId: row?.akunPpnMasukanId ?? null,
    postingBisaDiedit: row?.postingBisaDiedit === true,
    /** false = belum pernah disetel. Dipakai UI untuk menjelaskan bawaannya. */
    tersimpan: row !== null,
  })
}
