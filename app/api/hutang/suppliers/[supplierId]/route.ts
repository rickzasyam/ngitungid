import { NextResponse } from 'next/server'
import { fromMinorUnits, toMinorUnits } from '@/lib/journal'
import { ageBuckets, emptyBuckets, invoiceOutstanding, mergeBuckets, AGE_BUCKETS } from '@/lib/hutang'
import { guardHutang, UUID_RE } from '@/lib/api/hutang-guard'
import { loadHutang, loadPembayaranInvoice, loadSupplier } from '@/lib/api/hutang-queries'

export const runtime = 'nodejs'

// GET /api/hutang/suppliers/[supplierId]?clientId[&asOf]
//
// Detail satu supplier: invoicenya, cicilan turunannya, dan pembayaran yang
// sudah teralokasi ke masing-masing — supaya pertanyaan "kenapa sisanya
// sekian" bisa dijawab tanpa membuka modul lain.
export async function GET(
  req: Request,
  { params }: { params: Promise<{ supplierId: string }> }
) {
  const g = await guardHutang(req)
  if ('error' in g) return g.error

  const { supplierId } = await params
  if (!UUID_RE.test(supplierId)) {
    return NextResponse.json({ error: 'supplierId tidak valid.' }, { status: 400 })
  }

  // Dibaca lebih dulu supaya supplier milik klien LAIN menjawab 404, bukan
  // daftar kosong yang terbaca seperti "supplier ini tidak punya hutang".
  const supplier = await loadSupplier(supplierId, g.clientId)
  if (!supplier) {
    return NextResponse.json({ error: 'Supplier tidak ditemukan pada klien ini.' }, { status: 404 })
  }

  const { invoices, alokasi, denganCicilan } = await loadHutang({
    clientId: g.clientId,
    supplierId,
  })

  const pembayaran = await loadPembayaranInvoice(invoices.map(i => i.id))

  let ember = emptyBuckets()
  const daftar = denganCicilan.map(d => {
    ember = mergeBuckets(ember, ageBuckets(d.cicilan, g.asOf))
    const bayarInvoice = pembayaran.filter(p => p.invoiceId === d.invoice.id)
    return {
      id: d.invoice.id,
      noInvoice: d.invoice.noInvoice,
      tanggal: d.invoice.tanggal,
      jatuhTempoAkhir: d.invoice.jatuhTempoAkhir,
      jumlahTermin: d.invoice.jumlahTermin,
      total: fromMinorUnits(d.invoice.totalMinor),
      sisa: fromMinorUnits(invoiceOutstanding(d.invoice, alokasi)),
      cicilan: d.cicilan.map(c => ({
        urutan: c.urutan,
        tanggal: c.tanggal,
        nominal: fromMinorUnits(c.nominalMinor),
        tertutup: fromMinorUnits(c.tertutupMinor),
        sisa: fromMinorUnits(c.sisaMinor),
        lunas: c.lunas,
        /** Ada alokasi berpaku ke cicilan ini — penyimpangan dari FIFO (D40). */
        dipakuManual: c.dipakuManual === true,
      })),
      pembayaran: bayarInvoice.map(p => ({
        allocationId: p.allocationId,
        mutationId: p.mutationId,
        tanggal: p.tanggal,
        keterangan: p.keterangan,
        nominal: fromMinorUnits(toMinorUnits(p.nominal) ?? 0),
        terminUrutan: p.terminUrutan,
      })),
      /** Paku yang cicilan tujuannya sudah tidak ada — ditampilkan, bukan ditelan. */
      pakuYatim: d.pakuYatim.map(p => ({
        terminUrutan: p.terminUrutan,
        nominal: fromMinorUnits(p.nominalMinor),
      })),
    }
  })

  const totalMinor = invoices.reduce((s, i) => s + i.totalMinor, 0)
  const sisaMinor = invoices.reduce((s, i) => s + invoiceOutstanding(i, alokasi), 0)

  return NextResponse.json({
    asOf: g.asOf,
    supplier,
    total: fromMinorUnits(totalMinor),
    dibayar: fromMinorUnits(totalMinor - sisaMinor),
    sisa: fromMinorUnits(sisaMinor),
    buckets: Object.fromEntries(AGE_BUCKETS.map(k => [k, fromMinorUnits(ember[k])])),
    invoices: daftar,
  })
}
