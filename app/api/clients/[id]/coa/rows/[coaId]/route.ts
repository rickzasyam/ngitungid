import { NextResponse } from 'next/server'
import { and, eq, inArray } from 'drizzle-orm'
import type { BatchItem } from 'drizzle-orm/batch'
import { db } from '@/lib/db'
import { coaMappingHistory, financialReports, masterCoa, reportLineItems } from '@/lib/db/schema'
import { requireAkunting } from '@/lib/api/guards'
import { parseCoaRowInput } from '@/lib/coa/row-input'
import { dbWriteErrorResponse, isUniqueViolation } from '@/lib/api/db-errors'
import { buildReplacePlan } from '@/lib/coa/replace-plan'

export const runtime = 'nodejs'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function guard(params: Promise<{ id: string; coaId: string }>) {
  const g = await requireAkunting()
  if ('error' in g) return { error: g.error }

  const { id, coaId } = await params
  if (!UUID_RE.test(id) || !UUID_RE.test(coaId)) {
    return { error: NextResponse.json({ error: 'ID tidak valid.' }, { status: 400 }) }
  }

  // Akun HARUS milik klien di URL — tanpa ini, id akun klien lain bisa diedit
  // lewat path klien mana pun.
  const [row] = await db
    .select({ id: masterCoa.id, kode: masterCoa.kode, nama: masterCoa.nama })
    .from(masterCoa)
    .where(and(eq(masterCoa.id, coaId), eq(masterCoa.clientId, id)))
    .limit(1)
  if (!row) {
    return { error: NextResponse.json({ error: 'Akun COA tidak ditemukan untuk klien ini.' }, { status: 404 }) }
  }
  return { clientId: id, coaId, row }
}

// PATCH /api/clients/[id]/coa/rows/[coaId] — EDIT satu baris.
//
// UPDATE di tempat: `id` TIDAK berubah, jadi setiap report_line_items yang
// sudah menunjuk akun ini tetap tersambung dan tidak ada laporan yang perlu
// dipetakan ulang. Ini beda mendasar dengan jalur bulk Excel, yang
// DELETE-all + INSERT-all sehingga semua id berganti.
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string; coaId: string }> }) {
  const g = await guard(params)
  if ('error' in g) return g.error

  const body = await req.json().catch(() => null)
  const parsed = parseCoaRowInput(body)
  if (!parsed.ok) {
    return NextResponse.json({ error: 'Data akun belum lengkap.', details: parsed.errors }, { status: 400 })
  }

  try {
    const [row] = await db
      .update(masterCoa)
      .set({ ...parsed.value, updatedAt: new Date() })
      .where(eq(masterCoa.id, g.coaId))
      .returning({ id: masterCoa.id, kode: masterCoa.kode, nama: masterCoa.nama })
    return NextResponse.json({ account: row, kodeChanged: row.kode !== g.row.kode })
  } catch (e) {
    if (isUniqueViolation(e)) {
      return NextResponse.json(
        {
          error: `Kode "${parsed.value.kode}" sudah dipakai akun lain di klien ini.`,
          details: ['Kode akun harus unik per klien.'],
        },
        { status: 409 }
      )
    }
    return dbWriteErrorResponse(e, 'Gagal menyimpan perubahan akun. Coba lagi.')
  }
}

// DELETE /api/clients/[id]/coa/rows/[coaId][?dryRun=1]
//
// Alur sama dengan ganti Excel: hitung dampak dulu, commit setelah dikonfirmasi.
// Mesin dampaknya PERSIS sama (buildReplacePlan) — triknya, `newKodeToId` diisi
// seluruh kode yang ada BESERTA ID-NYA YANG SEKARANG, minus kode yang dihapus.
// Akibatnya baris yang menunjuk akun lain me-resolve ke id yang sama (jadi tidak
// menghasilkan instruksi apa pun), sementara baris yang menunjuk akun yang
// dihapus me-resolve ke null → masuk laporan dampak, status laporannya
// dievaluasi ulang, persis seperti pada replace.
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string; coaId: string }> }) {
  const g = await guard(params)
  if ('error' in g) return g.error
  const dryRun = new URL(req.url).searchParams.get('dryRun') === '1'

  const accounts = await db
    .select({ id: masterCoa.id, kode: masterCoa.kode })
    .from(masterCoa)
    .where(eq(masterCoa.clientId, g.clientId))

  const [lines, history, reportRows] = await Promise.all([
    db
      .select({
        id: reportLineItems.id,
        reportId: reportLineItems.reportId,
        masterCoaId: reportLineItems.masterCoaId,
        suggestedCoaId: reportLineItems.suggestedCoaId,
        isSubtotal: reportLineItems.isSubtotal,
        status: reportLineItems.status,
        rawName: reportLineItems.rawName,
        amount: reportLineItems.amount,
      })
      .from(reportLineItems)
      .innerJoin(financialReports, eq(reportLineItems.reportId, financialReports.id))
      .where(eq(financialReports.clientId, g.clientId)),
    db
      .select({
        rawName: coaMappingHistory.rawName,
        masterCoaId: coaMappingHistory.masterCoaId,
        confirmedCount: coaMappingHistory.confirmedCount,
      })
      .from(coaMappingHistory)
      .where(eq(coaMappingHistory.clientId, g.clientId)),
    db
      .select({
        id: financialReports.id,
        reportType: financialReports.reportType,
        periodStart: financialReports.periodStart,
        periodEnd: financialReports.periodEnd,
        status: financialReports.status,
      })
      .from(financialReports)
      .where(eq(financialReports.clientId, g.clientId)),
  ])

  // Semua akun BERTAHAN dengan id-nya sendiri, kecuali yang dihapus.
  const survivors = new Map(accounts.filter(a => a.id !== g.coaId).map(a => [a.kode, a.id]))

  const { plan, relinks } = buildReplacePlan({
    oldAccounts: accounts,
    newKodeToId: survivors,
    ambiguousKode: [],
    lines,
    history,
    reports: reportRows,
  })

  if (dryRun) {
    return NextResponse.json({
      dryRun: true,
      account: { kode: g.row.kode, nama: g.row.nama },
      impact: plan,
    })
  }

  const now = new Date()
  const statements: BatchItem<'pg'>[] = []

  // 1) Lepas referensi ke akun ini. FK master_coa_id = RESTRICT akan menolak
  //    DELETE selama masih ada yang menunjuk; suggested_coa_id sebenarnya
  //    SET NULL, tapi di-null-kan eksplisit supaya hasilnya tidak bergantung
  //    pada perilaku FK.
  const clearedIds = relinks.map(r => r.lineItemId)
  if (clearedIds.length > 0) {
    statements.push(
      db
        .update(reportLineItems)
        .set({ masterCoaId: null, suggestedCoaId: null, updatedAt: now })
        .where(inArray(reportLineItems.id, clearedIds))
    )
  }

  // 2) HANYA baris yang benar-benar kehilangan mapping yang statusnya direset.
  //    Baris yang cuma kehilangan saran COA tidak disentuh statusnya.
  const brokenIds = relinks.filter(r => r.lostMapping).map(r => r.lineItemId)
  if (brokenIds.length > 0) {
    statements.push(
      db
        .update(reportLineItems)
        .set({ status: 'unmatched', updatedAt: now })
        .where(inArray(reportLineItems.id, brokenIds))
    )
  }

  // 3) Hapus akunnya. coa_mapping_history yang menunjuk akun ini ikut terhapus
  //    lewat FK CASCADE — beda dengan replace, di sini TIDAK ada yang disisipkan
  //    ulang: history akun lain tidak tersentuh sama sekali.
  statements.push(db.delete(masterCoa).where(eq(masterCoa.id, g.coaId)))

  // 4) Demote laporan yang jadi tidak lengkap ('confirmed' tidak disentuh —
  //    lihat buildReplacePlan).
  if (plan.demotedReportIds.length > 0) {
    statements.push(
      db
        .update(financialReports)
        .set({ status: 'review', updatedAt: now })
        .where(inArray(financialReports.id, plan.demotedReportIds))
    )
  }

  try {
    await db.batch(statements as [BatchItem<'pg'>, ...BatchItem<'pg'>[]])
  } catch (e) {
    return dbWriteErrorResponse(e, 'Gagal menghapus akun. Coba lagi.')
  }

  return NextResponse.json({ deleted: g.coaId, impact: plan })
}
