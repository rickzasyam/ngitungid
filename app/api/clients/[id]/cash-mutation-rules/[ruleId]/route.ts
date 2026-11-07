import { NextResponse } from 'next/server'
import { and, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { cashMutationRules } from '@/lib/db/schema'
import { requireAkunting } from '@/lib/api/guards'
import { canAccessClientData } from '@/lib/roles'
import { dbWriteErrorResponse } from '@/lib/api/db-errors'
import { validateAturanInput } from '@/lib/aturan-mutasi'
import { assertAkunAturanMilikKlien } from '@/lib/api/cash-mutation-rule-queries'

export const runtime = 'nodejs'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Aturan HARUS milik klien di URL — ambil barisnya DULU, cek kliennya dari
 * baris itu (P7). Tanpa ini, id aturan klien lain bisa diubah lewat path klien
 * mana pun.
 */
async function guard(params: Promise<{ id: string; ruleId: string }>) {
  const g = await requireAkunting()
  if ('error' in g) return { error: g.error }

  const { id, ruleId } = await params
  if (!UUID_RE.test(id) || !UUID_RE.test(ruleId)) {
    return { error: NextResponse.json({ error: 'ID tidak valid.' }, { status: 400 }) }
  }
  if (!canAccessClientData(g.user.role, g.user.clientId, id)) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }

  const [row] = await db
    .select({ id: cashMutationRules.id, pola: cashMutationRules.pola })
    .from(cashMutationRules)
    .where(and(eq(cashMutationRules.id, ruleId), eq(cashMutationRules.clientId, id)))
    .limit(1)
  if (!row) {
    return { error: NextResponse.json({ error: 'Aturan tidak ditemukan untuk klien ini.' }, { status: 404 }) }
  }
  return { clientId: id, ruleId, row }
}

// PATCH /api/clients/[id]/cash-mutation-rules/[ruleId] — ubah satu aturan
// (termasuk menonaktifkan). Bentuknya utuh, divalidasi modul yang sama dengan
// POST. Mutasi tersimpan TIDAK tersentuh: aturan hanya menghasilkan usulan.
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string; ruleId: string }> }) {
  const g = await guard(params)
  if ('error' in g) return g.error

  const body = await req.json().catch(() => null)
  const check = validateAturanInput((body ?? {}) as Record<string, unknown>)
  if (!check.ok) return NextResponse.json({ error: check.errors[0], details: check.errors }, { status: 400 })

  const salahAkun = await assertAkunAturanMilikKlien(check.value, g.clientId)
  if (salahAkun) return salahAkun

  try {
    const [row] = await db
      .update(cashMutationRules)
      .set({ ...check.value, updatedAt: new Date() })
      .where(eq(cashMutationRules.id, g.ruleId))
      .returning({ id: cashMutationRules.id })
    return NextResponse.json({ rule: row })
  } catch (e) {
    return dbWriteErrorResponse(e, 'Gagal menyimpan perubahan aturan. Coba lagi.')
  }
}

// DELETE /api/clients/[id]/cash-mutation-rules/[ruleId] — hapus permanen.
// Tidak ada yang merujuk aturan (usulan tidak pernah disimpan), jadi tidak ada
// perujuk yang harus dibereskan lebih dulu.
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string; ruleId: string }> }) {
  const g = await guard(params)
  if ('error' in g) return g.error

  try {
    await db.delete(cashMutationRules).where(eq(cashMutationRules.id, g.ruleId))
    return NextResponse.json({ deleted: g.ruleId })
  } catch (e) {
    return dbWriteErrorResponse(e, 'Gagal menghapus aturan. Coba lagi.')
  }
}
