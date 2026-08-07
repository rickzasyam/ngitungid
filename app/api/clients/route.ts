import { NextResponse } from 'next/server'
import { asc, eq, inArray, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { clients, financialReports } from '@/lib/db/schema'
import { requireInternal, requireUser } from '@/lib/api/guards'

// hasLogo (bukan bytea-nya) supaya UI tahu harus render <img> atau inisial tanpa
// menarik logonya untuk tiap klien. updatedAt dipakai sebagai cache-buster
// (?v=) pada URL logo — tanpa itu logo lama nyangkut di cache setelah diganti.
const clientColumns = {
  id: clients.id,
  name: clients.name,
  type: clients.type,
  hasLogo: sql<boolean>`${clients.logo} is not null`,
  updatedAt: clients.updatedAt,
}

/**
 * Bulan-bulan yang punya laporan, per klien: 'YYYY-MM' + berapa JENIS laporan
 * yang sudah masuk (maks 3). Jadi bahan indikator progres di kartu sidebar.
 *
 * `to_char` dijalankan di SQL, BUKAN dengan mengonversi Date di JS: kolomnya
 * bertipe `date`, dan driver mengembalikannya sebagai Date tengah malam yang
 * kalau di-toISOString bergeser sehari di WIB — cukup untuk melempar periode
 * Januari ke Desember.
 *
 * Satu query ber-group-by untuk SEMUA klien sekaligus; endpoint ini sendiri
 * hanya dipanggil sekali oleh ClientProvider, jadi tidak ada request tambahan
 * dan tidak ada query per-render.
 */
async function monthsByClient(clientIds: string[]): Promise<Record<string, { m: string; types: number }[]>> {
  if (clientIds.length === 0) return {}
  const rows = await db
    .select({
      clientId: financialReports.clientId,
      m: sql<string>`to_char(${financialReports.periodStart}, 'YYYY-MM')`,
      types: sql<number>`count(distinct ${financialReports.reportType})`.mapWith(Number),
    })
    .from(financialReports)
    .where(inArray(financialReports.clientId, clientIds))
    .groupBy(financialReports.clientId, sql`to_char(${financialReports.periodStart}, 'YYYY-MM')`)

  const out: Record<string, { m: string; types: number }[]> = {}
  for (const r of rows) (out[r.clientId] ??= []).push({ m: r.m, types: r.types })
  return out
}

// GET /api/clients
// Admin → semua klien (urut nama). User → hanya klien miliknya sendiri.
// Satu endpoint ini yang memberi makan client-context untuk kedua role.
export async function GET() {
  const g = await requireUser()
  if ('error' in g) return g.error

  if (g.user.role === 'user') {
    if (!g.user.clientId) return NextResponse.json([])
    const rows = await db
      .select(clientColumns)
      .from(clients)
      .where(eq(clients.id, g.user.clientId))
      .limit(1)
    const months = await monthsByClient(rows.map(r => r.id))
    return NextResponse.json(rows.map(r => ({ ...r, months: months[r.id] ?? [] })))
  }

  const rows = await db.select(clientColumns).from(clients).orderBy(asc(clients.name))
  const months = await monthsByClient(rows.map(r => r.id))
  return NextResponse.json(rows.map(r => ({ ...r, months: months[r.id] ?? [] })))
}

// POST /api/clients — akunting/owner. Body { name, type }.
// Membuat klien = mengelola klien sebagai ENTITAS, bukan pekerjaan akunting.
// requireInternal: owner, akunting, DAN finance — finance memang yang
// meng-onboard klien baru.
export async function POST(req: Request) {
  const g = await requireInternal()
  if ('error' in g) return g.error

  const body = (await req.json().catch(() => null)) as { name?: unknown; type?: unknown } | null
  const name = typeof body?.name === 'string' ? body.name.trim() : ''
  const type = typeof body?.type === 'string' ? body.type.trim() : ''

  if (!name || !type) {
    return NextResponse.json({ error: 'Nama dan jenis klien wajib diisi.' }, { status: 400 })
  }

  // returning() dengan kolom biasa; hasLogo klien baru selalu false (belum ada
  // logo) → ditambahkan manual supaya bentuknya sama dengan GET (ClientInfo).
  const [created] = await db
    .insert(clients)
    .values({ name, type })
    .returning({ id: clients.id, name: clients.name, type: clients.type, updatedAt: clients.updatedAt })
  return NextResponse.json({ ...created, hasLogo: false }, { status: 201 })
}
