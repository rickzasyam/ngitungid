import { NextResponse } from 'next/server'
import { asc, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { clients, masterCoa } from '@/lib/db/schema'
import { requireAdmin, requireUser } from '@/lib/api/guards'
import { parseCoaWorkbook } from '@/lib/coa-import'

// xlsx parsing + neon-http butuh Node runtime (bukan edge).
export const runtime = 'nodejs'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MAX_FILE_BYTES = 10 * 1024 * 1024 // 10MB — Master COA selalu file kecil

const coaColumns = {
  kode: masterCoa.kode,
  nama: masterCoa.nama,
  posisi: masterCoa.posisi,
  kelompok: masterCoa.kelompok,
  subKelompok: masterCoa.subKelompok,
  classCf: masterCoa.classCf,
}

// GET /api/clients/[id]/coa
// Admin (klien mana pun) atau user pemilik klien tsb. Feeds badge status +
// preview struktur di Settings.
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

  const rows = await db
    .select({ ...coaColumns, updatedAt: masterCoa.updatedAt })
    .from(masterCoa)
    .where(eq(masterCoa.clientId, id))
    .orderBy(asc(masterCoa.kode))

  const updatedAt = rows.reduce<Date | null>(
    (latest, r) => (!latest || r.updatedAt > latest ? r.updatedAt : latest),
    null
  )
  const accounts = rows.map(({ updatedAt: _omit, ...rest }) => rest)

  return NextResponse.json({ count: accounts.length, updatedAt, accounts })
}

// POST /api/clients/[id]/coa — admin only. multipart/form-data { file }.
// Replace-all: hapus COA lama + insert baru dalam satu batch atomik.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await requireAdmin()
  if ('error' in g) return g.error

  const { id } = await params
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: 'ID klien tidak valid.' }, { status: 400 })
  }

  const [client] = await db.select({ id: clients.id }).from(clients).where(eq(clients.id, id)).limit(1)
  if (!client) {
    return NextResponse.json({ error: 'Klien tidak ditemukan.' }, { status: 404 })
  }

  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return NextResponse.json({ error: 'Body harus multipart/form-data.' }, { status: 400 })
  }

  const file = form.get('file')
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: 'File Excel tidak ditemukan di field "file".' }, { status: 400 })
  }
  if (file.size > MAX_FILE_BYTES) {
    return NextResponse.json({ error: 'Ukuran file melebihi 10MB.' }, { status: 400 })
  }

  const { rows, errors } = parseCoaWorkbook(await file.arrayBuffer())
  if (errors.length > 0) {
    return NextResponse.json(
      { error: 'Gagal memproses Excel — perbaiki file lalu upload ulang.', details: errors },
      { status: 400 }
    )
  }

  const values = rows.map(r => ({ clientId: id, ...r }))

  // neon-http tidak mendukung interactive transaction (db.transaction throw),
  // tapi db.batch() dieksekusi atomik sebagai satu Neon HTTP transaction.
  await db.batch([
    db.delete(masterCoa).where(eq(masterCoa.clientId, id)),
    db.insert(masterCoa).values(values),
  ])

  return NextResponse.json({ inserted: values.length, count: values.length }, { status: 200 })
}
