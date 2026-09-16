import { NextResponse } from 'next/server'
import { asc, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { clients, masterCoa, masterSupplier } from '@/lib/db/schema'
import { requireAkunting, requireInternal } from '@/lib/api/guards'
import { canAccessClientData } from '@/lib/roles'
import { dbWriteErrorResponse, isUniqueViolation } from '@/lib/api/db-errors'
import { validateSupplierInput } from '@/lib/supplier'
import { assertAkunHutangMilikKlien } from '@/lib/api/supplier-queries'

export const runtime = 'nodejs'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// GET /api/clients/[id]/suppliers — daftar supplier klien.
//
// ══ BACA = requireInternal, BUKAN requireUser (R4) ════════════════════════
// Jawaban Ricko 2026-09-15: finance boleh LIHAT. Jadi owner/akunting/finance
// lolos, tapi KLIEN tidak — bukan `requireUser`, supaya akun klien tidak bisa
// menarik daftar rekanan lewat API padahal tab-nya tidak terlihat di layarnya.
// Tulis tetap requireAkunting (D7): finance melihat, tidak mengelola.
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

  // leftJoin: supplier tanpa akun hutang default tetap muncul. innerJoin akan
  // menghilangkannya diam-diam — persis supplier yang paling perlu dilengkapi.
  const rows = await db
    .select({
      id: masterSupplier.id,
      nama: masterSupplier.nama,
      kontak: masterSupplier.kontak,
      npwp: masterSupplier.npwp,
      terminPembayaran: masterSupplier.terminPembayaran,
      akunHutangDefaultId: masterSupplier.akunHutangDefaultId,
      akunHutangKode: masterCoa.kode,
      akunHutangNama: masterCoa.nama,
      updatedAt: masterSupplier.updatedAt,
    })
    .from(masterSupplier)
    .leftJoin(masterCoa, eq(masterSupplier.akunHutangDefaultId, masterCoa.id))
    .where(eq(masterSupplier.clientId, id))
    .orderBy(asc(masterSupplier.nama))

  return NextResponse.json({ count: rows.length, suppliers: rows })
}

// POST /api/clients/[id]/suppliers — tambah satu supplier.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await requireAkunting()
  if ('error' in g) return g.error

  const { id } = await params
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: 'ID klien tidak valid.' }, { status: 400 })
  }
  if (!canAccessClientData(g.user.role, g.user.clientId, id)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json().catch(() => null)
  const check = validateSupplierInput((body ?? {}) as Record<string, unknown>)
  if (!check.ok) {
    return NextResponse.json({ error: check.errors[0], details: check.errors }, { status: 400 })
  }

  const [client] = await db.select({ id: clients.id }).from(clients).where(eq(clients.id, id)).limit(1)
  if (!client) return NextResponse.json({ error: 'Klien tidak ditemukan.' }, { status: 404 })

  const akunGuard = await assertAkunHutangMilikKlien(check.value.akunHutangDefaultId, id)
  if (akunGuard) return akunGuard

  try {
    const [row] = await db
      .insert(masterSupplier)
      .values({ clientId: id, ...check.value })
      .returning({ id: masterSupplier.id, nama: masterSupplier.nama })
    return NextResponse.json({ supplier: row }, { status: 201 })
  } catch (e) {
    if (isUniqueViolation(e)) {
      return NextResponse.json(
        { error: `Supplier bernama "${check.value.nama}" sudah ada untuk klien ini.` },
        { status: 409 }
      )
    }
    return dbWriteErrorResponse(e, 'Gagal menyimpan supplier. Coba lagi.')
  }
}
