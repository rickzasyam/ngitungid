import { NextResponse } from 'next/server'
import { eq, inArray } from 'drizzle-orm'
import type { BatchItem } from 'drizzle-orm/batch'
import { db } from '@/lib/db'
import { contracts, contractLayanan, layanan } from '@/lib/db/schema'
import { requireCommercial } from '@/lib/api/guards'
import { dbWriteErrorResponse, isUniqueViolation } from '@/lib/api/db-errors'
import { validateContract, MAX_DOKUMEN_BYTES } from '@/lib/contracts'

export const runtime = 'nodejs'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// `dokumen` TIDAK ADA di daftar kolom ini — sama seperti route daftar.
const cols = {
  id: contracts.id,
  clientId: contracts.clientId,
  noKontrak: contracts.noKontrak,
  jenis: contracts.jenis,
  tanggalMulai: contracts.tanggalMulai,
  tanggalAkhir: contracts.tanggalAkhir,
  tanggalPenagihan: contracts.tanggalPenagihan,
  nominal: contracts.nominal,
  namaDokumen: contracts.namaDokumen,
  ukuranDokumen: contracts.ukuranDokumen,
  createdAt: contracts.createdAt,
  updatedAt: contracts.updatedAt,
}

// PATCH /api/contracts/[id] — ubah kontrak. owner + finance SAJA.
// multipart/form-data; field `dokumen` OPSIONAL (kalau ada, mengganti yang lama).
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await requireCommercial()
  if ('error' in g) return g.error

  const { id } = await params
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: 'ID kontrak tidak valid.' }, { status: 400 })
  }

  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return NextResponse.json({ error: 'Body harus multipart/form-data.' }, { status: 400 })
  }

  const tp = form.get('tanggalPenagihan')
  const check = validateContract({
    noKontrak: form.get('noKontrak'),
    jenis: form.get('jenis'),
    tanggalMulai: form.get('tanggalMulai'),
    tanggalAkhir: form.get('tanggalAkhir'),
    tanggalPenagihan: tp === null || tp === '' ? undefined : Number(tp),
    nominal: form.get('nominal'),
    layananIds: form.getAll('layananIds').map(String),
  })
  if (!check.ok) return NextResponse.json({ error: check.error }, { status: 400 })

  const [existing] = await db.select({ id: contracts.id }).from(contracts).where(eq(contracts.id, id)).limit(1)
  if (!existing) return NextResponse.json({ error: 'Kontrak tidak ditemukan.' }, { status: 404 })

  if (check.layananIds.length > 0) {
    const found = await db.select({ id: layanan.id }).from(layanan).where(inArray(layanan.id, check.layananIds))
    if (found.length !== check.layananIds.length) {
      return NextResponse.json({ error: 'Ada layanan yang tidak ditemukan.' }, { status: 400 })
    }
  }

  // Dokumen opsional saat edit — tidak dikirim berarti yang lama dipertahankan.
  let dokumenPatch: { dokumen: Buffer; namaDokumen: string; ukuranDokumen: number } | null = null
  const file = form.get('dokumen')
  if (file instanceof File && file.size > 0) {
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      return NextResponse.json({ error: `"${file.name}" bukan PDF.` }, { status: 400 })
    }
    if (file.size > MAX_DOKUMEN_BYTES) {
      return NextResponse.json({ error: `"${file.name}" melebihi 25MB.` }, { status: 400 })
    }
    const bytes = Buffer.from(await file.arrayBuffer())
    dokumenPatch = { dokumen: bytes, namaDokumen: file.name, ukuranDokumen: bytes.length }
  }

  // Ganti seluruh himpunan layanan: hapus lalu sisipkan ulang, dalam satu batch
  // bersama update kontraknya supaya tidak pernah ada keadaan setengah jadi.
  const statements: BatchItem<'pg'>[] = [
    db
      .update(contracts)
      .set({
        noKontrak: check.noKontrak,
        jenis: check.jenis,
        tanggalMulai: check.tanggalMulai,
        tanggalAkhir: check.tanggalAkhir,
        tanggalPenagihan: check.tanggalPenagihan,
        nominal: check.nominal,
        ...(dokumenPatch ?? {}),
        updatedAt: new Date(),
      })
      .where(eq(contracts.id, id)),
    db.delete(contractLayanan).where(eq(contractLayanan.contractId, id)),
    ...check.layananIds.map(layananId => db.insert(contractLayanan).values({ contractId: id, layananId })),
  ]

  try {
    await db.batch(statements as [BatchItem<'pg'>, ...BatchItem<'pg'>[]])
  } catch (e) {
    if (isUniqueViolation(e)) {
      return NextResponse.json(
        { error: `Nomor kontrak "${check.noKontrak}" sudah ada untuk klien ini.` },
        { status: 409 }
      )
    }
    return dbWriteErrorResponse(e, 'Gagal menyimpan perubahan. Coba lagi.')
  }

  const [updated] = await db.select(cols).from(contracts).where(eq(contracts.id, id)).limit(1)
  return NextResponse.json({ contract: { ...updated, layananIds: check.layananIds } })
}

// DELETE /api/contracts/[id] — owner + finance SAJA.
//
// Kontrak BOLEH dihapus (beda dengan layanan): ia dokumen milik satu klien,
// bukan master data yang dirujuk riwayat lain. Baris contract_layanan-nya ikut
// terhapus lewat ON DELETE CASCADE di sisi contract_id; baris `layanan` sendiri
// tidak tersentuh karena FK-nya RESTRICT dan yang dihapus bukan layanan.
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await requireCommercial()
  if ('error' in g) return g.error

  const { id } = await params
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: 'ID kontrak tidak valid.' }, { status: 400 })
  }

  try {
    const deleted = await db.delete(contracts).where(eq(contracts.id, id)).returning({ id: contracts.id })
    if (deleted.length === 0) {
      return NextResponse.json({ error: 'Kontrak tidak ditemukan.' }, { status: 404 })
    }
    return NextResponse.json({ ok: true, id })
  } catch (e) {
    return dbWriteErrorResponse(e, 'Gagal menghapus kontrak. Coba lagi.')
  }
}
