// Aturan monitoring hutang. MURNI (tanpa I/O, tanpa React).
//
// ══ SELURUH ANGKANYA TURUNAN (D39, P3/P4) ════════════════════════════════
// Tidak ada tabel saldo hutang, tidak ada kolom status, tidak ada kolom
// "sudah dibayar". Semuanya dihitung dari dua hal yang memang tersimpan:
// invoice beserta barisnya, dan alokasi pembayaran yang menunjuk ke sana.
// Menyimpan salah satunya berarti punya dua jawaban yang harus dijaga tetap
// sama — dan yang tampil di layar yang akan dipercaya saat keduanya berbeda.
//
// ══ INVOICE TUNAI TIDAK PERNAH MASUK (keputusan Ricko 2026-09-21) ════════
// Invoice tunai dibayar saat dibuat: hutangnya tidak pernah lahir. Ia
// disaring di SATU tempat — `hutangInvoices()` di bawah — dan setiap fungsi
// lain di modul ini menerima keluarannya. Saringan yang diulang di tiap
// pemanggil adalah saringan yang suatu saat terlewat di salah satunya.
//
// ══ UANG DALAM SEN BULAT (P1) ════════════════════════════════════════════
// Sisa hutang yang meleset satu sen membuat invoice lunas terlihat menggantung
// selamanya — dan akunting akan mencari pembayaran yang tidak pernah kurang.

import { hariAntara } from '@/lib/contracts'
import { toMinorUnits } from '@/lib/journal'
import type { Cicilan } from '@/lib/termin'

// ── Bentuk masukan ───────────────────────────────────────────

export type InvoiceHutang = {
  id: string
  caraBayar: string
  /** INTEGER SEN — total invoice, sudah termasuk PPN. */
  totalMinor: number
  supplierId: string
  supplierNama: string
  noInvoice: string | null
  tanggal: string
  jumlahTermin: number
  jatuhTempoAkhir: string | null
}

export type AlokasiHutang = {
  invoiceId: string
  /** String numeric dari DB, atau angka. Dinormalkan ke sen di dalam modul. */
  nominal: unknown
  /** null = ikut FIFO. Terisi = dipaku ke cicilan ke-N (D40). */
  terminUrutan: number | null
}

/**
 * Saringan tunggal: hanya invoice KREDIT yang punya hutang.
 *
 * Satu tempat, dipakai semua fungsi lain di modul ini. Invoice tunai yang
 * lolos ke perhitungan umur hutang akan muncul sebagai kewajiban yang tidak
 * pernah bisa dilunasi siapa pun — ia memang sudah lunas sejak lahir.
 */
export function hutangInvoices<T extends { caraBayar: string }>(
  invoices: readonly T[] | null | undefined
): T[] {
  return (invoices ?? []).filter(i => i.caraBayar === 'kredit')
}

// ── Sisa per invoice ─────────────────────────────────────────

const minor = (v: unknown): number => toMinorUnits(v) ?? 0

/** Σ alokasi yang menunjuk invoice ini, dalam SEN. */
export function allocatedToInvoice(
  invoiceId: string,
  alokasi: readonly AlokasiHutang[] | null | undefined
): number {
  let total = 0
  for (const a of alokasi ?? []) {
    if (a.invoiceId === invoiceId) total += minor(a.nominal)
  }
  return total
}

/**
 * Sisa hutang satu invoice dalam SEN.
 *
 * Dikepit di NOL ke bawah, dan itu berbeda dari sisa MUTASI yang sengaja boleh
 * negatif. Alasannya tidak sama: kelebihan alokasi pada sebuah mutasi adalah
 * data rusak yang harus terlihat di layar yang sama, sementara di sini angkanya
 * dijumlahkan lintas-invoice menjadi total hutang klien — satu invoice negatif
 * akan diam-diam MENGURANGI hutang invoice lain, dan totalnya terlihat wajar.
 * Yang mencegah kelebihan terjadi adalah batas di route alokasi (N4).
 */
export function invoiceOutstanding(
  invoice: Pick<InvoiceHutang, 'id' | 'caraBayar' | 'totalMinor'>,
  alokasi: readonly AlokasiHutang[] | null | undefined
): number {
  if (invoice.caraBayar !== 'kredit') return 0
  const sisa = invoice.totalMinor - allocatedToInvoice(invoice.id, alokasi)
  return sisa > 0 ? sisa : 0
}

// ── Pencocokan pembayaran ke cicilan (D40) ───────────────────

export type CicilanTertutup = Cicilan & {
  /** INTEGER SEN yang sudah tertutup pembayaran. */
  tertutupMinor: number
  /** Sisa cicilan ini dalam SEN. 0 = lunas. */
  sisaMinor: number
  lunas: boolean
  /** Ada alokasi berpaku yang menyasar cicilan ini. Ditandai supaya penyimpangan
   *  dari FIFO terlihat, bukan karena ia salah. */
  dipakuManual?: boolean
}

export type ApplyPaymentsResult = {
  cicilan: CicilanTertutup[]
  /** Pembayaran yang tidak tertampung jadwalnya (invoice terbayar berlebih). */
  luberMinor: number
  /**
   * Alokasi berpaku yang cicilan tujuannya TIDAK ADA — mis. invoice diubah
   * dari 5 termin jadi 3 setelah pembayarannya dialokasikan. Jatuh kembali ke
   * FIFO, dan ditandai di sini supaya bisa ditampilkan.
   */
  pakuYatim: { terminUrutan: number; nominalMinor: number }[]
}

/**
 * Menyebar pembayaran ke jadwal cicilan.
 *
 * ══ BERPAKU DULU, BARU FIFO — DAN URUTANNYA BUKAN SELERA ════════════════
 * Kalau FIFO jalan lebih dulu, ia akan memakan cicilan yang sudah dipaku
 * seseorang, dan hasilnya jadi bergantung pada URUTAN BACA alokasi dari
 * database — dua pembacaan yang sah bisa menghasilkan umur hutang yang
 * berbeda. Karena itu alokasi berpaku diterapkan lebih dulu, seluruhnya, baru
 * sisanya dibagi FIFO dari cicilan terlama.
 *
 * ══ LUBERAN MELUBER, TIDAK DITOLAK ══════════════════════════════════════
 * Alokasi berpaku yang melebihi cicilan tujuannya mengalir ke cicilan
 * BERIKUTNYA. Menolaknya berarti memaksa akunting memecah satu pembayaran jadi
 * beberapa alokasi hanya supaya angkanya pas — pekerjaan yang tidak
 * menghasilkan informasi apa pun.
 *
 * ══ PAKU YATIM JATUH KE FIFO DAN DITANDAI ═══════════════════════════════
 * Invoice yang terminnya dikurangi setelah pembayaran dialokasikan
 * meninggalkan paku yang menunjuk cicilan yang sudah tidak ada. Ia TIDAK
 * dilempar (laporan tidak boleh mati karena satu baris) dan TIDAK diam-diam
 * dianggap cicilan terakhir (itu menebak maksud orang). Ia kembali ikut FIFO,
 * dan dilaporkan di `pakuYatim`.
 */
export function applyPayments(
  jadwal: readonly Cicilan[],
  alokasi: readonly AlokasiHutang[] | null | undefined
): ApplyPaymentsResult {
  const cicilan: CicilanTertutup[] = jadwal.map(c => ({
    ...c,
    tertutupMinor: 0,
    sisaMinor: c.nominalMinor,
    lunas: c.nominalMinor <= 0,
  }))
  const pakuYatim: ApplyPaymentsResult['pakuYatim'] = []

  /** Menuang `sisa` sen mulai dari cicilan index `dari`; mengembalikan luberan. */
  const tuang = (dari: number, sisa: number): number => {
    let sisaMinor = sisa
    for (let i = dari; i < cicilan.length && sisaMinor > 0; i++) {
      const muat = cicilan[i].sisaMinor
      if (muat <= 0) continue
      const pakai = Math.min(muat, sisaMinor)
      cicilan[i].tertutupMinor += pakai
      cicilan[i].sisaMinor -= pakai
      cicilan[i].lunas = cicilan[i].sisaMinor <= 0
      sisaMinor -= pakai
    }
    return sisaMinor
  }

  // ── Tahap 1: alokasi BERPAKU ──
  const berpaku = (alokasi ?? []).filter(a => a.terminUrutan !== null)
  const bebas = (alokasi ?? []).filter(a => a.terminUrutan === null)
  let luberMinor = 0

  // Diurutkan menurut cicilan yang dipakunya, bukan menurut urutan baca: dua
  // paku ke cicilan berbeda harus menghasilkan jadwal yang sama apa pun urutan
  // barisnya datang dari database.
  const berpakuUrut = [...berpaku].sort((a, b) => (a.terminUrutan ?? 0) - (b.terminUrutan ?? 0))

  for (const a of berpakuUrut) {
    const nominalMinor = minor(a.nominal)
    if (nominalMinor <= 0) continue
    const urutan = a.terminUrutan as number
    const idx = cicilan.findIndex(c => c.urutan === urutan)
    if (idx === -1) {
      // Paku yatim — dicatat, lalu ikut FIFO di tahap 2.
      pakuYatim.push({ terminUrutan: urutan, nominalMinor })
      luberMinor += tuang(0, nominalMinor)
      continue
    }
    cicilan[idx].dipakuManual = true
    luberMinor += tuang(idx, nominalMinor)
  }

  // ── Tahap 2: sisanya FIFO, cicilan terlama dulu ──
  for (const a of bebas) {
    const nominalMinor = minor(a.nominal)
    if (nominalMinor <= 0) continue
    luberMinor += tuang(0, nominalMinor)
  }

  return { cicilan, luberMinor, pakuYatim }
}

// ── Umur hutang ──────────────────────────────────────────────

export const AGE_BUCKETS = [
  'belumJatuhTempo',
  'telat1_30',
  'telat31_60',
  'telat61_90',
  'telatLebih90',
] as const
export type AgeBucket = (typeof AGE_BUCKETS)[number]

export const AGE_BUCKET_LABEL: Record<AgeBucket, string> = {
  belumJatuhTempo: 'Belum jatuh tempo',
  telat1_30: 'Telat 1–30 hari',
  telat31_60: 'Telat 31–60 hari',
  telat61_90: 'Telat 61–90 hari',
  telatLebih90: 'Telat lebih dari 90 hari',
}

/**
 * Ember mana untuk cicilan yang jatuh tempo `tanggal`, dilihat dari `asOf`.
 *
 * ══ BATAS HARI INKLUSIF, DAN DITULIS DI TEST ════════════════════════════
 * Telat 30 hari masuk ember **1–30**, telat 31 hari masuk **31–60**. Batas
 * yang tidak ditulis adalah batas yang bergeser satu hari saat seseorang
 * menyentuh perbandingannya, dan pergeseran itu memindahkan hutang antar ember
 * tanpa ada yang menyadarinya.
 *
 * Jatuh tempo HARI INI belum telat — tenggatnya berakhir di penghujung hari.
 */
export function bucketOf(tanggal: string, asOf: string): AgeBucket {
  const telat = hariAntara(tanggal, asOf)
  if (telat <= 0) return 'belumJatuhTempo'
  if (telat <= 30) return 'telat1_30'
  if (telat <= 60) return 'telat31_60'
  if (telat <= 90) return 'telat61_90'
  return 'telatLebih90'
}

export type AgeBucketTotals = Record<AgeBucket, number>

export function emptyBuckets(): AgeBucketTotals {
  return {
    belumJatuhTempo: 0,
    telat1_30: 0,
    telat31_60: 0,
    telat61_90: 0,
    telatLebih90: 0,
  }
}

/**
 * Menjumlahkan SISA cicilan yang belum lunas ke dalam ember umurnya.
 *
 * Yang dijumlahkan adalah `sisaMinor`, bukan nominal penuh cicilannya: cicilan
 * yang sudah terbayar separuh hanya menyisakan separuh sebagai kewajiban, dan
 * menaruh nominal penuhnya di ember membuat total hutang lebih besar dari yang
 * sebenarnya terutang.
 */
export function ageBuckets(
  cicilan: readonly CicilanTertutup[],
  asOf: string
): AgeBucketTotals {
  const out = emptyBuckets()
  for (const c of cicilan) {
    if (c.lunas || c.sisaMinor <= 0) continue
    out[bucketOf(c.tanggal, asOf)] += c.sisaMinor
  }
  return out
}

/** Menjumlahkan beberapa hasil ageBuckets — untuk total lintas invoice. */
export function mergeBuckets(
  a: AgeBucketTotals,
  b: AgeBucketTotals
): AgeBucketTotals {
  const out = emptyBuckets()
  for (const k of AGE_BUCKETS) out[k] = a[k] + b[k]
  return out
}

// ── Jatuh tempo mendekat, PER CICILAN ────────────────────────

export type JatuhTempoItem = {
  invoiceId: string
  noInvoice: string | null
  supplierId: string
  supplierNama: string
  terminUrutan: number
  tanggal: string
  sisaMinor: number
  /** Negatif = sudah lewat. */
  hariLagi: number
}

/**
 * Cicilan yang jatuh tempo dalam `dalamHari` ke depan, plus yang SUDAH LEWAT
 * dan belum lunas.
 *
 * ══ PER CICILAN, BUKAN PER INVOICE ══════════════════════════════════════
 * Invoice 6 termin yang jatuh temponya masih Desember tetap punya cicilan yang
 * jatuh tempo minggu ini. Daftar yang memakai `jatuh_tempo_akhir` saja akan
 * menyembunyikan lima dari enam kewajibannya sampai bulan terakhir — dan pada
 * saat itu semuanya sudah telat.
 */
export function jatuhTempoMendekat(
  invoices: readonly {
    invoice: InvoiceHutang
    cicilan: readonly CicilanTertutup[]
  }[],
  asOf: string,
  dalamHari = 30
): JatuhTempoItem[] {
  const out: JatuhTempoItem[] = []
  for (const { invoice, cicilan } of invoices) {
    if (invoice.caraBayar !== 'kredit') continue
    for (const c of cicilan) {
      if (c.lunas || c.sisaMinor <= 0) continue
      const hariLagi = hariAntara(asOf, c.tanggal)
      if (hariLagi > dalamHari) continue
      out.push({
        invoiceId: invoice.id,
        noInvoice: invoice.noInvoice,
        supplierId: invoice.supplierId,
        supplierNama: invoice.supplierNama,
        terminUrutan: c.urutan,
        tanggal: c.tanggal,
        sisaMinor: c.sisaMinor,
        hariLagi,
      })
    }
  }
  // Yang paling mendesak di atas: paling telat lebih dulu.
  out.sort((a, b) => (a.hariLagi !== b.hariLagi ? a.hariLagi - b.hariLagi : a.tanggal.localeCompare(b.tanggal)))
  return out
}

// ── Rekap per supplier ───────────────────────────────────────

export type SupplierHutang = {
  supplierId: string
  supplierNama: string
  invoiceCount: number
  totalMinor: number
  dibayarMinor: number
  sisaMinor: number
}

/**
 * Rekap hutang per supplier. Invoice TUNAI tidak ikut sama sekali — ia tidak
 * pernah jadi hutang.
 *
 * `dibayar` dikepit ke total invoice: kalau alokasinya melebihi (data rusak
 * yang dicegah route), "dibayar" yang lebih besar dari "total" akan membuat
 * rekapnya membaca seperti kelebihan bayar ke supplier, bukan seperti data
 * yang perlu dibetulkan.
 */
export function supplierSummary(
  invoices: readonly InvoiceHutang[],
  alokasi: readonly AlokasiHutang[] | null | undefined
): SupplierHutang[] {
  const peta = new Map<string, SupplierHutang>()

  for (const inv of hutangInvoices(invoices)) {
    const terbayar = Math.min(allocatedToInvoice(inv.id, alokasi), inv.totalMinor)
    const baris = peta.get(inv.supplierId) ?? {
      supplierId: inv.supplierId,
      supplierNama: inv.supplierNama,
      invoiceCount: 0,
      totalMinor: 0,
      dibayarMinor: 0,
      sisaMinor: 0,
    }
    baris.invoiceCount += 1
    baris.totalMinor += inv.totalMinor
    baris.dibayarMinor += terbayar
    baris.sisaMinor += inv.totalMinor - terbayar
    peta.set(inv.supplierId, baris)
  }

  return [...peta.values()].sort((a, b) =>
    a.sisaMinor !== b.sisaMinor
      ? b.sisaMinor - a.sisaMinor
      : a.supplierNama.localeCompare(b.supplierNama)
  )
}
