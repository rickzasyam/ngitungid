import { NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import type { BatchItem } from 'drizzle-orm/batch'
import { db } from '@/lib/db'
import { cashMutations, clients } from '@/lib/db/schema'
import { requireAkunting, requireInternal } from '@/lib/api/guards'
import { canAccessClientData } from '@/lib/roles'
import { isValidYmd } from '@/lib/contracts'
import { fingerprintMutasi, validateCashMutation } from '@/lib/cash-mutation'
import { dbWriteErrorResponse } from '@/lib/api/db-errors'
import { resolveUserId } from '@/lib/api/journal-queries'
import {
  assertAccountBelongsToClient,
  listCashMutations,
  loadCashAccount,
  loadMutationDetail,
  recordMutationEvent,
  syncMutationJournal,
} from '@/lib/api/cash-mutation-queries'
import { tolakBilaPeriodeTerkunci } from '@/lib/api/period-lock'

export const runtime = 'nodejs'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// GET /api/cash-mutations?clientId&periodStart&periodEnd[&akunKasId]
//
// ══ requireInternal UNTUK BACA, requireAkunting UNTUK TULIS (D45) ═════════
// Sama dengan /api/purchase-invoices: `/mutasi-kas` masuk INTERNAL_ONLY_PREFIXES,
// jadi finance boleh MELIHAT arus kas klien dan mengunduhnya, tapi tidak
// menulis. Klien tidak melihat modul ini sama sekali.
export async function GET(req: Request) {
  const g = await requireInternal()
  if ('error' in g) return g.error

  const url = new URL(req.url)
  const clientId = url.searchParams.get('clientId') ?? ''
  const periodStart = url.searchParams.get('periodStart') ?? ''
  const periodEnd = url.searchParams.get('periodEnd') ?? ''
  const akunKasId = url.searchParams.get('akunKasId') ?? ''

  if (!UUID_RE.test(clientId)) {
    return NextResponse.json({ error: 'clientId tidak valid.' }, { status: 400 })
  }
  if (!isValidYmd(periodStart) || !isValidYmd(periodEnd)) {
    return NextResponse.json({ error: 'Periode tidak valid (format YYYY-MM-DD).' }, { status: 400 })
  }
  // Perbandingan STRING — 'YYYY-MM-DD' urut leksikografis (lib/contracts.ts).
  if (periodEnd < periodStart) {
    return NextResponse.json(
      { error: 'Periode akhir tidak boleh sebelum periode mulai.' },
      { status: 400 }
    )
  }
  if (akunKasId !== '' && !UUID_RE.test(akunKasId)) {
    return NextResponse.json({ error: 'akunKasId tidak valid.' }, { status: 400 })
  }
  if (!canAccessClientData(g.user.role, g.user.clientId, clientId)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const mutations = await listCashMutations({
    clientId,
    periodStart,
    periodEnd,
    akunKasId: akunKasId || undefined,
  })
  return NextResponse.json({ count: mutations.length, mutations })
}

// POST /api/cash-mutations — mutasi MANUAL (impor CSV lewat route sendiri).
//
// ══ JURNALNYA LAHIR HANYA BILA SUDAH ADA LAWANNYA ════════════════════════
// Mutasi tanpa akun lawan dan tanpa alokasi berstatus "belum dijurnal" — itu
// keadaan yang SAH dan memang harus terlihat di layar (permintaan eksplisit
// Ricko). Membuat jurnal timpang untuk mutasi semacam itu akan menaruh angka
// separuh di buku besar.
export async function POST(req: Request) {
  const g = await requireAkunting()
  if ('error' in g) return g.error

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Body harus JSON.' }, { status: 400 })
  }
  const raw = (body ?? {}) as Record<string, unknown>

  const clientId = typeof raw.clientId === 'string' ? raw.clientId : ''
  if (!UUID_RE.test(clientId)) {
    return NextResponse.json({ error: 'clientId tidak valid.' }, { status: 400 })
  }
  if (!canAccessClientData(g.user.role, g.user.clientId, clientId)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const [client] = await db.select({ id: clients.id }).from(clients).where(eq(clients.id, clientId)).limit(1)
  if (!client) return NextResponse.json({ error: 'Klien tidak ditemukan.' }, { status: 404 })

  const check = validateCashMutation({
    tanggal: raw.tanggal,
    akunKasId: raw.akunKasId,
    debit: raw.debit,
    kredit: raw.kredit,
    keterangan: raw.keterangan,
    saldo: raw.saldo,
    akunLawanId: raw.akunLawanId,
  })
  if (!check.ok) {
    return NextResponse.json({ error: check.errors[0], details: check.errors }, { status: 400 })
  }
  const terkunci = await tolakBilaPeriodeTerkunci(clientId, [check.value.tanggal])
  if (terkunci) return terkunci

  // Akun kas HARUS bertanda is_kas (E1–E3), bukan akun sembarang: daftar di
  // layar disaring dengan aturan yang sama, jadi apa pun yang lolos ke sini
  // tanpa penanda itu datang dari luar layar.
  const akunKas = await loadCashAccount(clientId, check.value.akunKasId)
  if (!akunKas) {
    return NextResponse.json(
      {
        error: 'Akun kas tidak ditemukan pada klien ini, atau bukan akun kas/bank.',
        details: ['Tandai akunnya sebagai akun kas/bank di Settings › Master COA.'],
      },
      { status: 400 }
    )
  }
  if (check.value.akunLawanId) {
    const salah = await assertAccountBelongsToClient(check.value.akunLawanId, clientId)
    if (salah) return salah
  }

  const createdBy = await resolveUserId(g.user.email)
  if (!createdBy) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const mutationId = randomUUID()
  const fingerprint = fingerprintMutasi(check.value)

  const jurnal = await syncMutationJournal({
    mutation: {
      id: mutationId,
      clientId,
      akunKasId: check.value.akunKasId,
      akunLawanId: check.value.akunLawanId,
      tanggal: check.value.tanggal,
      keterangan: check.value.keterangan,
      debit: check.value.debit,
      kredit: check.value.kredit,
      journalId: null,
    },
    alokasi: [],
    userId: createdBy,
  })
  if ('error' in jurnal) return jurnal.error

  const statements: BatchItem<'pg'>[] = [
    db.insert(cashMutations).values({
      id: mutationId,
      clientId,
      akunKasId: check.value.akunKasId,
      tanggal: check.value.tanggal,
      keterangan: check.value.keterangan,
      debit: check.value.debit,
      kredit: check.value.kredit,
      saldo: check.value.saldo,
      fingerprint,
      akunLawanId: check.value.akunLawanId,
      createdBy,
    }),
    // Statement jurnal menyusul SESUDAH mutasinya ada: ia memuat UPDATE atas
    // baris mutasi (memasang journal_id), dan update terhadap baris yang belum
    // lahir tidak melakukan apa pun tanpa melempar.
    ...jurnal.statements,
    recordMutationEvent({ clientId, mutationId, event: 'created', userId: createdBy }),
  ]

  try {
    await db.batch(statements as [BatchItem<'pg'>, ...BatchItem<'pg'>[]])
  } catch (e) {
    return dbWriteErrorResponse(e, 'Gagal menyimpan mutasi kas. Coba lagi.')
  }

  const detail = await loadMutationDetail(mutationId)
  return NextResponse.json(detail, { status: 201 })
}
