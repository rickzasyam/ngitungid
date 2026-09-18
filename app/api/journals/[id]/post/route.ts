import { NextResponse } from 'next/server'
import { and, eq } from 'drizzle-orm'
import type { BatchItem } from 'drizzle-orm/batch'
import { db } from '@/lib/db'
import { journalEntries } from '@/lib/db/schema'
import { requireAkunting } from '@/lib/api/guards'
import { canAccessClientData } from '@/lib/roles'
import { canPost } from '@/lib/journal'
import { dbWriteErrorResponse } from '@/lib/api/db-errors'
import {
  loadJournalDetail,
  loadJournalHeaderForWrite,
  loadJournalLineValues,
  resolveUserId,
} from '@/lib/api/journal-queries'
import { recordJournalEvent } from '@/lib/api/audit'
import { periodLockChecker } from '@/lib/api/period-lock'

export const runtime = 'nodejs'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// POST /api/journals/[id]/post — jadikan jurnal draf ini TERPOSTING.
//
// ══ PINTU SATU ARAH ═══════════════════════════════════════════════════════
// Sesudah ini jurnalnya tidak bisa diubah maupun dihapus (assertEditable di
// route detail); koreksinya hanya lewat jurnal balik. Karena itu SELURUH syarat
// diperiksa ulang di sini meski UI sudah menyaringnya: daftar di layar bisa basi
// beberapa detik, dan yang basi di layar tidak boleh menjadi buku besar.
//
// requireAkunting, bukan requireUser — alasan yang sama dengan route jurnal
// lainnya (D3: /jurnal tertutup untuk klien DAN finance).
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await requireAkunting()
  if ('error' in g) return g.error

  const { id } = await params
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: 'ID jurnal tidak valid.' }, { status: 400 })
  }

  // Ambil barisnya DULU, baru periksa akses: clientId tidak ada di URL, jadi
  // satu-satunya cara tahu jurnal ini milik siapa adalah membacanya.
  const header = await loadJournalHeaderForWrite(id)
  if (!header) return NextResponse.json({ error: 'Jurnal tidak ditemukan.' }, { status: 404 })
  if (!canAccessClientData(g.user.role, g.user.clientId, header.clientId)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const lines = await loadJournalLineValues(id)

  const isLocked = await periodLockChecker(header.clientId)
  const verdict = canPost({ status: header.status, tanggal: header.tanggal, lines }, { isLocked })
  if (!verdict.ok) {
    return NextResponse.json({ error: verdict.reason }, { status: 409 })
  }

  const userId = await resolveUserId(g.user.email)
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const postedAt = new Date()

  // ══ SYARAT status='draft' DIULANG DI WHERE, BUKAN CUMA DI canPost ═══════
  // Antara pembacaan header di atas dan UPDATE ini, permintaan lain bisa sudah
  // memposting jurnal yang sama. Tanpa syarat ini, yang kedua menimpa posted_at
  // & posted_by milik yang pertama — pemosting yang sebenarnya hilang dari
  // catatan, dan justru itu satu-satunya hal yang diriwayatkan di sini.
  // `returning` dipakai untuk MEMBEDAKAN "berhasil" dari "tidak ada yang
  // berubah": tanpa itu, yang kalah balapan menerima 200 atas pekerjaan yang
  // tidak ia lakukan.
  //
  // Jujur soal batasnya: baris riwayat 'posted' milik yang KALAH tetap tertulis
  // (isi batch sudah ditetapkan sebelum dijalankan, dan neon-http tidak punya
  // transaksi interaktif untuk membatalkannya di tengah jalan). Yang dipilih di
  // sini adalah satu baris riwayat berlebih pada balapan yang sangat jarang,
  // ditukar dengan tidak pernah kehilangan identitas pemosting yang sebenarnya.
  const statements: BatchItem<'pg'>[] = [
    db
      .update(journalEntries)
      .set({ status: 'posted', postedAt, postedBy: userId, updatedAt: postedAt })
      .where(and(eq(journalEntries.id, id), eq(journalEntries.status, 'draft')))
      .returning({ id: journalEntries.id }),
    recordJournalEvent({ clientId: header.clientId, journalId: id, event: 'posted', userId }),
  ]

  let hasil: unknown[]
  try {
    hasil = await db.batch(statements as [BatchItem<'pg'>, ...BatchItem<'pg'>[]])
  } catch (e) {
    return dbWriteErrorResponse(e, 'Gagal memposting jurnal. Coba lagi.')
  }

  const terupdate = Array.isArray(hasil[0]) ? (hasil[0] as unknown[]).length : 0
  if (terupdate === 0) {
    return NextResponse.json(
      { error: 'Jurnal ini sudah diposting oleh permintaan lain barusan.' },
      { status: 409 }
    )
  }

  const detail = await loadJournalDetail(id)
  return NextResponse.json(detail)
}
