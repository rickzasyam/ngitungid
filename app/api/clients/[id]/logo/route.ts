import { NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { clients } from '@/lib/db/schema'
import { requireUser } from '@/lib/api/guards'

export const runtime = 'nodejs'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// GET /api/clients/[id]/logo — menyajikan bytea logo sebagai gambar.
// requireUser (bukan requireAkunting): klien viewer juga perlu melihat logonya
// sendiri. Role 'user' dibatasi hanya ke kliennya sendiri.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await requireUser()
  if ('error' in g) return g.error

  const { id } = await params
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: 'ID klien tidak valid.' }, { status: 400 })
  }
  if (g.user.role === 'user' && g.user.clientId !== id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const [row] = await db
    .select({ logo: clients.logo, logoMime: clients.logoMime, updatedAt: clients.updatedAt })
    .from(clients)
    .where(eq(clients.id, id))
    .limit(1)

  if (!row?.logo) {
    return NextResponse.json({ error: 'Klien ini belum punya logo.' }, { status: 404 })
  }

  return new NextResponse(new Uint8Array(row.logo), {
    headers: {
      'Content-Type': row.logoMime ?? 'application/octet-stream',
      // private: logo klien bukan aset publik. Di-revalidate lewat query ?v=
      // dari pemanggil saat logonya diganti.
      'Cache-Control': 'private, max-age=300',
    },
  })
}
