import { NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { contracts } from '@/lib/db/schema'
import { requireUser } from '@/lib/api/guards'
import { canAccessClientData } from '@/lib/roles'

export const runtime = 'nodejs'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// GET /api/contracts/[id]/dokumen — alirkan PDF kontrak.
//
// SALINAN POLA GET /api/reports/[id]/pdf, termasuk urutannya: baris diambil
// DULU, pemeriksaan klien menyusul, supaya scoping memakai clientId milik
// KONTRAK — bukan id yang datang dari request. Membalik urutan itu berarti
// mempercayai penyerang untuk menyebutkan kliennya sendiri.
//
// requireUser (bukan requireInternal): role 'user' boleh membuka dokumen
// kontrak KLIEN-NYA SENDIRI, dibatasi canAccessClientData di bawah. Ini
// satu-satunya endpoint kontrak yang terbuka untuk klien — daftar & tulis tetap
// internal/komersial.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await requireUser()
  if ('error' in g) return g.error

  const { id } = await params
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: 'ID kontrak tidak valid.' }, { status: 400 })
  }

  const [row] = await db
    .select({
      clientId: contracts.clientId,
      dokumen: contracts.dokumen,
      nama: contracts.namaDokumen,
    })
    .from(contracts)
    .where(eq(contracts.id, id))
    .limit(1)

  if (!row) return NextResponse.json({ error: 'Kontrak tidak ditemukan.' }, { status: 404 })
  // Scoping ANTAR-klien, memakai clientId dari BARIS yang sudah diambil.
  if (!canAccessClientData(g.user.role, g.user.clientId, row.clientId)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const buf = Buffer.isBuffer(row.dokumen) ? row.dokumen : Buffer.from(row.dokumen as Uint8Array)
  const safeName = (row.nama || 'kontrak.pdf').replace(/["\\\r\n]/g, '_')

  return new Response(new Uint8Array(buf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${safeName}"`,
      'Content-Length': String(buf.length),
      'Cache-Control': 'private, max-age=60',
    },
  })
}
