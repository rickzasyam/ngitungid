import { NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import type { BatchItem } from 'drizzle-orm/batch'
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import {
  journalEntries,
  journalLines,
  masterCoa,
  masterSupplier,
  purchaseInvoiceLines,
  purchaseInvoices,
  users,
} from '@/lib/db/schema'
import { computeInvoiceTotals } from '@/lib/purchase'
import { buildTerminSchedule } from '@/lib/termin'
import { fromMinorUnits, toMinorUnits, type JournalLineValue } from '@/lib/journal'
import { recordJournalEvent } from '@/lib/api/audit'
import { loadJournalLineValues, loadNasibJurnalModul } from '@/lib/api/journal-queries'

// Query & penjaga invoice pembelian, dipakai BERSAMA route daftar dan detailnya.
// Hidup di modul terpisah karena Next menolak export non-handler di berkas
// route — dan karena "bentuk detail invoice" harus satu definisi: POST
// mengembalikannya sebagai 201, PATCH sesudah menyimpan, GET saat dibaca.

/**
 * Supplier HARUS milik klien yang sama, dan akun hutang defaultnya ikut dibawa.
 *
 * Dua hal dalam satu query karena keduanya dibutuhkan bersamaan: tanpa
 * pemeriksaan klien, id supplier klien lain bisa diselundupkan lewat body; dan
 * akun hutangnya adalah yang di-SNAPSHOT ke invoice (D30).
 */
export async function loadSupplierForInvoice(supplierId: string, clientId: string) {
  const [row] = await db
    .select({
      id: masterSupplier.id,
      nama: masterSupplier.nama,
      akunHutangDefaultId: masterSupplier.akunHutangDefaultId,
    })
    .from(masterSupplier)
    .where(and(eq(masterSupplier.id, supplierId), eq(masterSupplier.clientId, clientId)))
    .limit(1)
  return row ?? null
}

/**
 * Setiap akun yang dirujuk invoice HARUS milik klien yang sama.
 *
 * Pola inArray + bandingkan panjang, sama dengan assertAccountsBelongToClient
 * di jurnal: satu query, tidak peduli berapa akun yang dirujuk. `null` dilewati
 * — kolomnya memang opsional menurut cara bayar.
 */
export async function assertInvoiceAccountsBelongToClient(
  ids: readonly (string | null)[],
  clientId: string
): Promise<NextResponse | null> {
  const unik = [...new Set(ids.filter((x): x is string => typeof x === 'string' && x !== ''))]
  if (unik.length === 0) return null
  const found = await db
    .select({ id: masterCoa.id })
    .from(masterCoa)
    .where(and(eq(masterCoa.clientId, clientId), inArray(masterCoa.id, unik)))
  if (found.length !== unik.length) {
    return NextResponse.json(
      { error: 'Ada akun yang tidak ditemukan pada Master COA klien ini.' },
      { status: 400 }
    )
  }
  return null
}

/** Header invoice untuk jalur TULIS — tanpa baris, tanpa jadwal. */
export async function loadInvoiceHeaderForWrite(invoiceId: string) {
  const [row] = await db
    .select({
      id: purchaseInvoices.id,
      clientId: purchaseInvoices.clientId,
      supplierId: purchaseInvoices.supplierId,
      noInvoice: purchaseInvoices.noInvoice,
      tanggal: purchaseInvoices.tanggal,
      journalId: purchaseInvoices.journalId,
    })
    .from(purchaseInvoices)
    .where(eq(purchaseInvoices.id, invoiceId))
    .limit(1)
  return row ?? null
}

/**
 * Snapshot invoice + barisnya sebagai JSON biasa — bahan `nilai_sebelum` di
 * `audit_events` saat invoice diubah atau dihapus (D42, brief Modul 1).
 *
 * Diambil SEBELUM penghapusan, dan sengaja tidak memuat id: yang berguna saat
 * membaca riwayat adalah isinya, bukan kunci baris yang sudah tidak ada.
 */
export async function snapshotInvoice(invoiceId: string) {
  const [header] = await db
    .select()
    .from(purchaseInvoices)
    .where(eq(purchaseInvoices.id, invoiceId))
    .limit(1)
  if (!header) return null
  const lines = await db
    .select({
      namaBarang: purchaseInvoiceLines.namaBarang,
      qty: purchaseInvoiceLines.qty,
      satuan: purchaseInvoiceLines.satuan,
      hargaSatuan: purchaseInvoiceLines.hargaSatuan,
      subtotal: purchaseInvoiceLines.subtotal,
      lineOrder: purchaseInvoiceLines.lineOrder,
    })
    .from(purchaseInvoiceLines)
    .where(eq(purchaseInvoiceLines.invoiceId, invoiceId))
    .orderBy(asc(purchaseInvoiceLines.lineOrder))

  const { id: _id, ...tanpaId } = header
  return { ...tanpaId, lines }
}

/** Bentuk detail invoice — SATU definisi, dipakai POST, PATCH, dan GET detail. */
export async function loadInvoiceDetail(invoiceId: string) {
  const [header] = await db
    .select({
      id: purchaseInvoices.id,
      clientId: purchaseInvoices.clientId,
      supplierId: purchaseInvoices.supplierId,
      supplierNama: masterSupplier.nama,
      tanggal: purchaseInvoices.tanggal,
      noInvoice: purchaseInvoices.noInvoice,
      caraBayar: purchaseInvoices.caraBayar,
      akunTujuanId: purchaseInvoices.akunTujuanId,
      akunKasId: purchaseInvoices.akunKasId,
      akunHutangId: purchaseInvoices.akunHutangId,
      akunPpnMasukanId: purchaseInvoices.akunPpnMasukanId,
      ppn: purchaseInvoices.ppn,
      jumlahTermin: purchaseInvoices.jumlahTermin,
      jatuhTempoAkhir: purchaseInvoices.jatuhTempoAkhir,
      keterangan: purchaseInvoices.keterangan,
      journalId: purchaseInvoices.journalId,
      createdAt: purchaseInvoices.createdAt,
      updatedAt: purchaseInvoices.updatedAt,
      createdByName: users.name,
    })
    .from(purchaseInvoices)
    .innerJoin(masterSupplier, eq(purchaseInvoices.supplierId, masterSupplier.id))
    .innerJoin(users, eq(purchaseInvoices.createdBy, users.id))
    .where(eq(purchaseInvoices.id, invoiceId))
    .limit(1)

  if (!header) return null

  const lines = await db
    .select({
      id: purchaseInvoiceLines.id,
      namaBarang: purchaseInvoiceLines.namaBarang,
      qty: purchaseInvoiceLines.qty,
      satuan: purchaseInvoiceLines.satuan,
      hargaSatuan: purchaseInvoiceLines.hargaSatuan,
      subtotal: purchaseInvoiceLines.subtotal,
      lineOrder: purchaseInvoiceLines.lineOrder,
    })
    .from(purchaseInvoiceLines)
    .where(eq(purchaseInvoiceLines.invoiceId, invoiceId))
    .orderBy(asc(purchaseInvoiceLines.lineOrder))

  const totals = computeInvoiceTotals(lines, header.ppn)

  // Jadwal termin DITURUNKAN di sini, tidak pernah disimpan (D34). Invoice
  // tunai tidak punya jadwal: ia lunas saat dibuat.
  const termin =
    header.caraBayar === 'kredit' && header.jatuhTempoAkhir
      ? buildTerminSchedule({
          jatuhTempoAkhir: header.jatuhTempoAkhir,
          jumlahTermin: header.jumlahTermin,
          totalMinor: totals.totalMinor,
        }).map(c => ({ ...c, nominal: fromMinorUnits(c.nominalMinor) }))
      : []

  return {
    ...header,
    lines,
    subtotal: fromMinorUnits(totals.subtotalMinor),
    total: fromMinorUnits(totals.totalMinor),
    termin,
  }
}

/**
 * Daftar invoice per periode, beserta total & sisa yang DITURUNKAN.
 *
 * `total` dijumlahkan di Postgres lewat cast `numeric(18,2)::text` supaya
 * nilainya tidak pernah melewati float JS (P1) — pola yang sama dengan daftar
 * jurnal. `sisa` = total dikurangi Σ alokasi pembayaran yang menunjuk invoice
 * ini (N4).
 *
 * Σ alokasi diambil lewat SUBQUERY berkorelasi, bukan leftJoin kedua: baris
 * invoice sudah digandakan oleh join ke `purchase_invoice_lines`, dan join
 * kedua akan mengalikan keduanya — Σ subtotal dan Σ alokasi sama-sama membesar
 * sebanyak baris lawannya, dan totalnya terlihat masuk akal sampai ada invoice
 * dengan dua baris dan dua pembayaran.
 */
export async function listInvoices(opts: {
  clientId: string
  periodStart: string
  periodEnd: string
  supplierId?: string
}) {
  const filters = [
    eq(purchaseInvoices.clientId, opts.clientId),
    sql`${purchaseInvoices.tanggal} >= ${opts.periodStart}`,
    sql`${purchaseInvoices.tanggal} <= ${opts.periodEnd}`,
  ]
  if (opts.supplierId) filters.push(eq(purchaseInvoices.supplierId, opts.supplierId))

  const rows = await db
    .select({
      id: purchaseInvoices.id,
      tanggal: purchaseInvoices.tanggal,
      noInvoice: purchaseInvoices.noInvoice,
      supplierId: purchaseInvoices.supplierId,
      supplierNama: masterSupplier.nama,
      caraBayar: purchaseInvoices.caraBayar,
      ppn: purchaseInvoices.ppn,
      jumlahTermin: purchaseInvoices.jumlahTermin,
      jatuhTempoAkhir: purchaseInvoices.jatuhTempoAkhir,
      journalId: purchaseInvoices.journalId,
      createdAt: purchaseInvoices.createdAt,
      createdByName: users.name,
      subtotalDb: sql<string>`coalesce(sum(${purchaseInvoiceLines.subtotal}), 0)::numeric(18,2)::text`,
      lineCount: sql<number>`count(${purchaseInvoiceLines.id})::int`,
      teralokasiDb: sql<string>`(
        select coalesce(sum(a.nominal), 0)::numeric(18,2)::text
        from cash_mutation_allocations a
        where a.invoice_id = ${purchaseInvoices.id}
      )`,
    })
    .from(purchaseInvoices)
    .innerJoin(masterSupplier, eq(purchaseInvoices.supplierId, masterSupplier.id))
    .innerJoin(users, eq(purchaseInvoices.createdBy, users.id))
    .leftJoin(purchaseInvoiceLines, eq(purchaseInvoiceLines.invoiceId, purchaseInvoices.id))
    .where(and(...filters))
    .groupBy(purchaseInvoices.id, masterSupplier.nama, users.name)
    .orderBy(desc(purchaseInvoices.tanggal), asc(purchaseInvoices.noInvoice))

  return rows.map(r => {
    const totalMinor = (toMinorUnits(r.subtotalDb) ?? 0) + (toMinorUnits(r.ppn) ?? 0)
    const teralokasiMinor = toMinorUnits(r.teralokasiDb) ?? 0
    // Invoice TUNAI tidak pernah punya sisa — ia dibayar saat dibuat, dan
    // hutangnya tidak pernah lahir. Invoice KREDIT: sisa = total − Σ alokasi,
    // DITURUNKAN setiap kali dibaca (D37, P3).
    const sisaMinor = r.caraBayar === 'kredit' ? totalMinor - teralokasiMinor : 0
    return {
      ...r,
      subtotal: r.subtotalDb,
      total: fromMinorUnits(totalMinor),
      teralokasi: r.teralokasiDb,
      sisa: fromMinorUnits(sisaMinor),
      status:
        r.caraBayar === 'tunai'
          ? 'tunai'
          : sisaMinor <= 0
            ? 'lunas'
            : teralokasiMinor > 0
              ? 'sebagian'
              : 'belum dibayar',
    }
  })
}

/**
 * Menyusun statement jurnal sebuah invoice yang DIUBAH — pasangan
 * `syncMutationJournal` untuk Pembelian. Tidak menulis sendiri: hasilnya masuk
 * `db.batch` pemanggil bersama perubahan invoicenya (D31, P10).
 *
 * Nasib jurnal lamanya diputuskan `nasibJurnalModul` — aturan yang SAMA dengan
 * mutasi kas (keputusan Ricko 2026-10-26):
 *   - `terkunci`        → 409, arahkan ke jurnal balik;
 *   - `sudah-dibalik`   → jurnal lama + pembaliknya tidak disentuh, invoice
 *                         mendapat jurnal draf BARU;
 *   - `ubah-terposting` → dibangun ulang di tempat, tetap terposting, riwayatnya
 *                         membawa nilai_sebelum/nilai_sesudah (D42, sama dengan M8);
 *   - `bebas`           → dibangun ulang, atau dibuat bila invoice lama belum
 *                         berjurnal (journal_id nullable — invoice tanpa jurnal
 *                         berarti pembelian yang tidak pernah masuk buku).
 */
export async function syncInvoiceJournal(opts: {
  invoice: { id: string; clientId: string; journalId: string | null }
  tanggal: string
  keterangan: string
  lines: readonly JournalLineValue[]
  userId: string | null
}): Promise<{ error: NextResponse } | { statements: BatchItem<'pg'>[]; journalId: string }> {
  const { invoice } = opts
  const { nasib, jurnal } = await loadNasibJurnalModul(invoice.journalId, invoice.clientId)
  if (nasib === 'terkunci') {
    return {
      error: NextResponse.json(
        {
          error: 'Jurnal invoice ini sudah diposting — invoicenya tidak bisa diubah.',
          details: [
            'Buat jurnal balik untuk jurnal itu dan posting pembaliknya, baru ubah invoicenya.',
            'Kalau klien ini memang perlu menyunting posting, nyalakan setelannya di Settings › Pembukuan — setiap perubahan akan tercatat lengkap di riwayat.',
          ],
        },
        { status: 409 }
      ),
    }
  }

  const lama = nasib === 'sudah-dibalik' ? null : jurnal
  const ubahTerposting = nasib === 'ubah-terposting'
  const journalId = lama?.id ?? randomUUID()
  const statements: BatchItem<'pg'>[] = []

  // Mitigasi (a) D42 — hanya untuk jurnal TERPOSTING yang dibuka setelan.
  const sebelum =
    ubahTerposting && lama
      ? { tanggal: lama.tanggal, noBukti: lama.noBukti, lines: await loadJournalLineValues(lama.id) }
      : null

  if (lama) {
    statements.push(
      db
        .update(journalEntries)
        .set({ tanggal: opts.tanggal, keterangan: opts.keterangan, updatedAt: new Date() })
        .where(eq(journalEntries.id, journalId)),
      db.delete(journalLines).where(eq(journalLines.journalId, journalId))
    )
  } else {
    statements.push(
      db.insert(journalEntries).values({
        id: journalId,
        clientId: invoice.clientId,
        tanggal: opts.tanggal,
        noBukti: null,
        keterangan: opts.keterangan,
        sumber: 'pembelian',
        createdBy: opts.userId ?? invoice.clientId,
      })
    )
  }

  statements.push(
    db.insert(journalLines).values(
      opts.lines.map(l => ({
        journalId,
        masterCoaId: l.masterCoaId,
        debit: l.debit,
        kredit: l.kredit,
        keterangan: l.keterangan,
        lineOrder: l.lineOrder,
      }))
    ),
    recordJournalEvent({
      clientId: invoice.clientId,
      journalId,
      event: lama ? 'updated' : 'created',
      userId: opts.userId,
      nilaiSebelum: sebelum,
      nilaiSesudah: ubahTerposting ? { tanggal: opts.tanggal, noBukti: lama?.noBukti ?? null, lines: opts.lines } : null,
    })
  )
  return { statements, journalId }
}
