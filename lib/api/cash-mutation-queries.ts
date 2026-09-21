import { NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { and, asc, desc, eq, sql } from 'drizzle-orm'
import type { BatchItem } from 'drizzle-orm/batch'
import { db } from '@/lib/db'
import {
  cashMutationAllocations,
  cashMutations,
  journalEntries,
  journalLines,
  masterCoa,
  masterSupplier,
  purchaseInvoiceLines,
  purchaseInvoices,
  users,
} from '@/lib/db/schema'
import { fromMinorUnits, toMinorUnits } from '@/lib/journal'
import { computeInvoiceTotals } from '@/lib/purchase'
import { resolveIsKas } from '@/lib/coa/account-type'
import {
  allocationRemaining,
  buildAllocationJournalLines,
  buildCounterAccountJournalLines,
  mutationStatus,
} from '@/lib/cash-mutation'
import { purgeAuditEvents, recordAuditEvent, recordJournalEvent } from '@/lib/api/audit'

// Query & penjaga mutasi kas/bank, dipakai BERSAMA route daftar, detail, impor,
// dan alokasi. Hidup di modul terpisah karena Next menolak export non-handler di
// berkas route — dan karena "bentuk mutasi" harus satu definisi: POST
// mengembalikannya sebagai 201, PATCH sesudah menyimpan, GET saat dibaca.
//
// ══ JURNALNYA DIBANGUN ULANG, BUKAN DITAMBAL ═════════════════════════════
// syncMutationJournal di bawah adalah SATU-SATUNYA tempat yang memutuskan
// jurnal sebuah mutasi. Tiga route memanggilnya (ubah mutasi, tambah alokasi,
// hapus alokasi), dan ketiganya harus menghasilkan jurnal yang sama untuk
// keadaan yang sama. Menulis logikanya tiga kali berarti tiga jawaban yang
// akan menyimpang diam-diam.

/** Akun kas milik klien — null bila bukan miliknya ATAU bukan akun kas. */
export async function loadCashAccount(clientId: string, akunKasId: string) {
  const [row] = await db
    .select({
      id: masterCoa.id,
      kode: masterCoa.kode,
      nama: masterCoa.nama,
      posisi: masterCoa.posisi,
      kelompok: masterCoa.kelompok,
      subKelompok: masterCoa.subKelompok,
      classCf: masterCoa.classCf,
      tipeAkun: masterCoa.tipeAkun,
      isKas: masterCoa.isKas,
    })
    .from(masterCoa)
    .where(and(eq(masterCoa.clientId, clientId), eq(masterCoa.id, akunKasId)))
    .limit(1)

  if (!row) return null
  // Penanda kas DITURUNKAN kalau belum disetel eksplisit (E2) — daftar akun kas
  // di layar memakai aturan yang sama, jadi akun yang terlihat bisa dipilih
  // harus bisa dipakai juga.
  return resolveIsKas(row) ? row : null
}

/** Akun mana pun milik klien — untuk akun lawan bebas, yang memang tak dibatasi. */
export async function assertAccountBelongsToClient(
  akunId: string,
  clientId: string
): Promise<NextResponse | null> {
  const [row] = await db
    .select({ id: masterCoa.id })
    .from(masterCoa)
    .where(and(eq(masterCoa.clientId, clientId), eq(masterCoa.id, akunId)))
    .limit(1)
  if (row) return null
  return NextResponse.json(
    { error: 'Akun tidak ditemukan pada Master COA klien ini.' },
    { status: 400 }
  )
}

/** Header mutasi untuk jalur TULIS — tanpa alokasi, tanpa turunan. */
export async function loadMutationForWrite(mutationId: string) {
  const [row] = await db
    .select({
      id: cashMutations.id,
      clientId: cashMutations.clientId,
      akunKasId: cashMutations.akunKasId,
      akunLawanId: cashMutations.akunLawanId,
      tanggal: cashMutations.tanggal,
      keterangan: cashMutations.keterangan,
      debit: cashMutations.debit,
      kredit: cashMutations.kredit,
      journalId: cashMutations.journalId,
    })
    .from(cashMutations)
    .where(eq(cashMutations.id, mutationId))
    .limit(1)
  return row ?? null
}

/** Alokasi satu mutasi + akun hutang MILIK INVOICE (snapshot D30). */
export async function loadMutationAllocations(mutationId: string) {
  return db
    .select({
      id: cashMutationAllocations.id,
      invoiceId: cashMutationAllocations.invoiceId,
      nominal: cashMutationAllocations.nominal,
      terminUrutan: cashMutationAllocations.terminUrutan,
      createdAt: cashMutationAllocations.createdAt,
      noInvoice: purchaseInvoices.noInvoice,
      supplierNama: masterSupplier.nama,
      // Akun hutang yang DI-SNAPSHOT ke invoice, bukan default supplier hari
      // ini (D30). Membaca ulang dari supplier membuat jurnal pembayaran
      // men-DEBIT akun yang berbeda dari yang di-KREDIT invoicenya.
      akunHutangId: purchaseInvoices.akunHutangId,
    })
    .from(cashMutationAllocations)
    .innerJoin(purchaseInvoices, eq(cashMutationAllocations.invoiceId, purchaseInvoices.id))
    .innerJoin(masterSupplier, eq(purchaseInvoices.supplierId, masterSupplier.id))
    .where(eq(cashMutationAllocations.mutationId, mutationId))
    .orderBy(asc(cashMutationAllocations.createdAt))
}

/**
 * Invoice yang hendak dibayar, beserta SISA-nya.
 *
 * Sisa dihitung di sini dan tidak pernah disimpan (D37): total invoice dikurangi
 * seluruh alokasi yang sudah menunjuk ke sana, dari mutasi mana pun.
 */
export async function loadInvoiceForAllocation(invoiceId: string, clientId: string) {
  const [header] = await db
    .select({
      id: purchaseInvoices.id,
      clientId: purchaseInvoices.clientId,
      noInvoice: purchaseInvoices.noInvoice,
      caraBayar: purchaseInvoices.caraBayar,
      akunHutangId: purchaseInvoices.akunHutangId,
      ppn: purchaseInvoices.ppn,
      jumlahTermin: purchaseInvoices.jumlahTermin,
      supplierNama: masterSupplier.nama,
    })
    .from(purchaseInvoices)
    .innerJoin(masterSupplier, eq(purchaseInvoices.supplierId, masterSupplier.id))
    .where(and(eq(purchaseInvoices.id, invoiceId), eq(purchaseInvoices.clientId, clientId)))
    .limit(1)
  if (!header) return null

  const lines = await db
    .select({ subtotal: purchaseInvoiceLines.subtotal })
    .from(purchaseInvoiceLines)
    .where(eq(purchaseInvoiceLines.invoiceId, invoiceId))

  const [agg] = await db
    .select({
      total: sql<string>`coalesce(sum(${cashMutationAllocations.nominal}), 0)::numeric(18,2)::text`,
    })
    .from(cashMutationAllocations)
    .where(eq(cashMutationAllocations.invoiceId, invoiceId))

  const totalMinor = computeInvoiceTotals(lines, header.ppn).totalMinor
  const teralokasiMinor = toMinorUnits(agg?.total) ?? 0

  return {
    ...header,
    totalMinor,
    teralokasiMinor,
    sisaMinor: totalMinor - teralokasiMinor,
  }
}

/** Snapshot mutasi + alokasinya — bahan `nilai_sebelum` di audit_events. */
export async function snapshotMutation(mutationId: string) {
  const header = await loadMutationForWrite(mutationId)
  if (!header) return null
  const alokasi = await loadMutationAllocations(mutationId)
  return {
    tanggal: header.tanggal,
    keterangan: header.keterangan,
    debit: header.debit,
    kredit: header.kredit,
    akunKasId: header.akunKasId,
    akunLawanId: header.akunLawanId,
    alokasi: alokasi.map(a => ({
      invoiceId: a.invoiceId,
      noInvoice: a.noInvoice,
      nominal: a.nominal,
      terminUrutan: a.terminUrutan,
    })),
  }
}

/** Bentuk detail mutasi — SATU definisi untuk POST, PATCH, dan GET detail. */
export async function loadMutationDetail(mutationId: string) {
  const [header] = await db
    .select({
      id: cashMutations.id,
      clientId: cashMutations.clientId,
      akunKasId: cashMutations.akunKasId,
      akunKasKode: masterCoa.kode,
      akunKasNama: masterCoa.nama,
      tanggal: cashMutations.tanggal,
      keterangan: cashMutations.keterangan,
      debit: cashMutations.debit,
      kredit: cashMutations.kredit,
      saldo: cashMutations.saldo,
      fingerprint: cashMutations.fingerprint,
      importId: cashMutations.importId,
      akunLawanId: cashMutations.akunLawanId,
      journalId: cashMutations.journalId,
      createdAt: cashMutations.createdAt,
      updatedAt: cashMutations.updatedAt,
      createdByName: users.name,
    })
    .from(cashMutations)
    .innerJoin(masterCoa, eq(cashMutations.akunKasId, masterCoa.id))
    .innerJoin(users, eq(cashMutations.createdBy, users.id))
    .where(eq(cashMutations.id, mutationId))
    .limit(1)
  if (!header) return null

  const alokasi = await loadMutationAllocations(mutationId)
  const sisaMinor = allocationRemaining(header, alokasi)

  return {
    ...header,
    alokasi,
    sisa: fromMinorUnits(sisaMinor),
    status: mutationStatus(header, alokasi),
  }
}

/**
 * Daftar mutasi per periode, beserta sisa & status yang DITURUNKAN.
 *
 * Σ alokasi dijumlahkan di Postgres lewat `numeric(18,2)::text` supaya nilainya
 * tidak pernah melewati float JS (P1) — pola yang sama dengan daftar jurnal.
 */
export async function listCashMutations(opts: {
  clientId: string
  periodStart: string
  periodEnd: string
  akunKasId?: string
}) {
  const filters = [
    eq(cashMutations.clientId, opts.clientId),
    sql`${cashMutations.tanggal} >= ${opts.periodStart}`,
    sql`${cashMutations.tanggal} <= ${opts.periodEnd}`,
  ]
  if (opts.akunKasId) filters.push(eq(cashMutations.akunKasId, opts.akunKasId))

  const rows = await db
    .select({
      id: cashMutations.id,
      tanggal: cashMutations.tanggal,
      keterangan: cashMutations.keterangan,
      debit: cashMutations.debit,
      kredit: cashMutations.kredit,
      saldo: cashMutations.saldo,
      akunKasId: cashMutations.akunKasId,
      akunKasKode: masterCoa.kode,
      akunKasNama: masterCoa.nama,
      akunLawanId: cashMutations.akunLawanId,
      journalId: cashMutations.journalId,
      importId: cashMutations.importId,
      fingerprint: cashMutations.fingerprint,
      createdAt: cashMutations.createdAt,
      createdByName: users.name,
      teralokasiDb: sql<string>`coalesce(sum(${cashMutationAllocations.nominal}), 0)::numeric(18,2)::text`,
      alokasiCount: sql<number>`count(${cashMutationAllocations.id})::int`,
    })
    .from(cashMutations)
    .innerJoin(masterCoa, eq(cashMutations.akunKasId, masterCoa.id))
    .innerJoin(users, eq(cashMutations.createdBy, users.id))
    .leftJoin(cashMutationAllocations, eq(cashMutationAllocations.mutationId, cashMutations.id))
    .where(and(...filters))
    .groupBy(cashMutations.id, masterCoa.kode, masterCoa.nama, users.name)
    .orderBy(desc(cashMutations.tanggal), asc(cashMutations.createdAt))

  return rows.map(r => {
    const alokasiSemu = [{ nominal: r.teralokasiDb }]
    return {
      ...r,
      teralokasi: r.teralokasiDb,
      sisa: fromMinorUnits(allocationRemaining(r, alokasiSemu)),
      status: mutationStatus(r, alokasiSemu),
    }
  })
}

// ── Jurnal mutasi ────────────────────────────────────────────

export type SyncJournalResult =
  | { error: NextResponse }
  | { statements: BatchItem<'pg'>[]; journalId: string | null }

/**
 * Menyusun statement untuk MEMBANGUN ULANG jurnal sebuah mutasi.
 *
 * Dipanggil oleh setiap jalur yang mengubah keadaan mutasi, dan hasilnya
 * digabungkan ke `db.batch` milik pemanggil — tidak pernah menulis sendiri
 * (P10: jurnal dan perubahan yang melahirkannya wajib satu transaksi).
 *
 * Keadaan → jurnal:
 *   - ada alokasi  → D akun hutang per alokasi / K akun kas (kasus a)
 *   - ada akun lawan (tanpa alokasi) → arah mengikuti sisi mutasi (kasus b)
 *   - tidak keduanya → TIDAK ADA jurnal; kalau sebelumnya ada, ia DIHAPUS
 *
 * ══ JURNAL TERPOSTING TIDAK DIBANGUN ULANG ══════════════════════════════
 * Kalau jurnalnya sudah diposting, fungsi ini MENOLAK (409). Membangun ulang
 * jurnal terposting berarti mengubah angka yang sudah masuk buku besar tanpa
 * melewati jurnal balik — persis yang D42 larang, dan di sini ia akan terjadi
 * sebagai efek samping dari menambah satu alokasi.
 */
export async function syncMutationJournal(opts: {
  mutation: {
    id: string
    clientId: string
    akunKasId: string
    akunLawanId: string | null
    tanggal: string
    keterangan: string | null
    debit: string
    kredit: string
    journalId: string | null
  }
  alokasi: readonly { akunHutangId: string | null; nominal: string; noInvoice: string | null }[]
  userId: string | null
  /** Nilai baru yang akan ditulis di batch ini, kalau berbeda dari yang tersimpan. */
  patch?: { tanggal?: string; keterangan?: string | null; debit?: string; kredit?: string; akunLawanId?: string | null }
}): Promise<SyncJournalResult> {
  const m = { ...opts.mutation, ...opts.patch }
  const statements: BatchItem<'pg'>[] = []

  // Keadaan jurnal LAMA dibaca lebih dulu: statusnya menentukan boleh-tidaknya
  // seluruh operasi ini, jadi ia diperiksa sebelum satu statement pun disusun.
  let jurnalLama: { id: string; status: string } | null = null
  if (m.journalId) {
    const [row] = await db
      .select({ id: journalEntries.id, status: journalEntries.status })
      .from(journalEntries)
      .where(eq(journalEntries.id, m.journalId))
      .limit(1)
    jurnalLama = row ?? null
  }
  if (jurnalLama && jurnalLama.status === 'posted') {
    return {
      error: NextResponse.json(
        {
          error: 'Jurnal mutasi ini sudah diposting dan tidak bisa dibangun ulang.',
          details: [
            'Buat jurnal balik untuk jurnal itu lebih dulu, baru ubah mutasinya.',
            'Mengubahnya di sini akan memindahkan angka yang sudah masuk buku besar tanpa jejak pembalik.',
          ],
        },
        { status: 409 }
      ),
    }
  }

  const alokasiSah = opts.alokasi.filter(a => a.akunHutangId !== null)
  if (alokasiSah.length !== opts.alokasi.length) {
    // Invoice TUNAI tidak punya akun hutang — ia tidak pernah jadi hutang, jadi
    // tidak ada yang bisa didebit saat dibayar.
    return {
      error: NextResponse.json(
        {
          error: 'Ada alokasi ke invoice yang tidak punya akun hutang.',
          details: ['Invoice tunai tidak menimbulkan hutang, jadi ia tidak bisa dibayar lewat mutasi kas.'],
        },
        { status: 400 }
      ),
    }
  }

  const lines =
    alokasiSah.length > 0
      ? buildAllocationJournalLines({
          alokasi: alokasiSah.map(a => ({
            akunHutangId: a.akunHutangId as string,
            minor: toMinorUnits(a.nominal) ?? 0,
            keterangan: a.noInvoice ? `Pembayaran ${a.noInvoice}` : null,
          })),
          akunKasId: m.akunKasId,
        })
      : m.akunLawanId
        ? buildCounterAccountJournalLines({
            mutasi: { debit: m.debit, kredit: m.kredit },
            akunKasId: m.akunKasId,
            akunLawanId: m.akunLawanId,
            keterangan: m.keterangan,
          })
        : []

  // ── Tidak ada yang bisa dijurnalkan ──
  if (lines.length === 0) {
    if (jurnalLama) {
      // Urutannya penting: mutasi melepas journal_id LEBIH DULU (FK-nya ON
      // DELETE set null, tapi mengandalkan itu berarti mengandalkan urutan
      // eksekusi di dalam batch), baru jurnalnya dihapus beserta riwayatnya.
      statements.push(
        db.update(cashMutations).set({ journalId: null, updatedAt: new Date() }).where(eq(cashMutations.id, m.id)),
        db.delete(journalEntries).where(eq(journalEntries.id, jurnalLama.id)),
        purgeAuditEvents('journal', jurnalLama.id)
      )
    }
    return { statements, journalId: null }
  }

  const keteranganJurnal = m.keterangan
    ? `Mutasi kas — ${m.keterangan}`
    : 'Mutasi kas'

  if (jurnalLama) {
    statements.push(
      db
        .update(journalEntries)
        .set({ tanggal: m.tanggal, keterangan: keteranganJurnal, updatedAt: new Date() })
        .where(eq(journalEntries.id, jurnalLama.id)),
      db.delete(journalLines).where(eq(journalLines.journalId, jurnalLama.id)),
      db.insert(journalLines).values(
        lines.map(l => ({
          journalId: jurnalLama.id,
          masterCoaId: l.masterCoaId,
          debit: l.debit,
          kredit: l.kredit,
          keterangan: l.keterangan,
          lineOrder: l.lineOrder,
        }))
      ),
      recordJournalEvent({
        clientId: m.clientId,
        journalId: jurnalLama.id,
        event: 'updated',
        userId: opts.userId,
      })
    )
    return { statements, journalId: jurnalLama.id }
  }

  // ── Jurnal baru, lahir DRAF ──
  // Draf karena mutasi yang baru masuk adalah dokumen yang masih disusun:
  // alokasinya bisa bertambah, akun lawannya bisa diganti. Memposting otomatis
  // berarti angka masuk buku besar sebelum ada yang memeriksanya.
  const journalId = randomUUID()
  statements.push(
    db.insert(journalEntries).values({
      id: journalId,
      clientId: m.clientId,
      tanggal: m.tanggal,
      // no_bukti NULL, alasan sama dengan jurnal pembelian: kolomnya unik per
      // klien, sementara mutasi bank tidak punya nomor yang dijamin unik.
      noBukti: null,
      keterangan: keteranganJurnal,
      sumber: 'mutasi_kas',
      createdBy: opts.userId as string,
    }),
    db.insert(journalLines).values(
      lines.map(l => ({
        journalId,
        masterCoaId: l.masterCoaId,
        debit: l.debit,
        kredit: l.kredit,
        keterangan: l.keterangan,
        lineOrder: l.lineOrder,
      }))
    ),
    db.update(cashMutations).set({ journalId, updatedAt: new Date() }).where(eq(cashMutations.id, m.id)),
    recordJournalEvent({ clientId: m.clientId, journalId, event: 'created', userId: opts.userId })
  )
  return { statements, journalId }
}

/** Riwayat satu mutasi — pembungkus tipis supaya entity_type-nya tidak salah ketik. */
export function recordMutationEvent(v: {
  clientId: string
  mutationId: string
  event: string
  userId: string | null
  catatan?: string | null
  nilaiSebelum?: unknown
  nilaiSesudah?: unknown
}): BatchItem<'pg'> {
  return recordAuditEvent({
    clientId: v.clientId,
    entityType: 'cash_mutation',
    entityId: v.mutationId,
    event: v.event,
    userId: v.userId,
    catatan: v.catatan,
    nilaiSebelum: v.nilaiSebelum,
    nilaiSesudah: v.nilaiSesudah,
  })
}
