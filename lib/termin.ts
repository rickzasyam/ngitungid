// Jadwal cicilan (termin) invoice pembelian. MURNI (tanpa I/O, tanpa React).
//
// ══ JADWALNYA DITURUNKAN, TIDAK DISIMPAN (D34) ════════════════════════════
// Yang tersimpan hanya `jatuh_tempo_akhir` dan `jumlah_termin`. Jadwalnya
// dihitung ulang setiap diminta, sama seperti saldo buku besar (D11) dan status
// kontrak (P3). Tabel jadwal berarti sumber kebenaran kedua yang harus dijaga
// tetap sama dengan invoicenya — dan yang kedua selalu kalah begitu ada satu
// jalur tulis yang lupa memperbaruinya.
//
// ══ TANGGAL ADALAH STRING, BAHKAN SAAT MENGHITUNG MUNDUR ══════════════════
// Seluruh aritmetika tanggal di sini bekerja atas 'YYYY-MM-DD' (P2). Tidak ada
// `new Date(string)`, tidak ada `setMonth()`. Mundur satu bulan dari '2027-03-31'
// lewat objek Date menghasilkan '2027-03-03' di sebagian runtime (31 Februari
// digulung) — kesalahan yang tidak melempar, cuma memindahkan tanggal jatuh
// tempo tiga minggu lebih awal.
//
// ══ SEN BULAT (P1) ════════════════════════════════════════════════════════
// Nominal cicilan dihitung dalam INTEGER SEN, dan sisa pembagiannya ditaruh di
// cicilan TERAKHIR sehingga Σ cicilan === total invoice PERSIS — bukan
// mendekati. Total yang meleset satu sen membuat invoice tidak pernah bisa
// lunas, dan sisanya mengendap di monitoring hutang selamanya.

import { isValidYmd } from '@/lib/contracts'

export interface Cicilan {
  /** 1-indexed, sama dengan yang dilihat pengguna ("cicilan ke-2 dari 3"). */
  urutan: number
  tanggal: string
  /** INTEGER SEN. Konversi ke rupiah dilakukan di titik tampil. */
  nominalMinor: number
  /**
   * Tanggalnya berasal dari override akunting, bukan dari pembagian rata.
   * Dipakai UI untuk menandainya (D34) — penyimpangan yang terlihat adalah
   * penyimpangan yang bisa dipertanyakan.
   */
  disesuaikan?: boolean
}

/** Penyesuaian tanggal per cicilan. BELUM ada yang mengisinya (D34). */
export interface TerminOverride {
  urutan: number
  tanggal: string
}

const HARI_MAX = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]

function hariTerakhirBulan(y: number, m: number): number {
  if (m !== 2) return HARI_MAX[m - 1]
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0 ? 29 : 28
}

/**
 * Geser `ymd` mundur `n` bulan kalender, TANPA objek Date.
 *
 * Tanggal yang tidak ada di bulan tujuan DIKEPIT ke hari terakhirnya: mundur
 * satu bulan dari 31 Maret menghasilkan 28 (atau 29) Februari, bukan 3 Maret.
 * Penggulungan diam-diam itu yang membuat tanggal jatuh tempo bergeser tanpa
 * ada yang menyadarinya.
 */
export function mundurBulan(ymd: string, n: number): string {
  const [y, m, d] = ymd.split('-').map(Number)
  const totalBulan = y * 12 + (m - 1) - n
  const yBaru = Math.floor(totalBulan / 12)
  const mBaru = (totalBulan % 12) + 1
  const dBaru = Math.min(d, hariTerakhirBulan(yBaru, mBaru))
  return `${String(yBaru).padStart(4, '0')}-${String(mBaru).padStart(2, '0')}-${String(dBaru).padStart(2, '0')}`
}

/**
 * Jadwal cicilan, dibagi rata MUNDUR dari tanggal jatuh tempo akhir.
 *
 * Contoh brief Ricko: invoice 1 Okt, jatuh tempo 1 Jan 2027, termin 3× →
 * 1 Nov · 1 Des · 1 Jan, masing-masing sepertiga total.
 *
 * ══ KENAPA MUNDUR, BUKAN MAJU DARI TANGGAL INVOICE ══════════════════════
 * Yang disepakati dengan supplier adalah KAPAN LUNASNYA. Menghitung maju dari
 * tanggal invoice dengan jarak yang dibulatkan akan meleset dari tanggal itu,
 * dan cicilan terakhir mendarat di tanggal yang tidak pernah dijanjikan siapa
 * pun. Mundur membuat cicilan terakhir SELALU tepat di jatuh tempo akhir.
 *
 * `overrides` diterima sejak hari pertama walau belum ada yang mengisinya
 * (D34) — supaya penyesuaian tanggal per cicilan kelak tidak mengubah tanda
 * tangan fungsi ini maupun satu pun pemanggilnya. Override yang menunjuk
 * cicilan di luar jadwal DIABAIKAN, tidak melempar: `jumlah_termin` invoice
 * bisa diubah setelah override dibuat, dan melempar di situ berarti halaman
 * hutang gagal dimuat karena data lama yang tidak berbahaya.
 */
export function buildTerminSchedule({
  jatuhTempoAkhir,
  jumlahTermin,
  totalMinor,
  overrides = [],
}: {
  jatuhTempoAkhir: string
  jumlahTermin: number
  totalMinor: number
  overrides?: readonly TerminOverride[]
}): Cicilan[] {
  if (!isValidYmd(jatuhTempoAkhir)) return []
  const n = Math.trunc(jumlahTermin)
  if (!Number.isFinite(n) || n < 1) return []
  if (!Number.isSafeInteger(totalMinor) || totalMinor < 0) return []

  const byUrutan = new Map(overrides.map(o => [o.urutan, o.tanggal]))

  // Pembagian rata dalam SEN, sisa ke cicilan TERAKHIR. Dibagi dengan
  // Math.floor lebih dulu supaya tiap cicilan bilangan bulat sen, lalu sisanya
  // ditambahkan sekali di ujung — Σ cicilan === totalMinor persis.
  const dasar = Math.floor(totalMinor / n)
  const sisa = totalMinor - dasar * n

  const out: Cicilan[] = []
  for (let i = 1; i <= n; i++) {
    // Cicilan ke-n jatuh di jatuhTempoAkhir; yang sebelumnya mundur sebulan
    // per langkah.
    const dasarTanggal = mundurBulan(jatuhTempoAkhir, n - i)
    const override = byUrutan.get(i)
    const pakaiOverride = override !== undefined && isValidYmd(override)
    out.push({
      urutan: i,
      tanggal: pakaiOverride ? override : dasarTanggal,
      nominalMinor: i === n ? dasar + sisa : dasar,
      ...(pakaiOverride ? { disesuaikan: true } : {}),
    })
  }
  return out
}
