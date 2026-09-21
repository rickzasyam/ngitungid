import { NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import type { BatchItem } from 'drizzle-orm/batch'
import { db } from '@/lib/db'
import { journalEntries, journalLines } from '@/lib/db/schema'
import { bolehEditPosting } from '@/lib/accounting-settings'
import { loadAccountingSettings } from '@/lib/api/accounting-settings'
import { periodLockChecker } from '@/lib/api/period-lock'
import { requireAkunting } from '@/lib/api/guards'
import { canAccessClientData } from '@/lib/roles'
import {
  canEditJournal,
  validateJournalInput,
  isSumberModul,
  SUMBER_MODUL_LABEL,
  JOURNAL_STATUS_LABEL,
} from '@/lib/journal'
import { dbWriteErrorResponse, isFkViolation, isUniqueViolation } from '@/lib/api/db-errors'
import {
  assertAccountsBelongToClient,
  findPostedReversal,
  loadJournalDetail,
  loadJournalLineValues,
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
      sumber: journalEntries.sumber,
      tanggal: journalEntries.tanggal,
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

/**
 * Penolakan yang berbeda SEBABNYA harus berbeda PESANNYA juga: satu menyuruh
 * membuat jurnal balik, satu menyuruh membuka dokumen asalnya, satu menyuruh
 * membuka kunci periode. Pesan seragam membuat akunting mencoba jalan yang
 * tidak akan pernah berhasil.
 *
 * Mengembalikan juga `bolehEdit` supaya pemanggil tahu apakah yang lolos itu
 * jurnal DRAF (biasa) atau jurnal TERPOSTING yang dibuka sakelar D42 — yang
 * kedua wajib menulis nilai_sebelum/nilai_sesudah.
 */
async function assertEditable(row: {
  clientId: string
  id: string
  status: string
  sumber: string | null
  tanggal: string
}): Promise<{ error: NextResponse } | { posted: boolean }> {
  const status = row.status as 'draft' | 'posted'

  // D32 mengalahkan semuanya: jurnal bersumber modul dimiliki dokumen asalnya.
  if (isSumberModul(row.sumber)) {
    const label = SUMBER_MODUL_LABEL[row.sumber as string] ?? row.sumber
    return {
      error: NextResponse.json(
        {
          error: `Jurnal ini dibuat otomatis dari ${label} dan tidak bisa diubah dari halaman Jurnal.`,
          details: [`Buka dokumennya di halaman ${label} — jurnalnya ikut diperbarui dari sana.`],
        },
        { status: 409 }
      ),
    }
  }

  // Jawaban untuk DRAF sudah lengkap tanpa membaca apa pun: predikat lib yang
  // memutuskan, bukan perbandingan status di sini. Memanggilnya tanpa opsi
  // sekaligus menghindari dua query yang tidak akan mengubah jawabannya.
  if (canEditJournal(status, row.sumber)) return { posted: false }

  // ══ SEJAK SINI: JURNAL TERPOSTING (D42) ═════════════════════════════
  // Ketiga pemeriksaan di bawah dibaca DARI SUMBERNYA, bukan dari anggapan.
  const isLocked = await periodLockChecker(row.clientId)
  const terkunci = isLocked(row.tanggal)
  const sudahDibalik = (await findPostedReversal(row.id)) !== null
  const settings = await loadAccountingSettings(row.clientId)

  if (
    canEditJournal(status, row.sumber, {
      bolehEditPosting: bolehEditPosting(settings),
      isLocked: terkunci,
      sudahDibalik,
    })
  ) {
    return { posted: true }
  }

  if (terkunci) {
    return {
      error: NextResponse.json(
        {
          error: `Periode ${row.tanggal} sudah dikunci — jurnalnya tidak bisa diubah.`,
          details: ['Kunci periode mengalahkan setelan "posting bisa diedit".'],
        },
        { status: 409 }
      ),
    }
  }

  if (sudahDibalik) {
    return {
      error: NextResponse.json(
        {
          error: 'Jurnal ini sudah dikoreksi lewat jurnal balik dan tidak bisa diubah lagi.',
          details: ['Mengubahnya akan membuat pasangan asli ↔ pembalik tidak lagi berjumlah nol.'],
        },
        { status: 409 }
      ),
    }
  }

  const label = JOURNAL_STATUS_LABEL[status] ?? status
  return {
    error: NextResponse.json(
      {
        error: `Jurnal berstatus ${label} tidak bisa diubah atau dihapus.`,
        details: [
          'Koreksi jurnal terposting dilakukan lewat jurnal balik, bukan dengan mengubah yang lama.',
          'Kalau klien ini memang perlu menyunting posting, nyalakan setelannya di Settings › Pembukuan — setiap perubahan akan tercatat lengkap di riwayat.',
        ],
      },
      { status: 409 }
    ),
  }
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

  const izin = await assertEditable(g.row)
  if ('error' in izin) return izin.error

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

  // ══ MITIGASI (a) D42: NILAI SEBELUM & SESUDAH ══════════════════════
  // Hanya untuk jurnal TERPOSTING yang dibuka sakelar. Di situlah riwayat
  // menjadi satu-satunya bukti bahwa angka yang sudah dilaporkan pernah
  // berbeda; untuk draf, perubahan adalah bagian normal dari menyusunnya.
  const sebelum = izin.posted
    ? {
        tanggal: g.row.tanggal,
        noBukti: g.row.noBukti,
        lines: await loadJournalLineValues(g.row.id),
      }
    : null

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
      nilaiSebelum: sebelum,
      nilaiSesudah: izin.posted
        ? { tanggal: check.value.tanggal, noBukti: check.value.noBukti, lines: check.value.lines }
        : null,
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

  const izin = await assertEditable(g.row)
  if ('error' in izin) return izin.error

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
