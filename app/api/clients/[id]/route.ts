import { NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { clients, users } from '@/lib/db/schema'
import { requireInternal, requireOwner } from '@/lib/api/guards'
import { dbWriteErrorResponse, isFkViolation } from '@/lib/api/db-errors'

export const runtime = 'nodejs'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Logo klien lazimnya jauh di bawah ini; batas dipasang supaya kolom bytea tidak
// dijejali file besar (dan supaya TOAST tetap sehat).
const MAX_LOGO_BYTES = 512 * 1024
const ALLOWED_LOGO_MIME = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']

const bad = (msg: string) => NextResponse.json({ error: msg }, { status: 400 })

// PATCH /api/clients/[id] — akunting ATAU owner.
// multipart/form-data: name?, type?, logo? (File), removeLogo? ('1')
// Dipakai form "Edit Klien" di Admin Overview.
// Mengubah nama/jenis/logo klien = mengelola entitas klien → requireInternal
// (owner, akunting, finance).
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await requireInternal()
  if ('error' in g) return g.error

  const { id } = await params
  if (!UUID_RE.test(id)) return bad('ID klien tidak valid.')

  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return bad('Body harus multipart/form-data.')
  }

  const [existing] = await db.select({ id: clients.id }).from(clients).where(eq(clients.id, id)).limit(1)
  if (!existing) return NextResponse.json({ error: 'Klien tidak ditemukan.' }, { status: 404 })

  const patch: Record<string, unknown> = { updatedAt: new Date() }

  const rawName = form.get('name')
  if (typeof rawName === 'string') {
    const name = rawName.trim()
    if (name.length < 2) return bad('Nama klien minimal 2 karakter.')
    patch.name = name
  }

  const rawType = form.get('type')
  if (typeof rawType === 'string') {
    const type = rawType.trim()
    if (!type) return bad('Jenis usaha wajib diisi.')
    patch.type = type
  }

  // Hapus logo eksplisit — dibedakan dari "tidak mengirim logo sama sekali"
  // (yang artinya: biarkan logo lama apa adanya).
  if (form.get('removeLogo') === '1') {
    patch.logo = null
    patch.logoMime = null
  }

  const file = form.get('logo')
  if (file instanceof File && file.size > 0) {
    if (!ALLOWED_LOGO_MIME.includes(file.type)) {
      return bad(`Format logo harus PNG, JPEG, WebP, atau SVG (dikirim: ${file.type || 'tidak dikenal'}).`)
    }
    if (file.size > MAX_LOGO_BYTES) {
      return bad(`Logo maksimal ${Math.round(MAX_LOGO_BYTES / 1024)}KB (file ini ${Math.round(file.size / 1024)}KB).`)
    }
    patch.logo = Buffer.from(await file.arrayBuffer())
    patch.logoMime = file.type
  }

  try {
    const [updated] = await db
      .update(clients)
      .set(patch)
      .where(eq(clients.id, id))
      .returning({ id: clients.id, name: clients.name, type: clients.type })
    return NextResponse.json(updated)
  } catch (e) {
    return dbWriteErrorResponse(e, 'Gagal menyimpan perubahan klien.')
  }
}

// DELETE /api/clients/[id] — akunting ATAU owner.
// Query: ?confirm=<nama klien persis> — pengaman ketik-nama.
//
// BLAST RADIUS (cascade, PERMANEN): master_coa, financial_reports →
// report_line_items, coa_mapping_history, client_metric_visibility,
// client_assignments. Karena itu ada dua lapis pengaman: nama harus diketik
// persis, dan akun viewer yang terpasang menghalangi penghapusan.
// OWNER SAJA (2026-08-06). Menghapus klien meng-cascade seluruh Master COA,
// laporan, riwayat mapping, dan setelannya. Sebelumnya akunting juga bisa;
// pengurangan itu DISENGAJA dan berdiri sendiri dari pertanyaan role finance.
// UI-nya (kebab Admin Overview) ikut digerbangi isOwner.
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await requireOwner()
  if ('error' in g) return g.error

  const { id } = await params
  if (!UUID_RE.test(id)) return bad('ID klien tidak valid.')

  const [client] = await db
    .select({ id: clients.id, name: clients.name })
    .from(clients)
    .where(eq(clients.id, id))
    .limit(1)
  if (!client) return NextResponse.json({ error: 'Klien tidak ditemukan.' }, { status: 404 })

  const confirm = new URL(req.url).searchParams.get('confirm') ?? ''
  if (confirm !== client.name) {
    return bad(`Konfirmasi tidak cocok. Ketik nama klien persis: "${client.name}".`)
  }

  // Akun viewer yang masih terpasang: users.clientId pakai onDelete RESTRICT,
  // jadi DELETE-nya akan gagal di level DB. Sengaja DITOLAK dengan pesan jelas,
  // BUKAN ikut menghapus akunnya diam-diam — menghapus akun orang sebagai efek
  // samping menghapus klien itu kejutan yang merusak. Admin yang memutuskan.
  const attached = await db
    .select({ email: users.email, name: users.name })
    .from(users)
    .where(eq(users.clientId, id))
  if (attached.length > 0) {
    return NextResponse.json(
      {
        error:
          `Klien "${client.name}" masih dipakai ${attached.length} akun viewer: ` +
          `${attached.map(u => u.email).join(', ')}. ` +
          'Hapus atau pindahkan akun itu dulu, baru klien ini bisa dihapus.',
        attachedUsers: attached,
      },
      { status: 409 }
    )
  }

  try {
    await db.delete(clients).where(eq(clients.id, id))
    return NextResponse.json({ id, name: client.name, deleted: true })
  } catch (e) {
    // Jaring pengaman kalau ada FK lain yang belum terpikirkan (mis. tabel baru
    // di masa depan) — jangan sampai jadi 500 mentah tanpa penjelasan.
    if (isFkViolation(e)) {
      return NextResponse.json(
        { error: `Klien "${client.name}" masih direferensikan data lain, jadi tidak bisa dihapus.` },
        { status: 409 }
      )
    }
    return dbWriteErrorResponse(e, 'Gagal menghapus klien.')
  }
}
