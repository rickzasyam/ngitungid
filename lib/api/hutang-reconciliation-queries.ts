import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm'
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
import {
  aggregateBalanceSheet,
  saldoNeracaPerAkun,
  type AggLineAkun,
  type SaldoAkunNeraca,
} from '@/lib/financial-agg'
import { rupiahKeSen, type PenjelasBaris } from '@/lib/hutang-reconciliation'

// Pembaca data rekonsiliasi hutang (F3). Hidup terpisah dari hutang-queries.ts
// karena menyentuh DUA dunia yang tidak disentuh monitoring hutang: laporan
// neraca hasil ekstraksi, dan jurnal manual.

export type AkunHutangSupplier = { id: string; kode: string; nama: string }

export type NeracaPembanding = {
  reportId: string
  periodStart: string
  /** Tanggal potret neraca — SELURUH perbandingan dipotong di tanggal ini. */
  periodEnd: string
  /**
   * Saldo akun hutang supplier di neraca ini. `totalMinor` null = tidak satu
   * pun akun hutang supplier dipetakan di neraca — BUKAN saldo nol.
   */
  saldo: { perAkun: SaldoAkunNeraca[]; totalMinor: number | null }
  /**
   * Hutang usaha versi Analytics (baris hutang bernama "dagang", dasar DPO)
   * untuk neraca yang SAMA, dalam SEN. Bukan angka pembanding — ditampilkan
   * supaya perbedaan cakupan kedua halaman terlihat, bukan ditebak.
   */
  hutangUsahaAnalyticsMinor: number
}

/**
 * Neraca terbaru dengan `period_end ≤ asOf`, beserta saldo akun hutang
 * supplier di dalamnya.
 *
 * ══ LEWAT lib/financial-agg.ts, BUKAN QUERY SENDIRI (P5) ═════════════════
 * Angka pembandingnya `saldoNeracaPerAkun` — baris neraca yang DIPETAKAN ke
 * akun hutang supplier, himpunan akun yang sama dengan daftar penjelas
 * (keputusan Ricko di CP-8). Dulu `hutangUsaha` (predikat nama "dagang"):
 * klien yang mencatat hutang supplier di "Hutang Pihak Ketiga" jadi selalu
 * berselisih sebesar seluruh hutangnya, karena neraca-nya tidak pernah punya
 * baris "dagang". `hutangUsaha` tetap dihitung, tapi hanya sebagai
 * keterangan "versi Analytics" di layar.
 *
 * Pembentukan AggLine mengikuti route dashboard persis — termasuk aturan yang
 * paling mudah dilanggar: `nama` diisi RAW NAME dari PDF, bukan
 * `master_coa.nama` (lihat dok AggLine.nama). Predikat "dagang" di
 * `hutangUsaha` mencocokkan nama itu.
 *
 * `null` = belum ada neraca yang bisa dibandingkan — BUKAN hutang nol.
 */
export async function loadNeracaPembanding(
  clientId: string,
  asOf: string,
  akunIds: readonly string[]
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
      masterCoaId: reportLineItems.masterCoaId,
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

  const lines: AggLineAkun[] = items.map(it => ({
    amount: Number(it.amount),
    masterCoaId: it.masterCoaId,
    // SENGAJA rawName, bukan master_coa.nama — lihat doc AggLine.nama.
    nama: it.rawName,
    displayName: it.coaNama ?? it.rawName,
    kelompok: it.kelompok ?? '',
    subKelompok: it.subKelompok ?? '',
    classCf: it.classCf,
    isSubtotal: it.isSubtotal,
    status: it.status,
  }))

  return {
    reportId: report.id,
    periodStart: report.periodStart,
    periodEnd: report.periodEnd,
    saldo: saldoNeracaPerAkun(lines, akunIds),
    hutangUsahaAnalyticsMinor: rupiahKeSen(aggregateBalanceSheet(lines).hutangUsaha),
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
 *
 * Himpunan yang SAMA dipakai dua kali: penjelas selisih, dan angka neraca
 * pembandingnya. Kode + nama ikut dibaca karena panel wajib menyebut akun
 * mana saja yang dijumlahkan (keputusan Ricko di CP-8). Urut menurut kode.
 */
export async function loadAkunHutangSupplier(clientId: string): Promise<AkunHutangSupplier[]> {
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
  const ids = [
    ...new Set(
      [...dariInvoice, ...dariSupplier].map(r => r.id).filter((x): x is string => typeof x === 'string')
    ),
  ]
  if (ids.length === 0) return []
  return db
    .select({ id: masterCoa.id, kode: masterCoa.kode, nama: masterCoa.nama })
    .from(masterCoa)
    .where(and(eq(masterCoa.clientId, clientId), inArray(masterCoa.id, ids)))
    .orderBy(asc(masterCoa.kode))
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
