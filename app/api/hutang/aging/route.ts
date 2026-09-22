import { NextResponse } from 'next/server'
import { fromMinorUnits } from '@/lib/journal'
import { ageBuckets, emptyBuckets, mergeBuckets, AGE_BUCKETS } from '@/lib/hutang'
import { guardHutang } from '@/lib/api/hutang-guard'
import { loadHutang } from '@/lib/api/hutang-queries'

export const runtime = 'nodejs'

// GET /api/hutang/aging?clientId[&asOf]
//
// Ringkasan umur hutang: berapa yang belum jatuh tempo, dan berapa yang telat
// di tiap ember. SELURUHNYA turunan — dihitung ulang tiap permintaan dari
// invoice dan alokasinya (D39).
export async function GET(req: Request) {
  const g = await guardHutang(req)
  if ('error' in g) return g.error

  const { denganCicilan } = await loadHutang({ clientId: g.clientId })

  let ember = emptyBuckets()
  let invoiceBersisa = 0
  let pakuYatim = 0

  for (const d of denganCicilan) {
    ember = mergeBuckets(ember, ageBuckets(d.cicilan, g.asOf))
    if (d.cicilan.some(c => !c.lunas && c.sisaMinor > 0)) invoiceBersisa++
    pakuYatim += d.pakuYatim.length
  }

  const totalMinor = AGE_BUCKETS.reduce((s, k) => s + ember[k], 0)

  return NextResponse.json({
    asOf: g.asOf,
    // Dikirim sebagai STRING 2 desimal, bukan angka: nominal rupiah bisa
    // melewati presisi float JS, dan titik tampil yang memformatnya tidak
    // pernah tahu ia sudah kehilangan sen (P1).
    buckets: Object.fromEntries(AGE_BUCKETS.map(k => [k, fromMinorUnits(ember[k])])),
    total: fromMinorUnits(totalMinor),
    invoiceBersisa,
    /** Alokasi berpaku yang cicilan tujuannya hilang (D40) — ditampilkan, bukan ditelan. */
    pakuYatim,
  })
}
