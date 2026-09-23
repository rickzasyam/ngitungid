import { and, desc, eq, inArray, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import {
  financialReports,
  journalEntries,
  journalLines,
  masterCoa,
  masterSupplier,
  purchaseInvoices,
  reportLineItems,
} from '@/lib/db/schema'
import { aggregateBalanceSheet, type AggLine } from '@/lib/financial-agg'
import { rupiahKeSen, type PenjelasBaris } from '@/lib/hutang-reconciliation'

// Pembaca data rekonsiliasi hutang (F3). Hidup terpisah dari hutang-queries.ts
// karena menyentuh DUA dunia yang tidak disentuh monitoring hutang: laporan
// neraca hasil ekstraksi, dan jurnal manual.

export type NeracaPembanding = {
  reportId: string
  periodStart: string
  /** Tanggal potret neraca — SELURUH perbandingan dipotong di tanggal ini. */
  periodEnd: string
  /** Hutang usaha dari neraca, dalam SEN. */
  hutangUsahaMinor: number
}

/**
 * Neraca terbaru dengan `period_end ≤ asOf`, beserta hutang usahanya.
 *
 * ══ LEWAT lib/financial-agg.ts, BUKAN QUERY SENDIRI (P5) ═════════════════
 * `aggregateBalanceSheet` sudah punya definisi "hutang usaha" — baris hutang
 * yang namanya memuat "dagang", dasar DPO di Analytics. Rekonsiliasi memakai
 * ukuran YANG SAMA, bukan `totalHutang` yang mencampur utang pajak, gaji, dan
 * pihak ketiga yang bukan urusan supplier. Agregator kedua di sini akan
 * membuat "hutang usaha" di Analytics dan di Rekonsiliasi bisa berbeda untuk
 * neraca yang sama.
 *
 * Pembentukan AggLine mengikuti route dashboard persis — termasuk aturan yang
 * paling mudah dilanggar: `nama` diisi RAW NAME dari PDF, bukan
 * `master_coa.nama` (lihat dok AggLine.nama). Predikat "dagang" mencocokkan
 * nama itu; mengisinya dengan nama COA membuat hutang usaha ikut bergeser saat
 * seseorang merapikan label akun.
 *
 * `null` = belum ada neraca yang bisa dibandingkan — BUKAN hutang nol.
 */
export async function loadNeracaPembanding(
  clientId: string,
  asOf: string
): Promise<NeracaPembanding | null> {
  const [report] = await db
    .select({
      id: financialReports.id,
      periodStart: financialReports.periodStart,
      periodEnd: financialReports.periodEnd,
    })
    .from(financialReports)
    .where(
      and(
        eq(financialReports.clientId, clientId),
        eq(financialReports.reportType, 'neraca'),
        // Perbandingan STRING — 'YYYY-MM-DD' urut leksikografis (P2).
        sql`${financialReports.periodEnd} <= ${asOf}`
      )
    )
    .orderBy(desc(financialReports.periodEnd))
    .limit(1)
  if (!report) return null

  const items = await db
    .select({
      amount: reportLineItems.amount,
      rawName: reportLineItems.rawName,
      coaNama: masterCoa.nama,
      isSubtotal: reportLineItems.isSubtotal,
      status: reportLineItems.status,
      kelompok: masterCoa.kelompok,
      subKelompok: masterCoa.subKelompok,
      classCf: masterCoa.classCf,
    })
    .from(reportLineItems)
    .leftJoin(masterCoa, eq(reportLineItems.masterCoaId, masterCoa.id))
    .where(eq(reportLineItems.reportId, report.id))

  const lines: AggLine[] = items.map(it => ({
    amount: Number(it.amount),
    // SENGAJA rawName, bukan master_coa.nama — lihat doc AggLine.nama.
    nama: it.rawName,
    displayName: it.coaNama ?? it.rawName,
    kelompok: it.kelompok ?? '',
    subKelompok: it.subKelompok ?? '',
    classCf: it.classCf,
    isSubtotal: it.isSubtotal,
    status: it.status,
  }))

  const bs = aggregateBalanceSheet(lines)
  return {
    reportId: report.id,
    periodStart: report.periodStart,
    periodEnd: report.periodEnd,
    hutangUsahaMinor: rupiahKeSen(bs.hutangUsaha),
  }
}

/**
 * Akun yang benar-benar menampung hutang SUPPLIER di sistem ini.
 *
 * Didefinisikan dari PEMAKAIANNYA, bukan dari tipe akun: akun hutang yang
 * pernah dipakai invoice pembelian, atau yang disetel sebagai akun hutang
 * default sebuah supplier. Memakai "semua akun liability" akan menyeret utang
 * pajak dan gaji ke daftar penjelas — baris yang tidak pernah bisa menjelaskan
 * selisih hutang supplier, dan yang membuat orang berhenti membaca daftarnya.
 */
export async function loadAkunHutangSupplier(clientId: string): Promise<string[]> {
  const dariInvoice = await db
    .selectDistinct({ id: purchaseInvoices.akunHutangId })
    .from(purchaseInvoices)
    .where(and(eq(purchaseInvoices.clientId, clientId), sql`${purchaseInvoices.akunHutangId} is not null`))
  const dariSupplier = await db
    .selectDistinct({ id: masterSupplier.akunHutangDefaultId })
    .from(masterSupplier)
    .where(
      and(eq(masterSupplier.clientId, clientId), sql`${masterSupplier.akunHutangDefaultId} is not null`)
    )
  return [
    ...new Set(
      [...dariInvoice, ...dariSupplier].map(r => r.id).filter((x): x is string => typeof x === 'string')
    ),
  ]
}

/**
 * Baris jurnal MANUAL TERPOSTING ke akun hutang supplier, sampai `sampaiTanggal`.
 *
 * Tiga saringan, dan ketiganya perlu:
 *   - `sumber = 'manual'` — jurnal dari modul pembelian & mutasi kas SUDAH
 *     terwakili lewat invoice dan alokasinya. Memasukkannya akan menampilkan
 *     setiap invoice dua kali: sekali di sisi supplier, sekali sebagai penjelas.
 *   - `status = 'posted'` — draf belum masuk buku, jadi belum bisa menjelaskan
 *     angka yang sudah dilaporkan.
 *   - tanggal ≤ tanggal neraca — sama dengan sisi supplier.
 */
export async function loadPenjelasJurnalManual(opts: {
  clientId: string
  akunIds: readonly string[]
  sampaiTanggal: string
}): Promise<PenjelasBaris[]> {
  if (opts.akunIds.length === 0) return []
  const rows = await db
    .select({
      journalId: journalEntries.id,
      noBukti: journalEntries.noBukti,
      tanggal: journalEntries.tanggal,
      keteranganJurnal: journalEntries.keterangan,
      keteranganBaris: journalLines.keterangan,
      akunKode: masterCoa.kode,
      akunNama: masterCoa.nama,
      supplierId: journalLines.supplierId,
      supplierNama: masterSupplier.nama,
      debit: journalLines.debit,
      kredit: journalLines.kredit,
    })
    .from(journalLines)
    .innerJoin(journalEntries, eq(journalLines.journalId, journalEntries.id))
    .innerJoin(masterCoa, eq(journalLines.masterCoaId, masterCoa.id))
    .leftJoin(masterSupplier, eq(journalLines.supplierId, masterSupplier.id))
    .where(
      and(
        eq(journalEntries.clientId, opts.clientId),
        eq(journalEntries.sumber, 'manual'),
        eq(journalEntries.status, 'posted'),
        sql`${journalEntries.tanggal} <= ${opts.sampaiTanggal}`,
        inArray(journalLines.masterCoaId, [...opts.akunIds])
      )
    )

  return rows.map(r => ({
    journalId: r.journalId,
    noBukti: r.noBukti,
    tanggal: r.tanggal,
    keterangan: r.keteranganBaris ?? r.keteranganJurnal,
    akunKode: r.akunKode,
    akunNama: r.akunNama,
    supplierId: r.supplierId,
    supplierNama: r.supplierNama,
    debit: r.debit,
    kredit: r.kredit,
  }))
}
