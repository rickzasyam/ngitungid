import { NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { financialReports } from '@/lib/db/schema'
import { requireUser } from '@/lib/api/guards'

export const runtime = 'nodejs'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// GET /api/reports/[id]/pdf — stream PDF asli untuk preview kiri di
// extraction-review. Admin klien mana pun / user pemilik.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await requireUser()
  if ('error' in g) return g.error

  const { id } = await params
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: 'ID laporan tidak valid.' }, { status: 400 })
  }

  const [row] = await db
    .select({
      clientId: financialReports.clientId,
      pdf: financialReports.sourcePdf,
      name: financialReports.sourceFileName,
    })
    .from(financialReports)
    .where(eq(financialReports.id, id))
    .limit(1)

  if (!row) return NextResponse.json({ error: 'Laporan tidak ditemukan.' }, { status: 404 })
  if (g.user.role === 'user' && g.user.clientId !== row.clientId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  if (!row.pdf) return NextResponse.json({ error: 'PDF tidak tersedia.' }, { status: 404 })

  const buf = Buffer.isBuffer(row.pdf) ? row.pdf : Buffer.from(row.pdf as Uint8Array)
  const safeName = (row.name || 'laporan.pdf').replace(/["\\\r\n]/g, '_')

  return new Response(new Uint8Array(buf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${safeName}"`,
      'Content-Length': String(buf.length),
      'Cache-Control': 'private, max-age=60',
    },
  })
}
