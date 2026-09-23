import { NextResponse } from 'next/server'
import { fromMinorUnits } from '@/lib/journal'
import { supplierSummary } from '@/lib/hutang'
import { reconcileHutang } from '@/lib/hutang-reconciliation'
import { guardHutang } from '@/lib/api/hutang-guard'
import { loadHutang } from '@/lib/api/hutang-queries'
import {
  loadAkunHutangSupplier,
  loadNeracaPembanding,
  loadPenjelasJurnalManual,
} from '@/lib/api/hutang-reconciliation-queries'

export const runtime = 'nodejs'

// GET /api/hutang/reconciliation?clientId[&asOf]
//
// Sisa hutang per supplier vs saldo AKUN HUTANG SUPPLIER di neraca (D41;
// cakupan akun diputuskan Ricko di CP-8). requireInternal lewat guardHutang —
// sama dengan keempat route /api/hutang lainnya, dan sama-sama baca-saja.
//
// ══ SATU HIMPUNAN AKUN, DUA PEMAKAIAN ════════════════════════════════════
// Akun hutang supplier (dipakai invoice atau jadi default supplier) menentukan
// angka neraca pembanding DAN daftar penjelas. Akun yang dijumlahkan dikirim
// ke layar lengkap dengan kode + nama, begitu pula akun yang tidak ditemukan
// di neraca — tanpa itu Rekonsiliasi dan Analytics menampilkan dua "hutang"
// berbeda tanpa penjelasan.
//
// ══ KEDUA SISI DIPOTONG DI TANGGAL YANG SAMA ═════════════════════════════
// Neraca adalah potret SATU tanggal: `period_end` laporan neraca terbaru yang
// ≤ asOf. Sisi supplier dipotong di tanggal itu juga — invoice menurut
// tanggalnya, pembayaran menurut tanggal mutasinya. Membandingkan neraca
// Februari dengan hutang hari ini menghasilkan selisih yang sepenuhnya
// karangan, dan tidak ada yang akan tahu itu karangan.
//
// Kalau belum ada neraca sama sekali, sisi supplier dipotong di asOf dan
// selisihnya `null` — bukan nol, yang akan terbaca "cocok". Begitu juga bila
// neracanya ada tapi tidak satu pun akun hutang supplier dipetakan di sana.
export async function GET(req: Request) {
  const g = await guardHutang(req)
  if ('error' in g) return g.error

  const akun = await loadAkunHutangSupplier(g.clientId)
  const akunIds = akun.map(a => a.id)

  const neraca = await loadNeracaPembanding(g.clientId, g.asOf, akunIds)
  const tanggalPembanding = neraca?.periodEnd ?? g.asOf

  const { invoices, alokasi } = await loadHutang({
    clientId: g.clientId,
    sampaiTanggal: tanggalPembanding,
  })
  const perSupplier = supplierSummary(invoices, alokasi)

  const jurnalManualHutang = await loadPenjelasJurnalManual({
    clientId: g.clientId,
    akunIds,
    sampaiTanggal: tanggalPembanding,
  })

  const r = reconcileHutang({
    perSupplier,
    saldoNeracaHutangMinor: neraca?.saldo.totalMinor ?? null,
    jurnalManualHutang,
  })

  const saldoPerAkun = new Map((neraca?.saldo.perAkun ?? []).map(s => [s.masterCoaId, s.saldoMinor]))

  const penjelas = (x: (typeof r.penjelas)['berSupplier']) => ({
    total: fromMinorUnits(x.totalMinor),
    rows: x.rows.map(b => ({
      journalId: b.journalId,
      noBukti: b.noBukti,
      tanggal: b.tanggal,
      keterangan: b.keterangan,
      akunKode: b.akunKode,
      akunNama: b.akunNama,
      supplierId: b.supplierId,
      supplierNama: b.supplierNama,
      /** Efek pada saldo hutang: positif menambah, negatif mengurangi. */
      efek: fromMinorUnits(b.efekMinor),
    })),
  })

  return NextResponse.json({
    asOf: g.asOf,
    /** Tanggal potret yang dipakai KEDUA sisi. Selalu ditampilkan di layar. */
    tanggalPembanding,
    neraca: neraca
      ? {
          reportId: neraca.reportId,
          periodStart: neraca.periodStart,
          periodEnd: neraca.periodEnd,
          /** Akun yang saldonya DIJUMLAHKAN jadi totalNeraca — wajib tampil di layar. */
          akunDijumlahkan: akun.flatMap(a => {
            const s = saldoPerAkun.get(a.id)
            return s === undefined ? [] : [{ id: a.id, kode: a.kode, nama: a.nama, saldo: fromMinorUnits(s) }]
          }),
          /** Akun hutang supplier yang TIDAK dipetakan di neraca ini. */
          akunTidakDitemukan: akun
            .filter(a => !saldoPerAkun.has(a.id))
            .map(a => ({ id: a.id, kode: a.kode, nama: a.nama })),
          /** Keterangan saja — cakupan Analytics berbeda (baris "dagang"). */
          hutangUsahaAnalytics: fromMinorUnits(neraca.hutangUsahaAnalyticsMinor),
        }
      : null,
    rows: r.rows.map(x => ({
      supplierId: x.supplierId,
      supplierNama: x.supplierNama,
      sisa: fromMinorUnits(x.sisaMinor),
    })),
    totalSupplier: fromMinorUnits(r.totalSupplierMinor),
    totalNeraca: r.totalNeracaMinor === null ? null : fromMinorUnits(r.totalNeracaMinor),
    // BERTANDA, tidak dibulatkan, tidak dikepit — dan null bila neraca belum
    // ada. fromMinorUnits mempertahankan tanda minus.
    selisih: r.selisihMinor === null ? null : fromMinorUnits(r.selisihMinor),
    penjelas: {
      berSupplier: penjelas(r.penjelas.berSupplier),
      tanpaSupplier: penjelas(r.penjelas.tanpaSupplier),
    },
  })
}
