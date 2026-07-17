import { NextResponse } from 'next/server'
import { and, eq, inArray, sql } from 'drizzle-orm'
import type { BatchItem } from 'drizzle-orm/batch'
import { db } from '@/lib/db'
import { financialReports, masterCoa, reportLineItems, coaMappingHistory } from '@/lib/db/schema'
import { requireAkunting } from '@/lib/api/guards'
import { dbWriteErrorResponse } from '@/lib/api/db-errors'

export const runtime = 'nodejs'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type MappingInput = { lineItemId: string; masterCoaId: string }

// POST /api/reports/[id]/mapping — admin only.
// Body: { mappings: [{ lineItemId, masterCoaId }, ...] }
//
// Menyimpan hasil COA mapping manual dari /coa-mapping:
//   1. report_line_items.master_coa_id di-set, status → 'matched'
//   2. coa_mapping_history di-upsert (fondasi fuzzy-match-with-history-boost)
//   3. financial_reports.status → 'mapped' kalau tidak ada sisa unmatched
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await requireAkunting()
  if ('error' in g) return g.error

  const { id: reportId } = await params
  if (!UUID_RE.test(reportId)) {
    return NextResponse.json({ error: 'ID laporan tidak valid.' }, { status: 400 })
  }

  let body: { mappings?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Body harus JSON.' }, { status: 400 })
  }

  const raw = body.mappings
  if (!Array.isArray(raw) || raw.length === 0) {
    return NextResponse.json({ error: 'Field "mappings" harus array tidak kosong.' }, { status: 400 })
  }

  const mappings: MappingInput[] = []
  for (const m of raw) {
    const lineItemId = (m as MappingInput)?.lineItemId
    const masterCoaId = (m as MappingInput)?.masterCoaId
    if (!UUID_RE.test(lineItemId ?? '') || !UUID_RE.test(masterCoaId ?? '')) {
      return NextResponse.json(
        { error: 'Setiap mapping butuh lineItemId + masterCoaId berupa UUID.' },
        { status: 400 }
      )
    }
    mappings.push({ lineItemId, masterCoaId })
  }

  // Tolak lineItemId ganda — kalau tidak, urutan update jadi non-deterministik.
  const uniqueLineIds = new Set(mappings.map(m => m.lineItemId))
  if (uniqueLineIds.size !== mappings.length) {
    return NextResponse.json({ error: 'lineItemId duplikat dalam satu request.' }, { status: 400 })
  }

  const [report] = await db
    .select({ id: financialReports.id, clientId: financialReports.clientId })
    .from(financialReports)
    .where(eq(financialReports.id, reportId))
    .limit(1)

  if (!report) {
    return NextResponse.json({ error: 'Laporan tidak ditemukan.' }, { status: 404 })
  }

  // Semua line item harus milik laporan ini — cegah update lintas-laporan.
  const ownLines = await db
    .select({
      id: reportLineItems.id,
      rawName: reportLineItems.rawName,
      masterCoaId: reportLineItems.masterCoaId,
      isSubtotal: reportLineItems.isSubtotal,
      status: reportLineItems.status,
    })
    .from(reportLineItems)
    .where(eq(reportLineItems.reportId, reportId))

  const lineById = new Map(ownLines.map(l => [l.id, l]))
  const stray = mappings.filter(m => !lineById.has(m.lineItemId))
  if (stray.length > 0) {
    return NextResponse.json(
      { error: 'Ada lineItemId yang bukan milik laporan ini.', details: stray.map(s => s.lineItemId) },
      { status: 400 }
    )
  }

  // Semua COA harus milik klien laporan ini — cegah mapping lintas-klien.
  const coaIds = [...new Set(mappings.map(m => m.masterCoaId))]
  const ownCoa = await db
    .select({ id: masterCoa.id })
    .from(masterCoa)
    .where(and(eq(masterCoa.clientId, report.clientId), inArray(masterCoa.id, coaIds)))

  if (ownCoa.length !== coaIds.length) {
    return NextResponse.json(
      { error: 'Ada masterCoaId yang bukan milik klien laporan ini.' },
      { status: 400 }
    )
  }

  const now = new Date()

  const updates = mappings.map(m =>
    db
      .update(reportLineItems)
      .set({ masterCoaId: m.masterCoaId, status: 'matched', updatedAt: now })
      .where(eq(reportLineItems.id, m.lineItemId))
  )

  const historyUpserts = mappings.map(m =>
    db
      .insert(coaMappingHistory)
      .values({
        clientId: report.clientId,
        rawName: lineById.get(m.lineItemId)!.rawName,
        masterCoaId: m.masterCoaId,
        confirmedCount: 1,
        lastConfirmedAt: now,
      })
      .onConflictDoUpdate({
        target: [coaMappingHistory.clientId, coaMappingHistory.rawName],
        set: {
          masterCoaId: m.masterCoaId,
          confirmedCount: sql`${coaMappingHistory.confirmedCount} + 1`,
          lastConfirmedAt: now,
        },
      })
  )

  // Sisa unmatched setelah request ini diterapkan.
  // Baris subtotal (PENERIMAAN BERSIH, LABA KOTOR, TOTAL AKTIVA, …) dan baris
  // yang ditolak TIDAK pernah dipetakan — /coa-mapping memfilternya keluar.
  // Tanpa pengecualian ini `remaining` tidak pernah 0 dan status laporan tidak
  // pernah berpindah ke 'mapped'.
  const mappedNow = new Set(mappings.map(m => m.lineItemId))
  const remaining = ownLines.filter(
    l =>
      !l.isSubtotal &&
      l.status !== 'rejected' &&
      l.masterCoaId === null &&
      !mappedNow.has(l.id)
  ).length

  // Tipe di-widen ke BatchItem: array-nya campur update ke dua tabel berbeda,
  // dan inference drizzle mengunci ke tabel statement pertama.
  const statements: BatchItem<'pg'>[] = [...updates, ...historyUpserts]
  if (remaining === 0) {
    statements.push(
      db
        .update(financialReports)
        .set({ status: 'mapped', updatedAt: now })
        .where(eq(financialReports.id, reportId))
    )
  }

  // neon-http tidak mendukung interactive transaction; db.batch() dieksekusi
  // atomik sebagai satu Neon HTTP transaction (pola sama dgn COA import).
  try {
    await db.batch(statements as [BatchItem<'pg'>, ...BatchItem<'pg'>[]])
  } catch (e) {
    return dbWriteErrorResponse(e, 'Gagal menyimpan mapping. Coba lagi.')
  }

  return NextResponse.json({
    reportId,
    updated: mappings.length,
    remainingUnmatched: remaining,
    reportStatus: remaining === 0 ? 'mapped' : 'review',
  })
}
