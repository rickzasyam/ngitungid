import { NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { and, asc, desc, eq, gte, lte, sql } from 'drizzle-orm'
import type { BatchItem } from 'drizzle-orm/batch'
import { db } from '@/lib/db'
import { clients, journalEntries, journalLines, users } from '@/lib/db/schema'
import { requireAkunting } from '@/lib/api/guards'
import { canAccessClientData } from '@/lib/roles'
import { isValidYmd } from '@/lib/contracts'
import { validateJournalInput } from '@/lib/journal'
import { dbWriteErrorResponse, isUniqueViolation } from '@/lib/api/db-errors'
import {
  assertAccountsBelongToClient,
  loadJournalDetail,
  resolveUserId,
} from '@/lib/api/journal-queries'

export const runtime = 'nodejs'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// GET /api/journals?clientId&periodStart&periodEnd — daftar jurnal per periode.
//
// ══ KENAPA BACA JUGA requireAkunting, BUKAN requireUser ═══════════════════
// P7 menetapkan pola umum "baca = requireUser + canAccessClientData", tapi pola
// itu untuk surface yang memang boleh dilihat klien (Dashboard, Laporan).
// /jurnal masuk ACCOUNTING_ONLY_PREFIXES (D3) — halamannya tertutup untuk klien
// DAN untuk finance. Kalau API-nya requireUser, gerbang halaman itu jadi
// kosmetik: akun klien tetap bisa menarik seluruh jurnal lewat API.
//
// Ini persis alasan yang sudah dipakai R4 untuk daftar supplier ("bukan
// requireUser, agar akun klien tidak bisa menarik daftarnya lewat API"), dan
// gagal-tertutup lebih mudah dilonggarkan nanti daripada kebocoran yang sudah
// terlanjur dipakai. canAccessClientData tetap dipanggil: batas antar-klien
// harus dinyatakan, bukan diwarisi dari kebetulan daftar role.
export async function GET(req: Request) {
  const g = await requireAkunting()
  if ('error' in g) return g.error

  const url = new URL(req.url)
  const clientId = url.searchParams.get('clientId') ?? ''
  const periodStart = url.searchParams.get('periodStart') ?? ''
  const periodEnd = url.searchParams.get('periodEnd') ?? ''

  if (!UUID_RE.test(clientId)) {
    return NextResponse.json({ error: 'clientId tidak valid.' }, { status: 400 })
  }
  if (!isValidYmd(periodStart) || !isValidYmd(periodEnd)) {
    return NextResponse.json({ error: 'Periode tidak valid (format YYYY-MM-DD).' }, { status: 400 })
  }
  // Perbandingan STRING — 'YYYY-MM-DD' urut leksikografis (lihat lib/contracts.ts).
  if (periodEnd < periodStart) {
    return NextResponse.json({ error: 'Periode akhir tidak boleh sebelum periode mulai.' }, { status: 400 })
  }
  if (!canAccessClientData(g.user.role, g.user.clientId, clientId)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Total dijumlahkan DI POSTGRES lalu dikembalikan sebagai string lewat cast
  // numeric(18,2)::text — nilainya tidak pernah melewati float JS (P1), dan
  // bentuknya selalu dua desimal sehingga sama dengan yang ditulis route POST.
  // leftJoin, bukan innerJoin: jurnal tanpa baris (mustahil lewat API ini, tapi
  // mungkin lewat jalur lain) tetap muncul dengan total 0 alih-alih menghilang.
  const rows = await db
    .select({
      id: journalEntries.id,
      tanggal: journalEntries.tanggal,
      noBukti: journalEntries.noBukti,
      keterangan: journalEntries.keterangan,
      sumber: journalEntries.sumber,
      status: journalEntries.status,
      createdAt: journalEntries.createdAt,
      createdByName: users.name,
      totalDebit: sql<string>`coalesce(sum(${journalLines.debit}), 0)::numeric(18,2)::text`,
      lineCount: sql<number>`count(${journalLines.id})::int`,
    })
    .from(journalEntries)
    .innerJoin(users, eq(journalEntries.createdBy, users.id))
    .leftJoin(journalLines, eq(journalLines.journalId, journalEntries.id))
    .where(
      and(
        eq(journalEntries.clientId, clientId),
        gte(journalEntries.tanggal, periodStart),
        lte(journalEntries.tanggal, periodEnd)
      )
    )
    .groupBy(journalEntries.id, users.name)
    .orderBy(desc(journalEntries.tanggal), asc(journalEntries.noBukti))

  return NextResponse.json({ count: rows.length, journals: rows })
}

// POST /api/journals — buat jurnal draf beserta barisnya.
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

  const check = validateJournalInput({
    tanggal: raw.tanggal,
    noBukti: raw.noBukti,
    keterangan: raw.keterangan,
    lines: raw.lines,
  })
  if (!check.ok) {
    return NextResponse.json(
      { error: check.errors[0], details: check.errors },
      { status: 400 }
    )
  }

  const [client] = await db.select({ id: clients.id }).from(clients).where(eq(clients.id, clientId)).limit(1)
  if (!client) return NextResponse.json({ error: 'Klien tidak ditemukan.' }, { status: 404 })

  const guard = await assertAccountsBelongToClient(check.value.lines, clientId)
  if (guard) return guard

  const createdBy = await resolveUserId(g.user.email)
  if (!createdBy) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Id dibuat DI SINI supaya header + baris muat dalam satu db.batch (satu
  // transaksi HTTP): baris tidak perlu menunggu hasil INSERT header.
  const journalId = randomUUID()
  const statements: BatchItem<'pg'>[] = [
    db.insert(journalEntries).values({
      id: journalId,
      clientId,
      tanggal: check.value.tanggal,
      noBukti: check.value.noBukti,
      keterangan: check.value.keterangan,
      createdBy,
    }),
    db.insert(journalLines).values(
      check.value.lines.map(l => ({
        journalId,
        masterCoaId: l.masterCoaId,
        debit: l.debit,
        kredit: l.kredit,
        keterangan: l.keterangan,
        lineOrder: l.lineOrder,
      }))
    ),
  ]

  try {
    await db.batch(statements as [BatchItem<'pg'>, ...BatchItem<'pg'>[]])
  } catch (e) {
    if (isUniqueViolation(e)) {
      return NextResponse.json(
        { error: `Nomor bukti "${check.value.noBukti}" sudah dipakai jurnal lain di klien ini.` },
        { status: 409 }
      )
    }
    return dbWriteErrorResponse(e, 'Gagal menyimpan jurnal. Coba lagi.')
  }

  const detail = await loadJournalDetail(journalId)
  return NextResponse.json(detail, { status: 201 })
}
