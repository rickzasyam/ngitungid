import { NextResponse } from 'next/server'
import { and, asc, desc, eq, inArray } from 'drizzle-orm'
import { db } from '@/lib/db'
import {
  auditEvents,
  journalEntries,
  journalLines,
  masterCoa,
  masterSupplier,
  purchaseInvoices,
  users,
} from '@/lib/db/schema'
import type { JournalLineValue } from '@/lib/journal'
import { resolveAccountType } from '@/lib/coa/account-type'
import { diubahSetelahPosting } from '@/lib/accounting-settings'

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

/**
 * Tipe akun per `master_coa_id`, untuk aturan "supplier hanya pada baris
 * liability" (F1).
 *
 * Memakai `resolveAccountType` — eksplisit ?? turunan (E2), aturan yang sama
 * dengan yang dipakai layar dan ekspor. Akun yang tidak ditemukan sengaja TIDAK
 * masuk peta: pemanggil sudah memeriksa kepemilikan klien lewat
 * assertAccountsBelongToClient, dan id yang lolos ke sini tapi tidak ada di
 * COA berarti sesuatu yang lebih besar sedang salah.
 */
export async function loadTipeAkunById(
  clientId: string,
  masterCoaIds: readonly string[]
): Promise<Record<string, string | null>> {
  const ids = [...new Set(masterCoaIds)].filter(Boolean)
  if (ids.length === 0) return {}
  const rows = await db
    .select({
      id: masterCoa.id,
      nama: masterCoa.nama,
      posisi: masterCoa.posisi,
      kelompok: masterCoa.kelompok,
      subKelompok: masterCoa.subKelompok,
      classCf: masterCoa.classCf,
      tipeAkun: masterCoa.tipeAkun,
    })
    .from(masterCoa)
    .where(and(eq(masterCoa.clientId, clientId), inArray(masterCoa.id, ids)))

  const out: Record<string, string | null> = {}
  for (const r of rows) out[r.id] = resolveAccountType(r)
  return out
}

/**
 * Supplier yang ditandai di baris jurnal HARUS milik klien yang sama.
 *
 * Pola yang sama dengan assertAccountsBelongToClient: satu query, bandingkan
 * panjang. Tanpa ini, id supplier klien lain bisa diselundupkan lewat body dan
 * muncul di rekonsiliasi klien ini sebagai penjelas selisih yang mengarang.
 */
export async function assertSuppliersBelongToClient(
  supplierIds: readonly (string | null | undefined)[],
  clientId: string
): Promise<NextResponse | null> {
  const ids = [...new Set(supplierIds.filter((x): x is string => typeof x === 'string' && x !== ''))]
  if (ids.length === 0) return null
  const found = await db
    .select({ id: masterSupplier.id })
    .from(masterSupplier)
    .where(and(eq(masterSupplier.clientId, clientId), inArray(masterSupplier.id, ids)))
  if (found.length !== ids.length) {
    return NextResponse.json(
      { error: 'Ada supplier yang tidak ditemukan pada klien ini.' },
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
      postedAt: journalEntries.postedAt,
      postedById: journalEntries.postedBy,
      reversalOfId: journalEntries.reversalOfId,
    })
    .from(journalEntries)
    .innerJoin(users, eq(journalEntries.createdBy, users.id))
    .where(eq(journalEntries.id, journalId))
    .limit(1)

  if (!header) return null

  // Nama pemosting diambil TERPISAH, bukan lewat alias join kedua ke `users`.
  // Bukan karena join-nya salah, tapi karena query yang dijalankan hanya kalau
  // jurnalnya memang sudah diposting: jurnal draf — mayoritas yang dibuka di
  // layar — tidak membayar apa pun untuk kolom yang pasti kosong.
  let postedByName: string | null = null
  if (header.postedById) {
    const [u] = await db
      .select({ name: users.name })
      .from(users)
      .where(eq(users.id, header.postedById))
      .limit(1)
    postedByName = u?.name ?? null
  }

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
      // F1. Tanpa ini, form edit dibuka TANPA tanda supplier, lalu PATCH —
      // yang mengganti seluruh baris — menghapusnya diam-diam.
      supplierId: journalLines.supplierId,
      supplierNama: masterSupplier.nama,
    })
    .from(journalLines)
    .innerJoin(masterCoa, eq(journalLines.masterCoaId, masterCoa.id))
    .leftJoin(masterSupplier, eq(journalLines.supplierId, masterSupplier.id))
    .where(eq(journalLines.journalId, journalId))
    .orderBy(asc(journalLines.lineOrder))

  // Riwayat: terbaru dulu, sama dengan urutan baca panel Riwayat di layar.
  // leftJoin users — user_id boleh NULL (ON DELETE set null), dan riwayat yang
  // hilang karena penggunanya dihapus jauh lebih buruk daripada nama kosong.
  const events = await db
    .select({
      id: auditEvents.id,
      event: auditEvents.event,
      catatan: auditEvents.catatan,
      at: auditEvents.at,
      userName: users.name,
    })
    .from(auditEvents)
    .leftJoin(users, eq(auditEvents.userId, users.id))
    .where(and(eq(auditEvents.entityType, 'journal'), eq(auditEvents.entityId, journalId)))
    .orderBy(desc(auditEvents.at))

  // Pembalik jurnal ini. DAFTAR, bukan satu baris: canReverse hanya melarang
  // pembalik kedua kalau yang pertama SUDAH TERPOSTING, jadi beberapa draf
  // pembalik memang bisa hidup bersamaan. Menampilkan salah satunya saja akan
  // menyembunyikan sisanya dari orang yang harus membereskannya.
  const reversals = await db
    .select({
      id: journalEntries.id,
      noBukti: journalEntries.noBukti,
      tanggal: journalEntries.tanggal,
      status: journalEntries.status,
    })
    .from(journalEntries)
    .where(eq(journalEntries.reversalOfId, journalId))
    .orderBy(asc(journalEntries.createdAt))

  // "Sudah dibalik" = ada pembalik TERPOSTING. Diturunkan di sini, tidak
  // disimpan (P3) — persis definisi yang dipakai canReverse.
  const reversedBy = reversals.find(r => r.status === 'posted') ?? null

  let reversalOf: { id: string; noBukti: string | null; tanggal: string } | null = null
  if (header.reversalOfId) {
    const [asli] = await db
      .select({
        id: journalEntries.id,
        noBukti: journalEntries.noBukti,
        tanggal: journalEntries.tanggal,
      })
      .from(journalEntries)
      .where(eq(journalEntries.id, header.reversalOfId))
      .limit(1)
    reversalOf = asli ?? null
  }

  // ── Dokumen asal, untuk tombol "Koreksi di …" (D32) ────────────────
  //
  // ══ ARAHNYA TERBALIK DARI ARAH FK, DAN ITU DISENGAJA ════════════════
  // `purchase_invoices.journal_id` menunjuk KE jurnal; dari jurnal tidak ada
  // kolom yang menunjuk balik. Jadi ini pencarian MUNDUR lewat index
  // `purchase_invoices_journal_idx` — bukan kolom balik di journal_entries,
  // yang akan jadi kolom polimorfik KEDUA tanpa FK (invoice? mutasi? kelak
  // marketplace?). Kita sudah membayar harga satu di audit_events.
  //
  // Hasilnya boleh null walau sumbernya 'pembelian': invoicenya bisa saja
  // dihapus lewat jalur lain. UI menampilkan keterangan jujur untuk itu, bukan
  // tombol yang menuju halaman kosong.
  let sumberDokumen: { tipe: 'pembelian'; id: string; label: string | null } | null = null
  if (header.sumber === 'pembelian') {
    const [inv] = await db
      .select({ id: purchaseInvoices.id, noInvoice: purchaseInvoices.noInvoice })
      .from(purchaseInvoices)
      .where(eq(purchaseInvoices.journalId, journalId))
      .limit(1)
    if (inv) sumberDokumen = { tipe: 'pembelian', id: inv.id, label: inv.noInvoice }
  }

  return {
    ...header,
    postedByName,
    lines,
    events,
    reversals,
    reversedBy,
    reversalOf,
    sumberDokumen,
    // Mitigasi (c) D42 — diturunkan dari riwayat yang SUDAH dimuat di atas,
    // tanpa query tambahan. Tidak disimpan sebagai kolom (P3).
    diubahSetelahPosting: diubahSetelahPosting(events),
  }
}

/**
 * Header ringkas untuk jalur TULIS (posting, pembalikan).
 *
 * Sengaja terpisah dari loadJournalDetail: yang dibutuhkan predikat hanyalah
 * status, tanggal, dan pemilik kliennya — bukan riwayat, bukan daftar pembalik.
 * Route posting yang menarik seluruh detail hanya untuk membuang 90%-nya
 * membuat jalur tulis bergantung pada bentuk tampilan.
 */
export async function loadJournalHeaderForWrite(journalId: string) {
  const [row] = await db
    .select({
      id: journalEntries.id,
      clientId: journalEntries.clientId,
      tanggal: journalEntries.tanggal,
      noBukti: journalEntries.noBukti,
      keterangan: journalEntries.keterangan,
      status: journalEntries.status,
    })
    .from(journalEntries)
    .where(eq(journalEntries.id, journalId))
    .limit(1)
  return row ?? null
}

/**
 * Baris jurnal dalam bentuk JournalLineValue — bentuk yang sama dengan keluaran
 * validateJournalInput, sehingga bisa langsung dioper ke buildReversalLines dan
 * computeTotals tanpa satu pun konversi di tengah.
 */
export async function loadJournalLineValues(journalId: string): Promise<JournalLineValue[]> {
  return db
    .select({
      masterCoaId: journalLines.masterCoaId,
      debit: journalLines.debit,
      kredit: journalLines.kredit,
      keterangan: journalLines.keterangan,
      lineOrder: journalLines.lineOrder,
      // Dipakai pembalik (dicerminkan) dan snapshot nilai_sebelum D42 — dua
      // tempat yang sama-sama kehilangan supplier kalau kolom ini tidak ikut.
      supplierId: journalLines.supplierId,
    })
    .from(journalLines)
    .where(eq(journalLines.journalId, journalId))
    .orderBy(asc(journalLines.lineOrder))
}

/**
 * Pembalik TERPOSTING milik sebuah jurnal, kalau ada.
 *
 * "Sudah dibalik" tidak disimpan sebagai kolom (P3) — ia pertanyaan yang
 * dijawab tabelnya sendiri. Pembalik yang masih draf sengaja tidak dicari di
 * sini: canReverse memang tidak menghitungnya, karena draf belum masuk buku
 * besar dan jurnalnya secara akuntansi belum terbalik.
 */
export async function findPostedReversal(journalId: string) {
  const [row] = await db
    .select({ id: journalEntries.id, status: journalEntries.status })
    .from(journalEntries)
    .where(and(eq(journalEntries.reversalOfId, journalId), eq(journalEntries.status, 'posted')))
    .limit(1)
  return row ?? null
}
