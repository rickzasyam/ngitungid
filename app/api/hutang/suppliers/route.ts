import { NextResponse } from 'next/server'
import { fromMinorUnits } from '@/lib/journal'
import { ageBuckets, emptyBuckets, mergeBuckets, supplierSummary, AGE_BUCKETS } from '@/lib/hutang'
import { guardHutang } from '@/lib/api/hutang-guard'
import { loadHutang } from '@/lib/api/hutang-queries'

export const runtime = 'nodejs'

// GET /api/hutang/suppliers?clientId[&asOf]
//
// Rekap hutang per supplier: total, sudah dibayar, sisa — plus ember umur per
// supplier, supaya daftar ini sendiri sudah menjawab "siapa yang paling telat",
// bukan cuma "siapa yang paling besar".
export async function GET(req: Request) {
  const g = await guardHutang(req)
  if ('error' in g) return g.error

  const { invoices, alokasi, denganCicilan } = await loadHutang({ clientId: g.clientId })

  // Ember per supplier dikumpulkan dari cicilan invoice-invoicenya.
  const emberPerSupplier = new Map<string, ReturnType<typeof emptyBuckets>>()
  for (const d of denganCicilan) {
    const lama = emberPerSupplier.get(d.invoice.supplierId) ?? emptyBuckets()
    emberPerSupplier.set(d.invoice.supplierId, mergeBuckets(lama, ageBuckets(d.cicilan, g.asOf)))
  }

  const rekap = supplierSummary(invoices, alokasi).map(s => {
    const ember = emberPerSupplier.get(s.supplierId) ?? emptyBuckets()
    const telatMinor = ember.telat1_30 + ember.telat31_60 + ember.telat61_90 + ember.telatLebih90
    return {
      supplierId: s.supplierId,
      supplierNama: s.supplierNama,
      invoiceCount: s.invoiceCount,
      total: fromMinorUnits(s.totalMinor),
      dibayar: fromMinorUnits(s.dibayarMinor),
      sisa: fromMinorUnits(s.sisaMinor),
      telat: fromMinorUnits(telatMinor),
      buckets: Object.fromEntries(AGE_BUCKETS.map(k => [k, fromMinorUnits(ember[k])])),
    }
  })

  return NextResponse.json({ asOf: g.asOf, count: rekap.length, suppliers: rekap })
}
