import { NextResponse } from 'next/server'
import { asc, desc, eq } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { db } from '@/lib/db'
import { cashMutationRules, clients, masterCoa } from '@/lib/db/schema'
import { requireAkunting, requireInternal } from '@/lib/api/guards'
import { canAccessClientData } from '@/lib/roles'
import { dbWriteErrorResponse } from '@/lib/api/db-errors'
import { resolveUserId } from '@/lib/api/journal-queries'
import { validateAturanInput } from '@/lib/aturan-mutasi'
import { assertAkunAturanMilikKlien } from '@/lib/api/cash-mutation-rule-queries'

export const runtime = 'nodejs'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// GET /api/clients/[id]/cash-mutation-rules — aturan akun lawan klien (D57).
//
// ══ BACA = requireInternal (owner/akunting/finance), TULIS = requireAkunting ══
// Pembelahan yang sama dengan Supplier (R4): finance melihat tab "Aturan
// Mutasi" read-only, klien tidak melihatnya sama sekali. Menyembunyikan tab
// bukan kontrol keamanan — yang menegakkan adalah penjaga di sini.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await requireInternal()
  if ('error' in g) return g.error

  const { id } = await params
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'ID klien tidak valid.' }, { status: 400 })
  if (!canAccessClientData(g.user.role, g.user.clientId, id)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const akunLawan = alias(masterCoa, 'akun_lawan')
  const akunKas = alias(masterCoa, 'akun_kas')
  const rows = await db
    .select({
      id: cashMutationRules.id,
      pola: cashMutationRules.pola,
      arah: cashMutationRules.arah,
      akunLawanId: cashMutationRules.akunLawanId,
      akunLawanKode: akunLawan.kode,
      akunLawanNama: akunLawan.nama,
      akunKasId: cashMutationRules.akunKasId,
      akunKasKode: akunKas.kode,
      akunKasNama: akunKas.nama,
      prioritas: cashMutationRules.prioritas,
      aktif: cashMutationRules.aktif,
      updatedAt: cashMutationRules.updatedAt,
    })
    .from(cashMutationRules)
    .innerJoin(akunLawan, eq(cashMutationRules.akunLawanId, akunLawan.id))
    .leftJoin(akunKas, eq(cashMutationRules.akunKasId, akunKas.id))
    .where(eq(cashMutationRules.clientId, id))
    .orderBy(desc(cashMutationRules.prioritas), asc(cashMutationRules.pola))

  return NextResponse.json({ count: rows.length, rules: rows })
}

// POST /api/clients/[id]/cash-mutation-rules — tambah satu aturan.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await requireAkunting()
  if ('error' in g) return g.error

  const { id } = await params
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'ID klien tidak valid.' }, { status: 400 })
  if (!canAccessClientData(g.user.role, g.user.clientId, id)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json().catch(() => null)
  const check = validateAturanInput((body ?? {}) as Record<string, unknown>)
  if (!check.ok) return NextResponse.json({ error: check.errors[0], details: check.errors }, { status: 400 })

  const [client] = await db.select({ id: clients.id }).from(clients).where(eq(clients.id, id)).limit(1)
  if (!client) return NextResponse.json({ error: 'Klien tidak ditemukan.' }, { status: 404 })

  const salahAkun = await assertAkunAturanMilikKlien(check.value, id)
  if (salahAkun) return salahAkun

  const userId = await resolveUserId(g.user.email)
  if (!userId) return NextResponse.json({ error: 'Pengguna tidak dikenali.' }, { status: 401 })

  try {
    const [row] = await db
      .insert(cashMutationRules)
      .values({ clientId: id, ...check.value, createdBy: userId })
      .returning({ id: cashMutationRules.id })
    return NextResponse.json({ rule: row }, { status: 201 })
  } catch (e) {
    return dbWriteErrorResponse(e, 'Gagal menyimpan aturan mutasi. Coba lagi.')
  }
}
