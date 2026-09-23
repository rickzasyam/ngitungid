import { and, asc, eq, inArray, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import {
  cashMutationAllocations,
  cashMutations,
  masterSupplier,
  purchaseInvoiceLines,
  purchaseInvoices,
} from '@/lib/db/schema'
import { toMinorUnits } from '@/lib/journal'
import { buildTerminSchedule } from '@/lib/termin'
import {
  applyPayments,
  hutangInvoices,
  type AlokasiHutang,
  type CicilanTertutup,
  type InvoiceHutang,
} from '@/lib/hutang'

// Pembaca data monitoring hutang, dipakai BERSAMA keempat route /api/hutang.
// Hidup di modul terpisah karena Next menolak export non-handler di berkas
// route — dan karena keempat route menanyakan hal yang SAMA: "invoice kredit
// klien ini, beserta cicilan turunannya dan pembayaran yang sudah menutupnya".
//
// ══ DUA QUERY, BUKAN SATU JOIN BESAR ═════════════════════════════════════
// Invoice di-join ke barisnya untuk menghitung total; alokasi dibaca terpisah.
// Menggabungkannya jadi satu join akan MENGALIKAN keduanya — Σ subtotal dan
// Σ alokasi sama-sama membesar sebanyak baris lawannya, dan hasilnya terlihat
// masuk akal sampai ada invoice dengan dua baris dan dua pembayaran. Pelajaran
// yang sama sudah dibayar sekali di listInvoices (N4).
//
// ══ TIDAK ADA SATU ANGKA PUN YANG DISIMPAN ═══════════════════════════════
// Jadwal cicilan diturunkan lib/termin.ts, pencocokan pembayaran diturunkan
// lib/hutang.ts, dan keduanya dihitung ulang setiap permintaan. Itu memang
// keputusannya (D39): hutang yang disimpan adalah hutang yang basi diam-diam
// begitu satu jalur tulis lupa memperbaruinya.

export type InvoiceDenganCicilan = {
  invoice: InvoiceHutang
  cicilan: CicilanTertutup[]
  /** Paku yang cicilan tujuannya tidak ada lagi — ditampilkan, bukan ditelan. */
  pakuYatim: { terminUrutan: number; nominalMinor: number }[]
}

export type HutangData = {
  invoices: InvoiceHutang[]
  alokasi: AlokasiHutang[]
  denganCicilan: InvoiceDenganCicilan[]
}

/**
 * Seluruh invoice KREDIT klien beserta alokasinya, siap dihitung.
 *
 * `supplierId` opsional — dipakai route detail per supplier. Penyaringan
 * dilakukan di SQL, bukan setelah semuanya dibaca: klien dengan ribuan invoice
 * tidak perlu dimuat seluruhnya untuk menampilkan satu supplier.
 */
export async function loadHutang(opts: {
  clientId: string
  supplierId?: string
  /**
   * Potong invoice dan pembayaran di tanggal ini (inklusif). Dipakai
   * REKONSILIASI (F3): neraca adalah potret satu tanggal, dan membandingkannya
   * dengan hutang yang memuat invoice & pembayaran SESUDAH tanggal itu akan
   * menghasilkan selisih yang sepenuhnya karangan. Dihilangkan = semuanya,
   * perilaku monitoring hutang yang sudah ada tidak berubah.
   */
  sampaiTanggal?: string
}): Promise<HutangData> {
  const filters = [
    eq(purchaseInvoices.clientId, opts.clientId),
    // Invoice TUNAI tidak pernah jadi hutang — disaring sedini mungkin, dan
    // disaring lagi oleh hutangInvoices() di bawah. Dua lapis yang sengaja:
    // yang di SQL demi ukuran, yang di modul murni demi kebenaran.
    eq(purchaseInvoices.caraBayar, 'kredit'),
  ]
  if (opts.supplierId) filters.push(eq(purchaseInvoices.supplierId, opts.supplierId))
  // Perbandingan STRING — 'YYYY-MM-DD' urut leksikografis (P2).
  if (opts.sampaiTanggal) filters.push(sql`${purchaseInvoices.tanggal} <= ${opts.sampaiTanggal}`)

  const rows = await db
    .select({
      id: purchaseInvoices.id,
      caraBayar: purchaseInvoices.caraBayar,
      supplierId: purchaseInvoices.supplierId,
      supplierNama: masterSupplier.nama,
      noInvoice: purchaseInvoices.noInvoice,
      tanggal: purchaseInvoices.tanggal,
      jumlahTermin: purchaseInvoices.jumlahTermin,
      jatuhTempoAkhir: purchaseInvoices.jatuhTempoAkhir,
      ppn: purchaseInvoices.ppn,
      subtotalDb: sql<string>`coalesce(sum(${purchaseInvoiceLines.subtotal}), 0)::numeric(18,2)::text`,
    })
    .from(purchaseInvoices)
    .innerJoin(masterSupplier, eq(purchaseInvoices.supplierId, masterSupplier.id))
    .leftJoin(purchaseInvoiceLines, eq(purchaseInvoiceLines.invoiceId, purchaseInvoices.id))
    .where(and(...filters))
    .groupBy(purchaseInvoices.id, masterSupplier.nama)
    .orderBy(asc(purchaseInvoices.tanggal), asc(purchaseInvoices.noInvoice))

  const invoices: InvoiceHutang[] = rows.map(r => ({
    id: r.id,
    caraBayar: r.caraBayar,
    supplierId: r.supplierId,
    supplierNama: r.supplierNama,
    noInvoice: r.noInvoice,
    tanggal: r.tanggal,
    jumlahTermin: r.jumlahTermin,
    jatuhTempoAkhir: r.jatuhTempoAkhir,
    totalMinor: (toMinorUnits(r.subtotalDb) ?? 0) + (toMinorUnits(r.ppn) ?? 0),
  }))

  // Alokasi dibatasi ke KLIEN lewat mutasinya, bukan lewat invoicenya: alokasi
  // tidak punya client_id sendiri, dan menyaring lewat invoice akan melewatkan
  // alokasi yatim kalau invoicenya pernah hilang.
  const alokasiRows = await db
    .select({
      invoiceId: cashMutationAllocations.invoiceId,
      nominal: cashMutationAllocations.nominal,
      terminUrutan: cashMutationAllocations.terminUrutan,
    })
    .from(cashMutationAllocations)
    .innerJoin(cashMutations, eq(cashMutationAllocations.mutationId, cashMutations.id))
    .where(
      opts.sampaiTanggal
        ? // Pembayaran dipotong menurut TANGGAL MUTASINYA — kapan uangnya
          // bergerak di rekening, bukan kapan alokasinya dicatat di sistem.
          and(
            eq(cashMutations.clientId, opts.clientId),
            sql`${cashMutations.tanggal} <= ${opts.sampaiTanggal}`
          )
        : eq(cashMutations.clientId, opts.clientId)
    )
    .orderBy(asc(cashMutationAllocations.createdAt))

  const alokasi: AlokasiHutang[] = alokasiRows.map(a => ({
    invoiceId: a.invoiceId,
    nominal: a.nominal,
    terminUrutan: a.terminUrutan,
  }))

  const denganCicilan = hutangInvoices(invoices).map(invoice => {
    // Jadwal DITURUNKAN (D34) — tidak pernah disimpan. Invoice tanpa jatuh
    // tempo akhir tidak bisa punya jadwal; ia tampil sebagai satu kewajiban
    // tanpa tanggal, bukan sebagai jadwal karangan.
    const jadwal = invoice.jatuhTempoAkhir
      ? buildTerminSchedule({
          jatuhTempoAkhir: invoice.jatuhTempoAkhir,
          jumlahTermin: invoice.jumlahTermin,
          totalMinor: invoice.totalMinor,
        })
      : []
    const milikInvoice = alokasi.filter(a => a.invoiceId === invoice.id)
    const hasil = applyPayments(jadwal, milikInvoice)
    return { invoice, cicilan: hasil.cicilan, pakuYatim: hasil.pakuYatim }
  })

  return { invoices, alokasi, denganCicilan }
}

/** Supplier milik klien — untuk route detail, supaya 404-nya jujur. */
export async function loadSupplier(supplierId: string, clientId: string) {
  const [row] = await db
    .select({ id: masterSupplier.id, nama: masterSupplier.nama })
    .from(masterSupplier)
    .where(and(eq(masterSupplier.id, supplierId), eq(masterSupplier.clientId, clientId)))
    .limit(1)
  return row ?? null
}

/** Pembayaran yang menutup invoice-invoice ini, untuk detail per supplier. */
export async function loadPembayaranInvoice(invoiceIds: readonly string[]) {
  if (invoiceIds.length === 0) return []
  return db
    .select({
      invoiceId: cashMutationAllocations.invoiceId,
      allocationId: cashMutationAllocations.id,
      nominal: cashMutationAllocations.nominal,
      terminUrutan: cashMutationAllocations.terminUrutan,
      mutationId: cashMutations.id,
      tanggal: cashMutations.tanggal,
      keterangan: cashMutations.keterangan,
    })
    .from(cashMutationAllocations)
    .innerJoin(cashMutations, eq(cashMutationAllocations.mutationId, cashMutations.id))
    // inArray, BUKAN sql.raw dengan id yang dirangkai sendiri: id-nya memang
    // datang dari query kita sendiri hari ini, tapi rangkaian string di jalur
    // query adalah bentuk yang salah bahkan saat masukannya kebetulan aman —
    // ia hanya menunggu pemanggil berikutnya yang mengopernya dari luar.
    .where(inArray(cashMutationAllocations.invoiceId, [...invoiceIds]))
    .orderBy(asc(cashMutations.tanggal))
}
