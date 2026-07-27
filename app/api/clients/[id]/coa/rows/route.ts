import { NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { clients, masterCoa } from '@/lib/db/schema'
import { requireAkunting } from '@/lib/api/guards'
import { parseCoaRowInput } from '@/lib/coa/row-input'
import { dbWriteErrorResponse, isUniqueViolation } from '@/lib/api/db-errors'

export const runtime = 'nodejs'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// POST /api/clients/[id]/coa/rows — TAMBAH SATU baris Master COA (JSON).
//
// Sengaja route tersendiri, bukan cabang content-type di dalam POST /coa:
// POST /coa adalah replace-all yang MENGHAPUS SELURUH Master COA klien. Kalau
// "tambah satu akun" dan "ganti semua akun" berbagi satu URL dan cuma dibedakan
// header Content-Type, satu header yang salah kirim mengubah operasi aditif jadi
// destruktif. Path terpisah membuat kesalahan itu mustahil, dan menjamin jalur
// bulk Excel tidak berubah perilakunya sama sekali.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await requireAkunting()
  if ('error' in g) return g.error

  const { id } = await params
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: 'ID klien tidak valid.' }, { status: 400 })
  }

  const [client] = await db.select({ id: clients.id }).from(clients).where(eq(clients.id, id)).limit(1)
  if (!client) {
    return NextResponse.json({ error: 'Klien tidak ditemukan.' }, { status: 404 })
  }

  const body = await req.json().catch(() => null)
  const parsed = parseCoaRowInput(body)
  if (!parsed.ok) {
    return NextResponse.json(
      { error: 'Data akun belum lengkap.', details: parsed.errors },
      { status: 400 }
    )
  }

  try {
    const [row] = await db
      .insert(masterCoa)
      .values({ clientId: id, ...parsed.value })
      .returning({ id: masterCoa.id, kode: masterCoa.kode, nama: masterCoa.nama })
    return NextResponse.json({ account: row }, { status: 201 })
  } catch (e) {
    // unique(client_id, kode) — pesan yang menyebut kodenya, bukan 500 mentah.
    if (isUniqueViolation(e)) {
      return NextResponse.json(
        {
          error: `Kode "${parsed.value.kode}" sudah dipakai akun lain di klien ini.`,
          details: ['Kode akun harus unik per klien. Gunakan kode lain atau edit akun yang sudah ada.'],
        },
        { status: 409 }
      )
    }
    return dbWriteErrorResponse(e, 'Gagal menyimpan akun. Coba lagi.')
  }
}
