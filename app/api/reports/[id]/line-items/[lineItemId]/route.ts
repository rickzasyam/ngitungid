import { NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { reportLineItems } from '@/lib/db/schema'
import { requireAkunting } from '@/lib/api/guards'

export const runtime = 'nodejs'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const VALID_STATUS = ['matched', 'unmatched', 'edited', 'rejected'] as const
type LineStatus = (typeof VALID_STATUS)[number]

// PATCH /api/reports/[id]/line-items/[lineItemId] — admin only.
// Body: { status: 'matched'|'unmatched'|'edited'|'rejected', editedName?: string|null }
//
// Menyimpan keputusan review admin per baris (reject / edit / undo). editedName
// hanya di-set kalau field-nya ADA di body (null = hapus, string = isi);
// absen = biarkan apa adanya. Status laporan TIDAK disentuh di sini —
// transisi review→mapped dimiliki route /mapping (berbasis masterCoaId).
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string; lineItemId: string }> }) {
  const g = await requireAkunting()
  if ('error' in g) return g.error

  const { id: reportId, lineItemId } = await params
  if (!UUID_RE.test(reportId) || !UUID_RE.test(lineItemId)) {
    return NextResponse.json({ error: 'ID tidak valid.' }, { status: 400 })
  }

  let body: { status?: unknown; editedName?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Body harus JSON.' }, { status: 400 })
  }

  if (!VALID_STATUS.includes(body.status as LineStatus)) {
    return NextResponse.json(
      { error: `status harus salah satu dari: ${VALID_STATUS.join(', ')}.` },
      { status: 400 }
    )
  }
  const status = body.status as LineStatus

  const hasEditedName = 'editedName' in body
  if (hasEditedName && body.editedName !== null && typeof body.editedName !== 'string') {
    return NextResponse.json({ error: 'editedName harus string atau null.' }, { status: 400 })
  }

  // IDOR guard: baris HARUS milik laporan di URL.
  const [line] = await db
    .select({ id: reportLineItems.id, reportId: reportLineItems.reportId })
    .from(reportLineItems)
    .where(eq(reportLineItems.id, lineItemId))
    .limit(1)

  if (!line || line.reportId !== reportId) {
    return NextResponse.json({ error: 'Line item tidak ditemukan pada laporan ini.' }, { status: 404 })
  }

  const set: { status: LineStatus; updatedAt: Date; editedName?: string | null } = {
    status,
    updatedAt: new Date(),
  }
  if (hasEditedName) {
    set.editedName = (body.editedName as string | null) === '' ? null : (body.editedName as string | null)
  }

  await db.update(reportLineItems).set(set).where(eq(reportLineItems.id, lineItemId))

  return NextResponse.json({ lineItemId, status, editedName: set.editedName })
}
