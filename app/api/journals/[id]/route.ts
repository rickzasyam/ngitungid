import { NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import type { BatchItem } from 'drizzle-orm/batch'
import { db } from '@/lib/db'
import { journalEntries, journalLines } from '@/lib/db/schema'
import { requireAkunting } from '@/lib/api/guards'
import { canAccessClientData } from '@/lib/roles'
import { canEditJournal, validateJournalInput, JOURNAL_STATUS_LABEL } from '@/lib/journal'
import { dbWriteErrorResponse, isFkViolation, isUniqueViolation } from '@/lib/api/db-errors'
import {
  assertAccountsBelongToClient,
  loadJournalDetail,
  resolveUserId,
} from '@/lib/api/journal-queries'
import { purgeAuditEvents, recordJournalEvent } from '@/lib/api/audit'

export const runtime = 'nodejs'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Ambil BARIS DULU, baru periksa kliennya.
 *
 * Urutannya penting dan bukan selera: `clientId` tidak ada di URL, jadi
 * satu-satunya cara tahu jurnal ini milik siapa adalah membaca barisnya.
 * Memeriksa akses sebelum itu berarti memeriksa terhadap tebakan. Pola yang
 * sama dipakai route detail kontrak.
 */
async function guard(params: Promise<{ id: string }>) {
  const g = await requireAkunting()
  if ('error' in g) return { error: g.error }

  const { id } = await params
  if (!UUID_RE.test(id)) {
    return { error: NextResponse.json({ error: 'ID jurnal tidak valid.' }, { status: 400 }) }
  }

  const [row] = await db
    .select({
      id: journalEntries.id,
      clientId: journalEntries.clientId,
      noBukti: journalEntries.noBukti,
      status: journalEntries.status,
    })
    .from(journalEntries)
    .where(eq(journalEntries.id, id))
    .limit(1)
  if (!row) {
    return { error: NextResponse.json({ error: 'Jurnal tidak ditemukan.' }, { status: 404 }) }
  }
  if (!canAccessClientData(g.user.role, g.user.clientId, row.clientId)) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }
  // Usernya ikut dikembalikan: sejak Fase 2 setiap mutasi menulis riwayat, dan
  // riwayat tanpa "oleh siapa" adalah separuh riwayat.
  return { row, user: g.user }
}

/** Jurnal terposting tidak bisa diubah/dihapus — hanya dibalik (Fase 2, P11). */
function assertEditable(status: string): NextResponse | null {
  if (canEditJournal(status as 'draft' | 'posted')) return null
  const label = JOURNAL_STATUS_LABEL[status as 'draft' | 'posted'] ?? status
  return NextResponse.json(
    {
      error: `Jurnal berstatus ${label} tidak bisa diubah atau dihapus.`,
      details: ['Koreksi jurnal terposting dilakukan lewat jurnal balik, bukan dengan mengubah yang lama.'],
    },
    { status: 409 }
  )
}

// GET /api/journals/[id] — detail beserta barisnya.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await guard(params)
  if ('error' in g) return g.error

  const detail = await loadJournalDetail(g.row.id)
  if (!detail) return NextResponse.json({ error: 'Jurnal tidak ditemukan.' }, { status: 404 })
  return NextResponse.json(detail)
}

// PATCH /api/journals/[id] — ubah header + GANTI SELURUH barisnya.
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await guard(params)
  if ('error' in g) return g.error

  const blocked = assertEditable(g.row.status)
  if (blocked) return blocked

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Body harus JSON.' }, { status: 400 })
  }
  const raw = (body ?? {}) as Record<string, unknown>

  const check = validateJournalInput({
    tanggal: raw.tanggal,
    noBukti: raw.noBukti,
    keterangan: raw.keterangan,
    lines: raw.lines,
  })
  if (!check.ok) {
    return NextResponse.json({ error: check.errors[0], details: check.errors }, { status: 400 })
  }

  // clientId TIDAK diambil dari body — ia melekat pada jurnalnya dan tidak
  // boleh berpindah. Akunnya divalidasi terhadap klien milik barisnya.
  const accountGuard = await assertAccountsBelongToClient(check.value.lines, g.row.clientId)
  if (accountGuard) return accountGuard

  // Ganti himpunan baris anak dengan delete + insert di dalam SATU batch —
  // pola yang sama dengan PATCH kontrak. Bukan diff per baris: id baris jurnal
  // tidak punya makna di luar jurnalnya, jadi mempertahankannya tidak ada
  // gunanya dan justru menambah jalur yang bisa salah.
  const userId = await resolveUserId(g.user.email)

  const statements: BatchItem<'pg'>[] = [
    db
      .update(journalEntries)
      .set({
        tanggal: check.value.tanggal,
        noBukti: check.value.noBukti,
        keterangan: check.value.keterangan,
        updatedAt: new Date(),
      })
      .where(eq(journalEntries.id, g.row.id)),
    db.delete(journalLines).where(eq(journalLines.journalId, g.row.id)),
    db.insert(journalLines).values(
      check.value.lines.map(l => ({
        journalId: g.row.id,
        masterCoaId: l.masterCoaId,
        debit: l.debit,
        kredit: l.kredit,
        keterangan: l.keterangan,
        lineOrder: l.lineOrder,
      }))
    ),
    recordJournalEvent({
      clientId: g.row.clientId,
      journalId: g.row.id,
      event: 'updated',
      userId,
    }),
  ]

  try {
    await db.batch(statements as [BatchItem<'pg'>, ...BatchItem<'pg'>[]])
  } catch (e) {
    // Sama seperti POST: jurnal tanpa nomor bukti tidak bisa bentrok, jadi
    // pelanggaran unique di situ bukan soal nomor bukti dobel.
    if (isUniqueViolation(e) && check.value.noBukti !== null) {
      return NextResponse.json(
        { error: `Nomor bukti "${check.value.noBukti}" sudah dipakai jurnal lain di klien ini.` },
        { status: 409 }
      )
    }
    return dbWriteErrorResponse(e, 'Gagal menyimpan perubahan jurnal. Coba lagi.')
  }

  const detail = await loadJournalDetail(g.row.id)
  return NextResponse.json(detail)
}

// DELETE /api/journals/[id] — hapus draf. Barisnya ikut lewat FK cascade.
//
// ══ RIWAYATNYA TIDAK IKUT LEWAT FK — HARUS DIHAPUS DI SINI ════════════════
// `audit_events.entity_id` polimorfik, jadi tidak ada foreign key yang bisa
// meng-cascade-nya (R2). Penghapusan riwayat DIGABUNG ke db.batch yang sama
// dengan penghapusan jurnalnya: satu transaksi, dua-duanya jadi atau dua-duanya
// batal. Kalau dilepas jadi dua await terpisah, kegagalan di antaranya
// meninggalkan riwayat yang menunjuk jurnal yang sudah tidak ada — dan tidak
// ada satu pun batasan database yang akan mengeluh.
//
// Tidak ada event `deleted` yang ditulis: ia akan terhapus oleh purge yang sama
// dalam batch yang sama. Lihat catatan JOURNAL_EVENTS di lib/journal.ts.
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await guard(params)
  if ('error' in g) return g.error

  const blocked = assertEditable(g.row.status)
  if (blocked) return blocked

  const statements: BatchItem<'pg'>[] = [
    purgeAuditEvents('journal', g.row.id),
    db.delete(journalEntries).where(eq(journalEntries.id, g.row.id)),
  ]

  try {
    await db.batch(statements as [BatchItem<'pg'>, ...BatchItem<'pg'>[]])
  } catch (e) {
    // Jurnal yang sudah dibalik tidak bisa dihapus: reversal_of_id RESTRICT.
    // Hanya draf yang sampai ke sini, dan draf tidak bisa punya pembalik — tapi
    // jaringnya tetap dipasang, sama seperti hapus supplier.
    if (isFkViolation(e)) {
      return NextResponse.json(
        { error: 'Jurnal ini masih dirujuk jurnal lain (jurnal balik) dan tidak bisa dihapus.' },
        { status: 409 }
      )
    }
    return dbWriteErrorResponse(e, 'Gagal menghapus jurnal. Coba lagi.')
  }

  return NextResponse.json({ deleted: g.row.id, noBukti: g.row.noBukti })
}
