import { NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { financialReports } from '@/lib/db/schema'
import { requireUser } from '@/lib/api/guards'
import { canAccessClientData } from '@/lib/roles'

export const runtime = 'nodejs'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// GET /api/reports/[id]/pdf — stream PDF asli. Preview inline di halaman Laporan
// (semua role) & preview kiri extraction-review (staf). requireUser: role 'user'
// (klien) boleh melihat PDF KLIEN-NYA SENDIRI (scoping canAccessClientData di
// bawah); staf boleh klien mana pun. WRITE tidak ada di endpoint ini.
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
  // Scoping ANTAR-klien: user hanya PDF klien-nya sendiri; staf tak dibatasi.
  // Dicek setelah row diambil supaya butuh clientId laporan (bukan dari request).
  if (!canAccessClientData(g.user.role, g.user.clientId, row.clientId)) {
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
