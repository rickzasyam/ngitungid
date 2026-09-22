import { NextResponse } from 'next/server'
import { fromMinorUnits } from '@/lib/journal'
import { jatuhTempoMendekat } from '@/lib/hutang'
import { guardHutang } from '@/lib/api/hutang-guard'
import { loadHutang } from '@/lib/api/hutang-queries'

export const runtime = 'nodejs'

const DALAM_HARI_BAWAAN = 30
const DALAM_HARI_MAX = 365

// GET /api/hutang/jatuh-tempo?clientId[&asOf][&dalamHari=30]
//
// ══ PER CICILAN, BUKAN PER INVOICE ═══════════════════════════════════════
// Invoice 6 termin yang jatuh tempo akhirnya Desember tetap punya cicilan yang
// jatuh tempo minggu ini. Daftar yang memakai `jatuh_tempo_akhir` saja akan
// menyembunyikan lima dari enam kewajibannya sampai bulan terakhir — dan pada
// saat itu semuanya sudah telat.
//
// Yang SUDAH LEWAT dan belum lunas ikut tampil, di urutan paling atas: daftar
// "mendekati jatuh tempo" yang menyembunyikan yang sudah telat adalah daftar
// yang membuat orang merasa aman.
export async function GET(req: Request) {
  const g = await guardHutang(req)
  if ('error' in g) return g.error

  const url = new URL(req.url)
  const raw = url.searchParams.get('dalamHari')
  let dalamHari = DALAM_HARI_BAWAAN
  if (raw !== null && raw !== '') {
    const n = Number(raw)
    if (!Number.isInteger(n) || n < 0 || n > DALAM_HARI_MAX) {
      return NextResponse.json(
        { error: `dalamHari harus bilangan bulat 0–${DALAM_HARI_MAX}.` },
        { status: 400 }
      )
    }
    dalamHari = n
  }

  const { denganCicilan } = await loadHutang({ clientId: g.clientId })
  const items = jatuhTempoMendekat(denganCicilan, g.asOf, dalamHari)

  return NextResponse.json({
    asOf: g.asOf,
    dalamHari,
    count: items.length,
    items: items.map(i => ({
      invoiceId: i.invoiceId,
      noInvoice: i.noInvoice,
      supplierId: i.supplierId,
      supplierNama: i.supplierNama,
      terminUrutan: i.terminUrutan,
      tanggal: i.tanggal,
      sisa: fromMinorUnits(i.sisaMinor),
      hariLagi: i.hariLagi,
      /** Negatif hariLagi = sudah lewat. Dikirim eksplisit supaya layar tidak
       *  perlu menghitung ulang tanggal di browser (P2). */
      telat: i.hariLagi < 0,
    })),
  })
}
