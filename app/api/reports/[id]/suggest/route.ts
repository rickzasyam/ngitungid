import { NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import type { BatchItem } from 'drizzle-orm/batch'
import { db } from '@/lib/db'
import { coaMappingHistory, financialReports, masterCoa, reportLineItems } from '@/lib/db/schema'
import { requireAdmin } from '@/lib/api/guards'
import { isAutoMappable, normalizeName, suggestCoa } from '@/lib/coa-match'

export const runtime = 'nodejs'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// POST /api/reports/[id]/suggest — admin only.
//
// Hitung ULANG saran COA untuk baris yang belum dipetakan. TIDAK memanggil
// Gemini (murni matching lokal) — jadi hemat kuota free-tier dan aman dipanggil
// berkali-kali. Berguna untuk:
//   - laporan lama yang diunggah sebelum matching engine ada
//   - setelah Master COA klien diperbarui / di-import ulang
//   - setelah admin mengonfirmasi mapping baru (history bertambah)
//
// Aturan sama dengan upload: history/exact → auto-map, fuzzy → saran saja.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await requireAdmin()
  if ('error' in g) return g.error

  const { id: reportId } = await params
  if (!UUID_RE.test(reportId)) {
    return NextResponse.json({ error: 'ID laporan tidak valid.' }, { status: 400 })
  }

  const [report] = await db
    .select({ id: financialReports.id, clientId: financialReports.clientId })
    .from(financialReports)
    .where(eq(financialReports.id, reportId))
    .limit(1)

  if (!report) {
    return NextResponse.json({ error: 'Laporan tidak ditemukan.' }, { status: 404 })
  }

  const [accounts, history, lines] = await Promise.all([
    db
      .select({ id: masterCoa.id, nama: masterCoa.nama })
      .from(masterCoa)
      .where(eq(masterCoa.clientId, report.clientId)),
    db
      .select({ rawName: coaMappingHistory.rawName, masterCoaId: coaMappingHistory.masterCoaId })
      .from(coaMappingHistory)
      .where(eq(coaMappingHistory.clientId, report.clientId)),
    db
      .select({
        id: reportLineItems.id,
        rawName: reportLineItems.rawName,
        isSubtotal: reportLineItems.isSubtotal,
        masterCoaId: reportLineItems.masterCoaId,
        status: reportLineItems.status,
      })
      .from(reportLineItems)
      .where(eq(reportLineItems.reportId, reportId)),
  ])

  if (accounts.length === 0) {
    return NextResponse.json(
      { error: 'Master COA klien ini masih kosong — import dulu di Settings.' },
      { status: 400 }
    )
  }

  const historyByRawName = new Map(history.map(h => [normalizeName(h.rawName), h.masterCoaId]))
  const now = new Date()

  const statements: BatchItem<'pg'>[] = []
  let autoMapped = 0
  let suggested = 0

  for (const l of lines) {
    // Subtotal tidak pernah dipetakan; yang sudah punya masterCoaId atau sudah
    // ditolak admin jangan ditimpa.
    if (l.isSubtotal || l.masterCoaId !== null || l.status === 'rejected') continue

    const s = suggestCoa(l.rawName, accounts, historyByRawName)
    if (!s) continue

    const auto = isAutoMappable(s)
    if (auto) autoMapped++
    else suggested++

    statements.push(
      db
        .update(reportLineItems)
        .set({
          suggestedCoaId: s.masterCoaId,
          ...(auto ? { masterCoaId: s.masterCoaId, status: 'matched' as const } : {}),
          updatedAt: now,
        })
        .where(eq(reportLineItems.id, l.id))
    )
  }

  if (statements.length === 0) {
    return NextResponse.json({ reportId, autoMapped: 0, suggested: 0, changed: 0 })
  }

  // neon-http: db.batch() = satu Neon HTTP transaction (atomik).
  await db.batch(statements as [BatchItem<'pg'>, ...BatchItem<'pg'>[]])

  return NextResponse.json({ reportId, autoMapped, suggested, changed: statements.length })
}
