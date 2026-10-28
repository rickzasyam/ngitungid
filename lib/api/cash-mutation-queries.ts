import { NextResponse } from 'next/server'
import { and, asc, desc, eq, sql } from 'drizzle-orm'
import type { BatchItem } from 'drizzle-orm/batch'
import { db } from '@/lib/db'
import {
  cashMutationAllocations,
  cashMutations,
  masterCoa,
  masterSupplier,
  purchaseInvoiceLines,
  purchaseInvoices,
  users,
} from '@/lib/db/schema'
import { fromMinorUnits, toMinorUnits } from '@/lib/journal'
import { computeInvoiceTotals } from '@/lib/purchase'
import { resolveIsKas } from '@/lib/coa/account-type'
import { allocationRemaining, mutationStatus } from '@/lib/cash-mutation'
import { recordAuditEvent } from '@/lib/api/audit'

// Query & penjaga mutasi kas/bank, dipakai BERSAMA route daftar, detail, impor,
// dan alokasi. Hidup di modul terpisah karena Next menolak export non-handler di
// berkas route — dan karena "bentuk mutasi" harus satu definisi: POST
// mengembalikannya sebagai 201, PATCH sesudah menyimpan, GET saat dibaca.
//
// ══ JURNAL MUTASI TIDAK DIPUTUSKAN DI SINI ═══════════════════════════════
// Sejak S7 satu-satunya yang memutuskan jurnal mutasi adalah
// `rencanakanJurnalMutasi` (lib/api/cash-mutation-journal.ts) — dipakai route
// batch, pembungkus form, dan route alokasi. `syncMutationJournal` yang dulu
// hidup di sini DIPINDAH ke sana (D48), bersama jurnal ringkasan (D58).

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
      updatedAt: cashMutations.updatedAt,
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
