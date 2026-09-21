import { and, asc, eq, lte, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { journalEntries, journalLines, masterCoa } from '@/lib/db/schema'
import type { AccountRef, LedgerLine } from '@/lib/ledger'

/** Baris buku besar + penanda turunan D42. */
export type LedgerLineRow = LedgerLine & { diubahSetelahPosting: boolean }

// Query buku besar. Hidup terpisah dari route karena Next menolak export
// non-handler di berkas route — dan karena route buku besar per akun dan route
// neraca saldo menanyakan hal yang SAMA dengan filter berbeda: "baris jurnal
// TERPOSTING milik klien ini sampai tanggal sekian".
//
// ══ HANYA `status = 'posted'` — INI SELURUH INTI BUKU BESAR ═══════════════
// Draf belum masuk buku. Kalau saringan ini pernah lepas, saldo di layar berisi
// jurnal yang masih disunting seseorang, dan angka yang sudah diserahkan ke
// klien berubah tanpa ada yang menyentuhnya. Karena itu saringannya ada di SATU
// tempat (modul ini) dan dikunci test baca-sumber.

/** Akun milik klien tertentu. null = tidak ada, ATAU milik klien lain. */
export async function loadAccountRef(
  clientId: string,
  masterCoaId: string
): Promise<(AccountRef & { kelompok: string; subKelompok: string }) | null> {
  const [row] = await db
    .select({
      id: masterCoa.id,
      kode: masterCoa.kode,
      nama: masterCoa.nama,
      posisi: masterCoa.posisi,
      kelompok: masterCoa.kelompok,
      subKelompok: masterCoa.subKelompok,
    })
    .from(masterCoa)
    .where(and(eq(masterCoa.clientId, clientId), eq(masterCoa.id, masterCoaId)))
    .limit(1)
  return row ?? null
}

/** Seluruh akun klien, urut kode — daftar lengkap untuk neraca saldo. */
export async function loadAccountRefs(clientId: string): Promise<AccountRef[]> {
  return db
    .select({
      id: masterCoa.id,
      kode: masterCoa.kode,
      nama: masterCoa.nama,
      posisi: masterCoa.posisi,
    })
    .from(masterCoa)
    .where(eq(masterCoa.clientId, clientId))
    .orderBy(asc(masterCoa.kode))
}

/**
 * Baris jurnal TERPOSTING sampai `periodEnd`.
 *
 * `masterCoaId` opsional: diisi untuk buku besar satu akun, dikosongkan untuk
 * neraca saldo seluruh akun.
 *
 * Pemisahan "sebelum periode" vs "di dalam periode" TIDAK dilakukan di sini —
 * itu tugas pemanggil, karena saldo awal hanyalah penjumlahan baris yang sama
 * dengan batas tanggal berbeda. Satu query untuk keduanya berarti satu
 * saringan `posted` yang bisa salah, bukan dua.
 *
 * `keterangan` dikoalesekan: keterangan BARIS kalau ada, kalau tidak keterangan
 * jurnalnya. Di buku besar yang dibaca per baris, sel kosong di sebelah nominal
 * membuat pembacanya harus membuka jurnalnya untuk tahu itu transaksi apa.
 */
export async function loadPostedLines(opts: {
  clientId: string
  periodEnd: string
  masterCoaId?: string
}): Promise<LedgerLineRow[]> {
  const filters = [
    eq(journalEntries.clientId, opts.clientId),
    eq(journalEntries.status, 'posted'),
    lte(journalEntries.tanggal, opts.periodEnd),
  ]
  if (opts.masterCoaId) filters.push(eq(journalLines.masterCoaId, opts.masterCoaId))

  return db
    .select({
      id: journalLines.id,
      journalId: journalEntries.id,
      tanggal: journalEntries.tanggal,
      noBukti: journalEntries.noBukti,
      keterangan: sql<
        string | null
      >`coalesce(${journalLines.keterangan}, ${journalEntries.keterangan})`,
      masterCoaId: journalLines.masterCoaId,
      debit: journalLines.debit,
      kredit: journalLines.kredit,
      lineOrder: journalLines.lineOrder,
      // Mitigasi (c) D42 — pembaca buku besar berhak tahu bahwa sebuah angka
      // pernah berbeda, tanpa harus membuka panel riwayat lebih dulu.
      diubahSetelahPosting: sql<boolean>`exists (
        select 1 from audit_events u
        where u.entity_type = 'journal' and u.entity_id = ${journalEntries.id}
          and u.event = 'updated'
          and u.at > (
            select max(p.at) from audit_events p
            where p.entity_type = 'journal' and p.entity_id = ${journalEntries.id}
              and p.event = 'posted'
          )
      )`,
    })
    .from(journalLines)
    .innerJoin(journalEntries, eq(journalLines.journalId, journalEntries.id))
    .where(and(...filters))
}
