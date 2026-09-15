import { NextResponse } from 'next/server'
import { and, asc, eq, inArray } from 'drizzle-orm'
import { db } from '@/lib/db'
import { journalEntries, journalLines, masterCoa, users } from '@/lib/db/schema'

// Query & penjaga yang dipakai BERSAMA oleh route daftar jurnal dan route
// detailnya. Hidup di modul terpisah karena Next menolak export non-handler di
// berkas route — dan karena "bentuk detail jurnal" memang harus satu definisi:
// POST mengembalikannya sebagai 201, PATCH sesudah menyimpan, dan GET detail
// saat dibaca. Kalau ketiganya menyusun bentuknya sendiri-sendiri, salah satu
// akan menyimpang dan UI-nya diam-diam kehilangan satu kolom.

/**
 * Id user dari SESI, lewat lookup email (D6).
 *
 * Sesi NextAuth di aplikasi ini tidak membawa user.id, dan lib/auth.ts sengaja
 * tidak disentuh. Pola yang sama dipakai route ganti kata sandi.
 */
export async function resolveUserId(email: string | null | undefined): Promise<string | null> {
  if (!email) return null
  const [row] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1)
  return row?.id ?? null
}

/**
 * Setiap akun di baris jurnal HARUS milik klien yang sama.
 *
 * Tanpa ini, id akun klien lain bisa diselundupkan lewat body dan angka sebuah
 * klien masuk ke buku klien lain. Memakai pola inArray + bandingkan panjang
 * (lihat route mapping laporan): satu query, tidak peduli berapa barisnya.
 * Mengembalikan response galat, atau null kalau semuanya sah.
 */
export async function assertAccountsBelongToClient(
  lines: readonly { masterCoaId: string }[],
  clientId: string
): Promise<NextResponse | null> {
  const ids = [...new Set(lines.map(l => l.masterCoaId))]
  if (ids.length === 0) return null
  const found = await db
    .select({ id: masterCoa.id })
    .from(masterCoa)
    .where(and(eq(masterCoa.clientId, clientId), inArray(masterCoa.id, ids)))
  if (found.length !== ids.length) {
    return NextResponse.json(
      { error: 'Ada akun yang tidak ditemukan pada Master COA klien ini.' },
      { status: 400 }
    )
  }
  return null
}

/** Bentuk detail jurnal — SATU definisi, dipakai POST, PATCH, dan GET detail. */
export async function loadJournalDetail(journalId: string) {
  const [header] = await db
    .select({
      id: journalEntries.id,
      clientId: journalEntries.clientId,
      tanggal: journalEntries.tanggal,
      noBukti: journalEntries.noBukti,
      keterangan: journalEntries.keterangan,
      sumber: journalEntries.sumber,
      status: journalEntries.status,
      createdAt: journalEntries.createdAt,
      updatedAt: journalEntries.updatedAt,
      createdByName: users.name,
    })
    .from(journalEntries)
    .innerJoin(users, eq(journalEntries.createdBy, users.id))
    .where(eq(journalEntries.id, journalId))
    .limit(1)

  if (!header) return null

  const lines = await db
    .select({
      id: journalLines.id,
      masterCoaId: journalLines.masterCoaId,
      kode: masterCoa.kode,
      nama: masterCoa.nama,
      debit: journalLines.debit,
      kredit: journalLines.kredit,
      keterangan: journalLines.keterangan,
      lineOrder: journalLines.lineOrder,
    })
    .from(journalLines)
    .innerJoin(masterCoa, eq(journalLines.masterCoaId, masterCoa.id))
    .where(eq(journalLines.journalId, journalId))
    .orderBy(asc(journalLines.lineOrder))

  return { ...header, lines }
}
