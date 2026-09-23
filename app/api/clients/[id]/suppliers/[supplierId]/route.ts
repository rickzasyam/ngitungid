import { NextResponse } from 'next/server'
import { and, eq, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { journalLines, masterSupplier, purchaseInvoices } from '@/lib/db/schema'
import { requireAkunting } from '@/lib/api/guards'
import { canAccessClientData } from '@/lib/roles'
import { dbWriteErrorResponse, isFkViolation, isUniqueViolation } from '@/lib/api/db-errors'
import { validateSupplierInput } from '@/lib/supplier'
import { assertAkunHutangMilikKlien } from '@/lib/api/supplier-queries'

export const runtime = 'nodejs'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Supplier HARUS milik klien di URL.
 *
 * Tanpa ini, id supplier klien lain bisa diubah atau dihapus lewat path klien
 * mana pun — pola penjaga yang sama dengan route baris Master COA.
 */
async function guard(params: Promise<{ id: string; supplierId: string }>) {
  const g = await requireAkunting()
  if ('error' in g) return { error: g.error }

  const { id, supplierId } = await params
  if (!UUID_RE.test(id) || !UUID_RE.test(supplierId)) {
    return { error: NextResponse.json({ error: 'ID tidak valid.' }, { status: 400 }) }
  }
  if (!canAccessClientData(g.user.role, g.user.clientId, id)) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }

  const [row] = await db
    .select({ id: masterSupplier.id, nama: masterSupplier.nama })
    .from(masterSupplier)
    .where(and(eq(masterSupplier.id, supplierId), eq(masterSupplier.clientId, id)))
    .limit(1)
  if (!row) {
    return {
      error: NextResponse.json({ error: 'Supplier tidak ditemukan untuk klien ini.' }, { status: 404 }),
    }
  }
  return { clientId: id, supplierId, row }
}

// PATCH /api/clients/[id]/suppliers/[supplierId] — ubah satu supplier.
//
// UPDATE di tempat: `id` tidak berubah, jadi apa pun yang kelak menunjuk
// supplier ini (baris jurnal ber-supplier_id, Fase 2) tetap tersambung.
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string; supplierId: string }> }) {
  const g = await guard(params)
  if ('error' in g) return g.error

  const body = await req.json().catch(() => null)
  const check = validateSupplierInput((body ?? {}) as Record<string, unknown>)
  if (!check.ok) {
    return NextResponse.json({ error: check.errors[0], details: check.errors }, { status: 400 })
  }

  const akunGuard = await assertAkunHutangMilikKlien(check.value.akunHutangDefaultId, g.clientId)
  if (akunGuard) return akunGuard

  try {
    const [row] = await db
      .update(masterSupplier)
      .set({ ...check.value, updatedAt: new Date() })
      .where(eq(masterSupplier.id, g.supplierId))
      .returning({ id: masterSupplier.id, nama: masterSupplier.nama })
    return NextResponse.json({ supplier: row })
  } catch (e) {
    if (isUniqueViolation(e)) {
      return NextResponse.json(
        { error: `Supplier bernama "${check.value.nama}" sudah ada untuk klien ini.` },
        { status: 409 }
      )
    }
    return dbWriteErrorResponse(e, 'Gagal menyimpan perubahan supplier. Coba lagi.')
  }
}

// DELETE /api/clients/[id]/suppliers/[supplierId] — HARD DELETE (D9).
//
// Fase 1 memang menghapus barisnya. Itu aman SELAMA belum ada yang merujuk
// supplier: `journal_lines.supplier_id` baru lahir di Fase 2 (D15), dan bersama
// itu penghapusannya berubah jadi menolak 409 kalau masih dirujuk. Kalau kolom
// itu ditambahkan tanpa mengubah handler ini, penghapusan akan gagal di DB
// dengan galat FK mentah alih-alih pesan yang bisa dibaca — catat di sana.
// DELETE /api/clients/[id]/suppliers/[supplierId]
//
// ══ SUPPLIER YANG MASIH DIRUJUK MENOLAK DIHAPUS — 409, BUKAN set null ═════
// Invoice pembelian dan baris jurnal bersupplier adalah catatan yang SUDAH
// TERJADI. Memutus suppliernya jadi null akan menyisakan hutang yang tidak
// diketahui milik siapa: rekonsiliasi kehilangan pemiliknya, umur hutang
// kehilangan barisnya di rekap per supplier, dan tidak ada satu pun galat yang
// muncul. Ditolak di sini dengan menyebut BERAPA yang menghalangi, supaya
// akunting tahu yang harus dibereskan.
//
// `isFkViolation` di bawah tetap ada sebagai JARING TERAKHIR: FK-nya memang
// restrict, tapi pemeriksaan eksplisit yang menghasilkan pesan berguna jauh
// lebih baik daripada galat database yang tidak menyebut apa pun.
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string; supplierId: string }> }) {
  const g = await guard(params)
  if ('error' in g) return g.error

  const [invoice] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(purchaseInvoices)
    .where(eq(purchaseInvoices.supplierId, g.supplierId))
  const [jurnal] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(journalLines)
    .where(eq(journalLines.supplierId, g.supplierId))

  const nInvoice = invoice?.n ?? 0
  const nJurnal = jurnal?.n ?? 0
  if (nInvoice > 0 || nJurnal > 0) {
    const sebab: string[] = []
    if (nInvoice > 0) sebab.push(`${nInvoice} invoice pembelian`)
    if (nJurnal > 0) sebab.push(`${nJurnal} baris jurnal`)
    return NextResponse.json(
      {
        error: `Supplier "${g.row.nama}" masih dipakai ${sebab.join(' dan ')} — tidak bisa dihapus.`,
        details: [
          'Hapus atau pindahkan dokumen yang merujuknya lebih dulu.',
          'Suppliernya TIDAK diputus jadi kosong: hutang tanpa pemilik tidak bisa direkonsiliasi, dan tidak ada galat yang akan memberi tahu.',
        ],
      },
      { status: 409 }
    )
  }

  try {
    await db.delete(masterSupplier).where(eq(masterSupplier.id, g.supplierId))
  } catch (e) {
    // Jaring terakhir: ada perujuk baru yang belum diperiksa di atas.
    if (isFkViolation(e)) {
      return NextResponse.json(
        { error: `Supplier "${g.row.nama}" masih dipakai dokumen lain — tidak bisa dihapus.` },
        { status: 409 }
      )
    }
    return dbWriteErrorResponse(e, 'Gagal menghapus supplier. Coba lagi.')
  }

  return NextResponse.json({ deleted: g.supplierId, nama: g.row.nama })
}
