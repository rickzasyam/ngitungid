import { NextResponse } from 'next/server'
import { asc, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { clients, masterCoa, reportLineItems } from '@/lib/db/schema'
import { requireAkunting, requireUser } from '@/lib/api/guards'
import { canAccessClientData } from '@/lib/roles'
import { parseCoaWorkbook } from '@/lib/coa-import'
import { dbWriteErrorResponse, isFkViolation } from '@/lib/api/db-errors'

// xlsx parsing + neon-http butuh Node runtime (bukan edge).
export const runtime = 'nodejs'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MAX_FILE_BYTES = 10 * 1024 * 1024 // 10MB — Master COA selalu file kecil

const coaColumns = {
  // id ikut dikirim: /coa-mapping butuh masterCoaId untuk menyimpan mapping.
  id: masterCoa.id,
  kode: masterCoa.kode,
  nama: masterCoa.nama,
  posisi: masterCoa.posisi,
  kelompok: masterCoa.kelompok,
  subKelompok: masterCoa.subKelompok,
  classCf: masterCoa.classCf,
}

// GET /api/clients/[id]/coa — READ Master COA. Dipakai Settings (tab Master COA,
// read-only untuk user) & dropdown COA di /coa-mapping (staf). requireUser: role
// 'user' (klien) boleh melihat COA KLIEN-NYA SENDIRI (scoping canAccessClientData
// di bawah); staf boleh klien mana pun. IMPORT/tulis = POST di bawah, tetap
// requireAkunting — jangan ikut kebuka.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await requireUser()
  if ('error' in g) return g.error

  const { id } = await params
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: 'ID klien tidak valid.' }, { status: 400 })
  }
  // Scoping ANTAR-klien: user hanya COA klien-nya sendiri; staf tak dibatasi.
  if (!canAccessClientData(g.user.role, g.user.clientId, id)) {
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
  const g = await requireAkunting()
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

  const { rows, errors, warnings } = parseCoaWorkbook(await file.arrayBuffer())
  if (errors.length > 0) {
    return NextResponse.json(
      { error: 'Gagal memproses Excel — perbaiki file lalu upload ulang.', details: errors },
      { status: 400 }
    )
  }

  const values = rows.map(r => ({ clientId: id, ...r }))

  // neon-http tidak mendukung interactive transaction (db.transaction throw),
  // tapi db.batch() dieksekusi atomik sebagai satu Neon HTTP transaction.
  // Replace-all menghapus SEMUA master_coa klien; kalau ada report_line_items
  // yang masih memetakan ke salah satunya, FK onDelete:'restrict' menolak
  // DELETE (SQLSTATE 23503). Tangkap → 409 yang jelas & bisa ditindaklanjuti,
  // bukan 500 mentah tanpa body.
  try {
    await db.batch([
      db.delete(masterCoa).where(eq(masterCoa.clientId, id)),
      db.insert(masterCoa).values(values),
    ])
  } catch (e) {
    if (isFkViolation(e)) {
      const refs = await db
        .select({ reportId: reportLineItems.reportId })
        .from(reportLineItems)
        .innerJoin(masterCoa, eq(reportLineItems.masterCoaId, masterCoa.id))
        .where(eq(masterCoa.clientId, id))
      const lineCount = refs.length
      const reportCount = new Set(refs.map(r => r.reportId)).size
      return NextResponse.json(
        {
          error: 'Master COA tidak bisa diganti karena masih dipakai laporan yang sudah dipetakan.',
          details: [
            `${lineCount} baris di ${reportCount} laporan masih memetakan ke Master COA lama.`,
            'Kosongkan mapping atau hapus laporan tersebut lebih dulu, lalu ganti Master COA.',
          ],
        },
        { status: 409 }
      )
    }
    return dbWriteErrorResponse(e, 'Gagal menyimpan Master COA. Coba lagi.')
  }

  return NextResponse.json(
    { inserted: values.length, count: values.length, warnings: warnings ?? [] },
    { status: 200 }
  )
}
