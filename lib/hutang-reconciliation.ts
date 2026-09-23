// Rekonsiliasi hutang supplier. MURNI (tanpa I/O, tanpa React).
//
// ══ YANG DIBANDINGKAN (D41) ══════════════════════════════════════════════
// Dua angka yang dua-duanya baru ada setelah Modul 1 & 2 jalan:
//   - SISA HUTANG PER SUPPLIER — invoice kredit dikurangi alokasi pembayaran,
//     dari lib/hutang.ts. TIDAK dihitung ulang di sini: dua penghitung sisa
//     hutang berarti dua jawaban, dan rekonsiliasi yang membandingkan dirinya
//     dengan salinannya sendiri tidak menemukan apa pun.
//   - SALDO AKUN HUTANG SUPPLIER DI NERACA — baris laporan neraca klien yang
//     dipetakan ke akun hutang supplier, lewat `saldoNeracaPerAkun` di
//     lib/financial-agg.ts (P5: tidak ada agregator kedua). Cakupan akun ini
//     diputuskan Ricko di CP-8; ia BUKAN `hutangUsaha` Analytics.
//
// ══ SELISIH DITAMPILKAN APA ADANYA ═══════════════════════════════════════
// Keputusan Ricko 2026-09-23: jangan dibulatkan, jangan disembunyikan.
//   - Tidak ada Math.abs: tandanya adalah separuh informasinya. Neraca lebih
//     besar berarti ada hutang yang tidak diketahui modul; lebih kecil berarti
//     modul mencatat hutang yang neraca tidak akui.
//   - Tidak ada ambang toleransi: selisih satu sen tetap selisih satu sen.
//     BALANCE_TOLERANCE di financial-agg.ts ada untuk identitas Aktiva=Pasiva
//     dari PDF — itu pertanyaan lain dengan sumber noise yang lain.
//   - Tidak ada neraca ≠ selisih nol. `null` berarti "belum bisa dibandingkan",
//     dan angka 0 di sana akan terbaca sebagai "cocok".
//
// ══ PENJELAS SELISIH ═════════════════════════════════════════════════════
// Jurnal MANUAL terposting yang menyentuh akun hutang supplier, dipisah
// bersupplier vs tanpa supplier (F1). Mereka ditampilkan sebagai kemungkinan
// sebab — BUKAN dikurangkan dari selisih. Selisih "setelah dijelaskan" adalah
// angka karangan: penjelas bisa sebagian, bisa dobel dengan invoice, bisa
// menjelaskan periode lain. Yang memutuskan apakah ia menjelaskan adalah
// akunting yang membacanya.

import { toMinorUnits } from '@/lib/journal'
import type { SupplierHutang } from '@/lib/hutang'

export type PenjelasBaris = {
  journalId: string
  noBukti: string | null
  tanggal: string
  keterangan: string | null
  akunKode: string
  akunNama: string
  supplierId: string | null
  supplierNama: string | null
  debit: unknown
  kredit: unknown
}

export type PenjelasDenganEfek = PenjelasBaris & {
  /**
   * Efek baris ini pada saldo hutang, dalam SEN. Untuk akun kewajiban: KREDIT
   * menambah hutang, DEBIT menguranginya — jadi efek = kredit − debit.
   */
  efekMinor: number
}

export type RekonRow = {
  supplierId: string
  supplierNama: string
  sisaMinor: number
}

export type RekonResult = {
  rows: RekonRow[]
  totalSupplierMinor: number
  /** null = belum ada neraca yang bisa dibandingkan. */
  totalNeracaMinor: number | null
  /**
   * neraca − supplier, dalam SEN. BERTANDA, tidak dibulatkan, tidak dikepit.
   * null bila neraca belum ada — BUKAN nol.
   */
  selisihMinor: number | null
  penjelas: {
    berSupplier: { rows: PenjelasDenganEfek[]; totalMinor: number }
    tanpaSupplier: { rows: PenjelasDenganEfek[]; totalMinor: number }
  }
}

/** Efek satu baris jurnal pada saldo hutang, dalam SEN: kredit − debit. */
export function efekHutangMinor(b: { debit?: unknown; kredit?: unknown }): number {
  return (toMinorUnits(b.kredit) ?? 0) - (toMinorUnits(b.debit) ?? 0)
}

/**
 * Membandingkan sisa hutang per supplier dengan saldo akun hutang supplier di neraca.
 *
 * `perSupplier` WAJIB keluaran `supplierSummary()` dari lib/hutang.ts — fungsi
 * ini hanya menjumlahkan `sisaMinor`-nya, tidak menghitung ulang dari invoice.
 */
export function reconcileHutang({
  perSupplier,
  saldoNeracaHutangMinor,
  jurnalManualHutang,
}: {
  perSupplier: readonly SupplierHutang[]
  saldoNeracaHutangMinor: number | null
  jurnalManualHutang: readonly PenjelasBaris[]
}): RekonResult {
  const rows: RekonRow[] = perSupplier.map(s => ({
    supplierId: s.supplierId,
    supplierNama: s.supplierNama,
    sisaMinor: s.sisaMinor,
  }))
  const totalSupplierMinor = rows.reduce((sum, r) => sum + r.sisaMinor, 0)

  const selisihMinor =
    saldoNeracaHutangMinor === null ? null : saldoNeracaHutangMinor - totalSupplierMinor

  const berSupplier: PenjelasDenganEfek[] = []
  const tanpaSupplier: PenjelasDenganEfek[] = []
  for (const b of jurnalManualHutang) {
    const denganEfek = { ...b, efekMinor: efekHutangMinor(b) }
    if (b.supplierId) berSupplier.push(denganEfek)
    else tanpaSupplier.push(denganEfek)
  }

  // Urutan tanggal, lalu nomor bukti: yang dicari akunting saat menelusuri
  // selisih adalah "kapan mulai berbeda", dan itu dibaca dari atas ke bawah.
  const urut = (a: PenjelasDenganEfek, b: PenjelasDenganEfek) =>
    a.tanggal !== b.tanggal
      ? a.tanggal.localeCompare(b.tanggal)
      : (a.noBukti ?? '').localeCompare(b.noBukti ?? '')
  berSupplier.sort(urut)
  tanpaSupplier.sort(urut)

  const total = (xs: PenjelasDenganEfek[]) => xs.reduce((s, x) => s + x.efekMinor, 0)

  return {
    rows,
    totalSupplierMinor,
    totalNeracaMinor: saldoNeracaHutangMinor,
    selisihMinor,
    penjelas: {
      berSupplier: { rows: berSupplier, totalMinor: total(berSupplier) },
      tanpaSupplier: { rows: tanpaSupplier, totalMinor: total(tanpaSupplier) },
    },
  }
}

/**
 * Rupiah dari agregator neraca → SEN.
 *
 * `aggregateBalanceSheet` bekerja dalam rupiah bertipe number (nilai
 * numeric(18,2) dari DB lewat Number()). Math.round(x × 100) di sini
 * MEMULIHKAN dua desimal yang tersimpan — bukan membulatkan selisih. Selisih
 * itu sendiri dihitung sesudahnya dalam sen bulat dan tidak pernah dibulatkan.
 */
export function rupiahKeSen(rupiah: number): number {
  return Math.round(rupiah * 100)
}
