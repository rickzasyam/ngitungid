import { NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import type { BatchItem } from 'drizzle-orm/batch'
import { db } from '@/lib/db'
import { clients } from '@/lib/db/schema'
import { requireAkunting } from '@/lib/api/guards'
import { canAccessClientData } from '@/lib/roles'
import { dbWriteErrorResponse } from '@/lib/api/db-errors'
import { resolveUserId } from '@/lib/api/journal-queries'
import {
  rencanakanSimpanMutasi,
  type MasukanBaru,
  type MasukanBerkas,
  type MasukanHapus,
  type MasukanUbah,
} from '@/lib/api/cash-mutation-batch'

export const runtime = 'nodejs'
// 10.000 baris + jurnal ringkasan dalam satu db.batch — angka D52 dari uji beban S7.
export const maxDuration = 60

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const daftar = <T,>(v: unknown): T[] | null => (Array.isArray(v) ? (v as T[]) : v === undefined ? [] : null)

// POST /api/cash-mutations/batch — SATU jalur tulis mutasi kas (D48).
// { clientId, akunKasId, periode: { mulai, akhir }, baru[], ubah[], hapus[], berkas[], dryRun }
//
// Grid /mutasi-kas mengirim `diffKeBatch` (lib/mutasi-grid-state.ts) ke sini.
// Semua aturan ada di `rencanakanSimpanMutasi`; route ini hanya gerbang,
// pembaca body, dan eksekutor SATU db.batch. Galat dikembalikan per baris &
// per kolom; satu baris galat = nol statement (D47: tanpa simpan sebagian).
export async function POST(req: Request) {
  const g = await requireAkunting()
  if ('error' in g) return g.error

  let body: Record<string, unknown>
  try {
    body = ((await req.json()) ?? {}) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: 'Body harus JSON.' }, { status: 400 })
  }

  const clientId = typeof body.clientId === 'string' ? body.clientId : ''
  const akunKasId = typeof body.akunKasId === 'string' ? body.akunKasId : ''
  if (!UUID_RE.test(clientId)) return NextResponse.json({ error: 'clientId tidak valid.' }, { status: 400 })
  if (!UUID_RE.test(akunKasId)) return NextResponse.json({ error: 'Akun kas belum dipilih.' }, { status: 400 })
  if (!canAccessClientData(g.user.role, g.user.clientId, clientId)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const periodeRaw = (body.periode ?? null) as { mulai?: unknown; akhir?: unknown } | null
  if (!periodeRaw || typeof periodeRaw.mulai !== 'string' || typeof periodeRaw.akhir !== 'string') {
    return NextResponse.json({ error: 'Periode wajib dikirim — satu Simpan = satu akun-bulan (D52).' }, { status: 400 })
  }
  const baru = daftar<MasukanBaru>(body.baru)
  const ubah = daftar<MasukanUbah>(body.ubah)
  const hapus = daftar<MasukanHapus>(body.hapus)
  const berkas = daftar<MasukanBerkas>(body.berkas)
  if (!baru || !ubah || !hapus || !berkas) {
    return NextResponse.json({ error: 'baru, ubah, hapus, dan berkas harus berupa daftar.' }, { status: 400 })
  }

  const [client] = await db.select({ id: clients.id }).from(clients).where(eq(clients.id, clientId)).limit(1)
  if (!client) return NextResponse.json({ error: 'Klien tidak ditemukan.' }, { status: 404 })

  const userId = await resolveUserId(g.user.email)
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const rencana = await rencanakanSimpanMutasi(
    {
      clientId,
      akunKasId,
      periode: { mulai: periodeRaw.mulai, akhir: periodeRaw.akhir },
      baru,
      ubah,
      hapus,
      berkas,
      dryRun: body.dryRun === true,
    },
    userId
  )
  if (rencana.jenis === 'tolak') return NextResponse.json(rencana.body, { status: rencana.status })
  if (rencana.jenis === 'dryRun') return NextResponse.json(rencana.body)
  if (rencana.statements.length === 0) return NextResponse.json({ ...rencana.body, idBaru: {} })

  try {
    await db.batch(rencana.statements as [BatchItem<'pg'>, ...BatchItem<'pg'>[]])
  } catch (e) {
    return dbWriteErrorResponse(e, 'Gagal menyimpan mutasi kas. Tidak ada yang tersimpan — coba lagi.')
  }
  return NextResponse.json({ ...rencana.body, idBaru: Object.fromEntries(rencana.idBaru) })
}
