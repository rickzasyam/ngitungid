import { NextResponse } from 'next/server'
import type { BatchItem } from 'drizzle-orm/batch'
import { db } from '@/lib/db'
import { requireAkunting, requireInternal } from '@/lib/api/guards'
import { canAccessClientData, type Role } from '@/lib/roles'
import { validateCashMutation } from '@/lib/cash-mutation'
import { dbWriteErrorResponse } from '@/lib/api/db-errors'
import { resolveUserId } from '@/lib/api/journal-queries'
import {
  assertAccountBelongsToClient,
  loadCashAccount,
  loadMutationDetail,
  loadMutationForWrite,
} from '@/lib/api/cash-mutation-queries'
import { tolakBilaPeriodeTerkunci } from '@/lib/api/period-lock'
import { jawabanTunggal, rencanakanSimpanMutasi, type PermintaanSimpan } from '@/lib/api/cash-mutation-batch'

export const runtime = 'nodejs'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Mutasi + pemeriksaan akses. Barisnya dibaca DULU, baru kliennya diperiksa —
 * tanpa barisnya kita tidak tahu klien mana yang harus diperiksa (pola yang
 * sama dengan route detail jurnal).
 */
async function guardMutation(id: string, role: Role, userClientId: string | null) {
  if (!UUID_RE.test(id)) {
    return { error: NextResponse.json({ error: 'ID mutasi tidak valid.' }, { status: 400 }) }
  }
  const row = await loadMutationForWrite(id)
  if (!row) {
    return { error: NextResponse.json({ error: 'Mutasi tidak ditemukan.' }, { status: 404 }) }
  }
  if (!canAccessClientData(role, userClientId, row.clientId)) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }
  return { row }
}

// GET /api/cash-mutations/[id] — detail beserta alokasi, sisa, dan status.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await requireInternal()
  if ('error' in g) return g.error

  const { id } = await params
  const guard = await guardMutation(id, g.user.role, g.user.clientId)
  if ('error' in guard) return guard.error

  const detail = await loadMutationDetail(id)
  if (!detail) return NextResponse.json({ error: 'Mutasi tidak ditemukan.' }, { status: 404 })
  return NextResponse.json(detail)
}

/** Jalankan rencana satu baris (pembungkus form) — bentuk jawaban lama. */
async function simpanSatu(p: PermintaanSimpan, userId: string): Promise<NextResponse | null> {
  const rencana = await rencanakanSimpanMutasi(p, userId)
  if (rencana.jenis === 'tolak') {
    const j = jawabanTunggal(rencana)
    return NextResponse.json(j.body, { status: j.status })
  }
  if (rencana.jenis !== 'siap') return NextResponse.json({ error: 'Rencana tidak lengkap.' }, { status: 500 })
  try {
    await db.batch(rencana.statements as [BatchItem<'pg'>, ...BatchItem<'pg'>[]])
  } catch (e) {
    return dbWriteErrorResponse(e, 'Gagal menyimpan mutasi. Coba lagi.')
  }
  return null
}

// PATCH /api/cash-mutations/[id] — pembungkus tipis atas perencana batch (D48).
//
// Aturannya identik dengan grid: `kunciMutasi` (jurnal terposting yang belum
// dibalik mengunci seluruh baris — setelan D42 tidak membukanya; alokasi
// mengunci nominal & akun kas), jurnal ringkasan per (akun kas, akun lawan,
// tanggal) dibangun ulang untuk kunci LAMA dan BARU di batch yang sama (P10),
// riwayat `updated` membawa nilai sebelum/sesudah.
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await requireAkunting()
  if ('error' in g) return g.error

  const { id } = await params
  const guard = await guardMutation(id, g.user.role, g.user.clientId)
  if ('error' in guard) return guard.error
  const { row } = guard

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Body harus JSON.' }, { status: 400 })
  }
  const raw = (body ?? {}) as Record<string, unknown>

  const check = validateCashMutation({
    tanggal: raw.tanggal,
    akunKasId: raw.akunKasId,
    debit: raw.debit,
    kredit: raw.kredit,
    keterangan: raw.keterangan,
    saldo: raw.saldo,
    akunLawanId: raw.akunLawanId,
    catatan: raw.catatan,
    ref: raw.ref,
  })
  if (!check.ok) {
    return NextResponse.json({ error: check.errors[0], details: check.errors }, { status: 400 })
  }
  const terkunci = await tolakBilaPeriodeTerkunci(row.clientId, [row.tanggal, check.value.tanggal])
  if (terkunci) return terkunci

  const akunKas = await loadCashAccount(row.clientId, check.value.akunKasId)
  if (!akunKas) {
    return NextResponse.json(
      { error: 'Akun kas tidak ditemukan pada klien ini, atau bukan akun kas/bank.' },
      { status: 400 }
    )
  }
  if (check.value.akunLawanId) {
    const salah = await assertAccountBelongsToClient(check.value.akunLawanId, row.clientId)
    if (salah) return salah
  }

  const userId = await resolveUserId(g.user.email)
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const gagal = await simpanSatu(
    {
      clientId: row.clientId,
      akunKasId: check.value.akunKasId,
      periode: null,
      baru: [],
      ubah: [
        {
          id,
          // Form satu-satu tidak membawa updatedAt: yang dibandingkan adalah
          // baris yang baru saja dibaca, jadi konkurensinya tidak diperiksa di
          // sini — sama dengan PATCH sebelum S7.
          updatedAt: row.updatedAt.toISOString(),
          tanggal: check.value.tanggal,
          debit: check.value.debit,
          kredit: check.value.kredit,
          saldo: check.value.saldo,
          keterangan: check.value.keterangan,
          catatan: check.value.catatan,
          ref: check.value.ref,
          akunLawanId: check.value.akunLawanId,
          akunKasId: check.value.akunKasId,
          saldoDikosongkan: null,
        },
      ],
      hapus: [],
      berkas: [],
      dryRun: false,
    },
    userId
  )
  if (gagal) return gagal

  const detail = await loadMutationDetail(id)
  return NextResponse.json(detail)
}

// DELETE /api/cash-mutations/[id] — pembungkus tipis atas perencana batch (D48).
//
// Aturannya tidak berubah dari sebelum S7, hanya pindah tempat: jurnal
// terposting yang belum dibalik menahan (409; setelan D42 tidak membuka
// penghapusan); jurnal yang sudah dibalik tidak ikut dihapus — ia riwayat buku
// besar; draf miliknya sendiri dihapus beserta riwayatnya; riwayat mutasi ikut
// mati (mutasi bukan pengecualian riwayat abadi, lib/audit.ts); alokasi ikut
// lewat FK cascade. Bila ia anggota jurnal RINGKASAN, kuncinya dibangun ulang
// tanpanya di batch yang sama.
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await requireAkunting()
  if ('error' in g) return g.error

  const { id } = await params
  const guard = await guardMutation(id, g.user.role, g.user.clientId)
  if ('error' in guard) return guard.error
  const { row } = guard
  const terkunci = await tolakBilaPeriodeTerkunci(row.clientId, [row.tanggal])
  if (terkunci) return terkunci

  const userId = await resolveUserId(g.user.email)
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const gagal = await simpanSatu(
    {
      clientId: row.clientId,
      akunKasId: row.akunKasId,
      periode: null,
      baru: [],
      ubah: [],
      hapus: [{ id, updatedAt: row.updatedAt.toISOString() }],
      berkas: [],
      dryRun: false,
    },
    userId
  )
  if (gagal) return gagal

  return NextResponse.json({ ok: true })
}
