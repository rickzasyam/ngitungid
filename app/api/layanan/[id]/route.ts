import { NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { layanan } from '@/lib/db/schema'
import { requireCommercial } from '@/lib/api/guards'
import { dbWriteErrorResponse, isUniqueViolation } from '@/lib/api/db-errors'
import { validateLayanan } from '@/lib/layanan'

export const runtime = 'nodejs'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const cols = {
  id: layanan.id,
  nama: layanan.nama,
  deskripsi: layanan.deskripsi,
  aktif: layanan.aktif,
}

// PATCH /api/layanan/[id] — ubah nama / deskripsi / aktif. owner + finance SAJA.
//
// Partial: field yang tidak dikirim tidak disentuh, jadi toggle aktif cukup
// mengirim { aktif: false } tanpa perlu mengulang nama.
//
// TIDAK ADA DELETE di file ini, dan tidak boleh ditambahkan. Menonaktifkan
// (aktif=false) menyembunyikan layanan dari picker kontrak BARU sementara
// kontrak lama tetap menampilkannya normal — lihat lib/layanan.ts.
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await requireCommercial()
  if ('error' in g) return g.error

  const { id } = await params
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: 'ID layanan tidak valid.' }, { status: 400 })
  }

  let body: Record<string, unknown>
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: 'Body harus JSON.' }, { status: 400 })
  }

  const check = validateLayanan(body, { partial: true })
  if (!check.ok) return NextResponse.json({ error: check.error }, { status: 400 })

  // Hanya field yang benar-benar dikirim yang ikut di-update.
  const patch: Partial<{ nama: string; deskripsi: string | null; aktif: boolean }> = {}
  if (body.nama !== undefined) patch.nama = check.nama
  if (body.deskripsi !== undefined) patch.deskripsi = check.deskripsi
  if (body.aktif !== undefined) patch.aktif = check.aktif
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'Tidak ada perubahan yang dikirim.' }, { status: 400 })
  }

  try {
    const updated = await db
      .update(layanan)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(layanan.id, id))
      .returning(cols)

    if (updated.length === 0) {
      return NextResponse.json({ error: 'Layanan tidak ditemukan.' }, { status: 404 })
    }
    return NextResponse.json({ layanan: updated[0] })
  } catch (e) {
    if (isUniqueViolation(e)) {
      return NextResponse.json({ error: `Layanan "${patch.nama}" sudah ada.` }, { status: 409 })
    }
    return dbWriteErrorResponse(e, 'Gagal menyimpan perubahan. Coba lagi.')
  }
}
