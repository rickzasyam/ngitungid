import { NextResponse } from 'next/server'
import { and, eq, gte } from 'drizzle-orm'
import { db } from '@/lib/db'
import { cashMutations } from '@/lib/db/schema'
import { requireInternal } from '@/lib/api/guards'
import { canAccessClientData } from '@/lib/roles'
import { hitungKena, validateAturanInput } from '@/lib/aturan-mutasi'
import { hariIniJakarta } from '@/lib/ymd'
import { tambahHari } from '@/lib/contracts'
import { toMinorUnits } from '@/lib/journal'

export const runtime = 'nodejs'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const HARI_UJI = 30
const BATAS_BARIS = 50_000

// GET /api/clients/[id]/cash-mutation-rules/uji?pola=&arah=&akunKasId=
//
// "Berapa baris yang akan kena" — pola diuji terhadap mutasi 30 hari terakhir
// (WIB) klien ini, dengan PENCOCOK YANG SAMA (`hitungKena` → normalizeKeterangan
// + includes). Hanya membaca; tidak ada yang ditulis, dan tidak ada SQL LIKE —
// pencocokan SQL akan memakai aturan normalisasi yang berbeda dari grid.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await requireInternal()
  if ('error' in g) return g.error

  const { id } = await params
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'ID klien tidak valid.' }, { status: 400 })
  if (!canAccessClientData(g.user.role, g.user.clientId, id)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const q = new URL(req.url).searchParams
  // Divalidasi dengan modul yang sama — akun lawan tidak relevan untuk uji, jadi
  // diisi uuid tiruan supaya hanya pola/arah/akun kas yang diperiksa.
  const check = validateAturanInput({
    pola: q.get('pola') ?? '',
    arah: q.get('arah') ?? 'keduanya',
    akunKasId: q.get('akunKasId') ?? null,
    akunLawanId: '00000000-0000-4000-8000-000000000000',
  })
  if (!check.ok) return NextResponse.json({ error: check.errors[0], details: check.errors }, { status: 400 })

  const sejak = tambahHari(hariIniJakarta(), -HARI_UJI)
  const rows = await db
    .select({
      keterangan: cashMutations.keterangan,
      debit: cashMutations.debit,
      akunKasId: cashMutations.akunKasId,
    })
    .from(cashMutations)
    .where(and(eq(cashMutations.clientId, id), gte(cashMutations.tanggal, sejak)))
    .limit(BATAS_BARIS)

  const hasil = hitungKena(
    check.value,
    rows.map(r => ({
      keterangan: r.keterangan,
      arah: (toMinorUnits(r.debit) ?? 0) > 0 ? ('masuk' as const) : ('keluar' as const),
      akunKasId: r.akunKasId,
    }))
  )
  return NextResponse.json({ sejak, diperiksa: rows.length, terpotong: rows.length >= BATAS_BARIS, ...hasil })
}
