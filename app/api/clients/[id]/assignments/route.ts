import { NextResponse } from 'next/server'
import { and, eq, inArray } from 'drizzle-orm'
import { db } from '@/lib/db'
import { clientAssignments, clients, users } from '@/lib/db/schema'
import { requireAkunting, requireOwner } from '@/lib/api/guards'
import { dbWriteErrorResponse, isUniqueViolation } from '@/lib/api/db-errors'

export const runtime = 'nodejs'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Penugasan akunting → klien. MURNI TRACKING: tidak ada satu pun endpoint lain
// yang memfilter akses berdasarkan tabel ini — semua akunting tetap boleh
// membuka & mengedit semua klien (keputusan Ricko).

// GET /api/clients/[id]/assignments — akunting/owner boleh MELIHAT siapa pegang
// klien ini (informasi organisasi, bukan rahasia).
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await requireAkunting()
  if ('error' in g) return g.error

  const { id } = await params
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: 'ID klien tidak valid.' }, { status: 400 })
  }

  const rows = await db
    .select({
      userId: clientAssignments.userId,
      name: users.name,
      email: users.email,
      role: users.role,
      assignedAt: clientAssignments.assignedAt,
    })
    .from(clientAssignments)
    .innerJoin(users, eq(users.id, clientAssignments.userId))
    .where(eq(clientAssignments.clientId, id))

  return NextResponse.json({ assignments: rows })
}

// PUT /api/clients/[id]/assignments — OWNER ONLY. Body { userIds: string[] }.
// Mengganti seluruh daftar penugasan klien ini (set-based, bukan tambah/hapus
// satu-satu) supaya UI-nya cukup mengirim keadaan akhir.
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await requireOwner()
  if ('error' in g) return g.error

  const { id } = await params
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: 'ID klien tidak valid.' }, { status: 400 })
  }

  let body: { userIds?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Body harus JSON.' }, { status: 400 })
  }

  const raw = body.userIds
  if (!Array.isArray(raw) || raw.some(x => typeof x !== 'string' || !UUID_RE.test(x))) {
    return NextResponse.json({ error: 'userIds harus array UUID.' }, { status: 400 })
  }
  const userIds = [...new Set(raw as string[])]

  const [client] = await db.select({ id: clients.id }).from(clients).where(eq(clients.id, id)).limit(1)
  if (!client) return NextResponse.json({ error: 'Klien tidak ditemukan.' }, { status: 404 })

  // Hanya STAF yang boleh ditugaskan. Tanpa cek ini, akun viewer klien lain bisa
  // tercatat "memegang" klien ini — menyesatkan, walau tidak memberi akses.
  if (userIds.length > 0) {
    const staff = await db
      .select({ id: users.id, role: users.role })
      .from(users)
      .where(inArray(users.id, userIds))
    if (staff.length !== userIds.length) {
      return NextResponse.json({ error: 'Ada userId yang tidak ditemukan.' }, { status: 400 })
    }
    const nonStaff = staff.filter(u => u.role !== 'akunting' && u.role !== 'owner')
    if (nonStaff.length > 0) {
      return NextResponse.json(
        { error: 'Hanya akun Akunting/Owner yang bisa ditugaskan ke klien.' },
        { status: 400 }
      )
    }
  }

  try {
    // Replace-all dalam SATU batch (neon-http: satu transaksi HTTP) supaya tidak
    // pernah ada keadaan "sudah terhapus tapi belum ter-insert".
    if (userIds.length === 0) {
      await db.delete(clientAssignments).where(eq(clientAssignments.clientId, id))
    } else {
      await db.batch([
        db.delete(clientAssignments).where(eq(clientAssignments.clientId, id)),
        db.insert(clientAssignments).values(userIds.map(userId => ({ clientId: id, userId }))),
      ])
    }
  } catch (e) {
    if (isUniqueViolation(e)) {
      return NextResponse.json({ error: 'Ada penugasan ganda untuk klien ini.' }, { status: 409 })
    }
    return dbWriteErrorResponse(e, 'Gagal menyimpan penugasan.')
  }

  return NextResponse.json({ clientId: id, assigned: userIds.length })
}
