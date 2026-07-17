import { NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { financialReports } from '@/lib/db/schema'
import { requireAkunting } from '@/lib/api/guards'
import { dbWriteErrorResponse } from '@/lib/api/db-errors'

export const runtime = 'nodejs'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// DELETE /api/reports/[id] — admin only.
// Hapus satu laporan + line item-nya (FK reportId onDelete: 'cascade').
// coa_mapping_history TIDAK ikut terhapus (scoped ke klien, bukan laporan) —
// pembelajaran mapping dari laporan ini tetap dipakai upload berikutnya.
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await requireAkunting()
  if ('error' in g) return g.error

  const { id } = await params
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: 'ID laporan tidak valid.' }, { status: 400 })
  }

  const [report] = await db
    .select({
      id: financialReports.id,
      reportType: financialReports.reportType,
      periodStart: financialReports.periodStart,
      periodEnd: financialReports.periodEnd,
    })
    .from(financialReports)
    .where(eq(financialReports.id, id))
    .limit(1)
  if (!report) {
    return NextResponse.json({ error: 'Laporan tidak ditemukan.' }, { status: 404 })
  }

  try {
    await db.delete(financialReports).where(eq(financialReports.id, id))
  } catch (e) {
    return dbWriteErrorResponse(e, 'Gagal menghapus laporan. Coba lagi.')
  }

  return NextResponse.json({ deleted: true, ...report })
}
