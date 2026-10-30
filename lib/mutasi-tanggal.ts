// Tanggal SATU SEL grid mutasi kas (masukan Ricko 2026-10-30, D66). MURNI:
// tanpa `new Date(string)` (P2 — tebakan mesin JS + zona waktu menggeser hari)
// dan tanpa RegExp (D22, sama dengan lib/mutasi-draf.ts).
//
// ══ BENTUK YANG DITERIMA ═════════════════════════════════════════════════
//   "15"                         → tanggal 15 di bulan grid
//   "15/10/2026", "5/1/26",
//   "15-10-2026", "15.10.2026"   → hari/bulan ATAU bulan/hari (lihat di bawah)
//   "15/10"                      → idem, tahun = tahun grid
//   "2026-10-15", "2026/10/15"   → ISO, tak ambigu
//   "15 Okt 2026", "15 October 2026", "21/Apr/2026", "Oct 15, 2026"
//                                → nama bulan Indonesia & Inggris, singkat & panjang
// Jam di belakang tanggal ("15/10/2026 10:30") diabaikan.
//
// ══ TANGGAL AMBIGU DIPUTUSKAN BULAN GRID ════════════════════════════════
// "04/01/2026" bisa 4 Januari (hari/bulan) atau 1 April (bulan/hari). Grid
// selalu SATU bulan (D52), jadi tafsiran yang jatuh di bulan grid yang dipakai
// — contoh nyata sheet Rasyuka: "04/01/2026" di grid April 2026 = 1 April.
// Tidak ada yang jatuh di bulan grid → galat; sel merah, baris tidak bisa
// disimpan. Dua tafsiran BERBEDA yang sama-sama jatuh di satu bulan mustahil
// (keduanya harus bulan = hari = bulan grid, yaitu tanggal yang sama), tapi
// tetap ditangani sebagai galat, bukan tebakan.
//
// Untuk BLOK (tempelan/berkas), bukti dari blok itu sendiri didahulukan:
// kalau ada sel yang potongan pertamanya > 12, seluruh blok hari/bulan; kalau
// potongan keduanya > 12, bulan/hari (`urutanBlok`). Tanpa itu, berkas
// hari/bulan berisi "04/01/2026" (4 Januari) di grid April diam-diam menjadi
// 1 April — transaksi pindah bulan tanpa satu pun galat.

import { fmtTanggal, localDateToYmd } from '@/lib/ymd'
import { potonganTanggal } from '@/lib/csv/mutasi-kas'
import type { Periode } from '@/lib/mutasi-draf'

/** Bulan yang sedang dibuka grid. */
export type BulanGrid = { tahun: number; bulan: number }

/** Urutan potongan angka tanggal: 15/10 = hari-bulan, 10/15 = bulan-hari. */
export type UrutanTanggal = 'hari-bulan' | 'bulan-hari'

export type BacaTanggal =
  | { status: 'kosong' }
  | { status: 'ok'; ymd: string }
  | { status: 'galat'; pesan: string }

export const NAMA_BULAN = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
] as const

// Nama bulan → nomornya. Indonesia & Inggris, singkat & panjang, plus ejaan
// lama yang masih tercetak di sebagian rekening koran (Pebruari, Nopember).
const BULAN_TEKS: Readonly<Record<string, number>> = {
  jan: 1, januari: 1, january: 1,
  feb: 2, peb: 2, februari: 2, pebruari: 2, february: 2,
  mar: 3, maret: 3, march: 3,
  apr: 4, april: 4,
  mei: 5, may: 5,
  jun: 6, juni: 6, june: 6,
  jul: 7, juli: 7, july: 7,
  agu: 8, agt: 8, ags: 8, aug: 8, agustus: 8, august: 8,
  sep: 9, sept: 9, september: 9,
  okt: 10, oct: 10, oktober: 10, october: 10,
  nov: 11, nop: 11, november: 11, nopember: 11,
  des: 12, dec: 12, desember: 12, december: 12,
}

const pad2 = (n: number) => String(n).padStart(2, '0')
const angka = (s: string) => s.length > 0 && [...s].every(ch => ch >= '0' && ch <= '9')
// `potonganTanggal` memisahkan huruf dari angka, jadi potongan yang bukan
// angka pasti huruf seluruhnya.
const huruf = (s: string) => s.length > 0 && !angka(s)

function hariDalamBulan(tahun: number, bulan: number): number {
  if (bulan === 2) return tahun % 4 === 0 && (tahun % 100 !== 0 || tahun % 400 === 0) ? 29 : 28
  return [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][bulan - 1] ?? 0
}

/** Bulan grid dari periode grid ('YYYY-MM-01' … akhir bulan). */
export function bulanGridDari(periode: Pick<Periode, 'mulai'>): BulanGrid {
  return { tahun: Number(periode.mulai.slice(0, 4)), bulan: Number(periode.mulai.slice(5, 7)) }
}

/** "Oktober 2026". */
export function namaBulanGrid(g: BulanGrid): string {
  return `${NAMA_BULAN[g.bulan - 1] ?? '?'} ${g.tahun}`
}

type Bagian = { tahun: number; bulan: number; hari: number }

const keYmd = (b: Bagian) => `${b.tahun}-${pad2(b.bulan)}-${pad2(b.hari)}`
const sah = (b: Bagian) =>
  Number.isInteger(b.tahun) && b.tahun >= 1900 && b.tahun <= 2999 &&
  b.bulan >= 1 && b.bulan <= 12 &&
  b.hari >= 1 && b.hari <= hariDalamBulan(b.tahun, b.bulan)

/** Tahun dari potongan: 4 digit apa adanya, 2 digit = 20xx. */
function tahunDari(s: string): number | null {
  if (!angka(s)) return null
  if (s.length === 4) return Number(s)
  if (s.length === 2) return 2000 + Number(s)
  return null
}

const hariAtauBulan = (s: string) => (angka(s) && s.length <= 2 ? Number(s) : null)

type Bentuk =
  | { jenis: 'hari'; hari: number }
  | { jenis: 'pasti'; bagian: Bagian }
  | { jenis: 'dua'; a: number; b: number; tahun: number | null }

/**
 * Potongan teks → bentuk tanggalnya, tanpa memutuskan apa pun. `null` = bukan
 * tanggal. Potongan sesudah tiga yang pertama (jam) diabaikan.
 */
function bentukDari(teks: string): Bentuk | null {
  const p = potonganTanggal(teks)
  if (p.length === 0) return null

  if (p.length === 1) {
    const h = hariAtauBulan(p[0])
    return h === null ? null : { jenis: 'hari', hari: h }
  }

  // Nama bulan di salah satu dari dua potongan pertama (atau ketiga untuk
  // "2026-Okt-15"): bulannya pasti, sisanya hari lalu tahun.
  const iNama = p.slice(0, 3).findIndex(huruf)
  if (iNama >= 0) {
    const bulan = BULAN_TEKS[p[iNama].toLowerCase()]
    if (bulan === undefined) return null
    const lain = p.filter((_, i) => i !== iNama).slice(0, 2)
    if (lain.length === 0 || !lain.every(angka)) return null
    // "2026 Okt 15": tahun di depan.
    if (lain[0].length === 4) {
      const hari = lain[1] === undefined ? null : hariAtauBulan(lain[1])
      return hari === null ? null : { jenis: 'pasti', bagian: { tahun: Number(lain[0]), bulan, hari } }
    }
    const hari = hariAtauBulan(lain[0])
    if (hari === null) return null
    if (lain[1] === undefined) return { jenis: 'pasti', bagian: { tahun: NaN, bulan, hari } }
    const tahun = tahunDari(lain[1])
    return tahun === null ? null : { jenis: 'pasti', bagian: { tahun, bulan, hari } }
  }

  if (!p.slice(0, 3).every(angka)) return null

  // ISO: YYYY-MM-DD / YYYY/MM/DD.
  if (p[0].length === 4) {
    if (p.length < 3) return null
    const bulan = hariAtauBulan(p[1])
    const hari = hariAtauBulan(p[2])
    if (bulan === null || hari === null) return null
    return { jenis: 'pasti', bagian: { tahun: Number(p[0]), bulan, hari } }
  }

  const a = hariAtauBulan(p[0])
  const b = hariAtauBulan(p[1])
  if (a === null || b === null) return null
  if (p.length === 2) return { jenis: 'dua', a, b, tahun: null }
  const tahun = tahunDari(p[2])
  return tahun === null ? null : { jenis: 'dua', a, b, tahun }
}

/**
 * Semua tafsiran SAH (tanggal kalender yang ada) dari satu teks. Tahun yang
 * tidak ditulis = tahun grid; bulan yang tidak ditulis (hari saja) = bulan grid.
 */
function tafsiran(bentuk: Bentuk, g: BulanGrid, urutan: UrutanTanggal | null): Bagian[] {
  if (bentuk.jenis === 'hari') return [{ tahun: g.tahun, bulan: g.bulan, hari: bentuk.hari }].filter(sah)
  if (bentuk.jenis === 'pasti') {
    const b = Number.isNaN(bentuk.bagian.tahun) ? { ...bentuk.bagian, tahun: g.tahun } : bentuk.bagian
    return [b].filter(sah)
  }
  const tahun = bentuk.tahun ?? g.tahun
  const hb: Bagian = { tahun, bulan: bentuk.b, hari: bentuk.a }
  const bh: Bagian = { tahun, bulan: bentuk.a, hari: bentuk.b }
  const semua = [hb, bh].filter(sah)
  if (semua.length === 2 && keYmd(hb) === keYmd(bh)) return [hb]
  // Bukti blok hanya memilih di antara DUA tafsiran yang sama-sama sah; sel
  // yang hanya sah dengan satu cara tetap dibaca dengan cara itu.
  if (semua.length === 2 && urutan !== null) return [urutan === 'hari-bulan' ? hb : bh]
  return semua
}

const CONTOH = 'Contoh: 15, 15/10/2026, 2026-10-15, 15 Okt 2026.'

/**
 * Teks sel tanggal → 'YYYY-MM-DD' di bulan grid, atau galat yang menjelaskan
 * kenapa tidak. `urutan` = bukti dari blok tempelan/berkas (`urutanBlok`);
 * ketikan satu sel tidak membawanya.
 */
export function bacaTanggalGrid(teks: string, g: BulanGrid, urutan: UrutanTanggal | null = null): BacaTanggal {
  const t = teks.trim()
  if (t === '') return { status: 'kosong' }
  const bentuk = bentukDari(t)
  if (bentuk === null) return { status: 'galat', pesan: `Tanggal "${t}" tidak terbaca. ${CONTOH}` }
  const sahSemua = tafsiran(bentuk, g, urutan)
  if (sahSemua.length === 0) {
    if (bentuk.jenis === 'hari') return { status: 'galat', pesan: `Tanggal ${bentuk.hari} tidak ada di ${namaBulanGrid(g)}.` }
    return { status: 'galat', pesan: `Tanggal "${t}" tidak ada di kalender. ${CONTOH}` }
  }
  const diBulan = sahSemua.filter(b => b.tahun === g.tahun && b.bulan === g.bulan)
  if (diBulan.length === 1) return { status: 'ok', ymd: keYmd(diBulan[0]) }
  if (diBulan.length > 1) {
    return { status: 'galat', pesan: `Tanggal "${t}" bisa dibaca dua cara di ${namaBulanGrid(g)} — tulis sebagai YYYY-MM-DD.` }
  }
  const terbaca = sahSemua.map(b => fmtTanggal(keYmd(b))).join(' atau ')
  return { status: 'galat', pesan: `Tanggal di luar ${namaBulanGrid(g)} (terbaca ${terbaca}).` }
}

/**
 * Bentuk BAKU sel tanggal: 'YYYY-MM-DD' bila teksnya hanya bisa berarti SATU
 * tanggal — di bulan grid, atau di luarnya (validasi lalu menolaknya dengan
 * pesan "di luar bulan", dan pesan itu tidak berubah walau bukti bloknya
 * sudah tidak ada). Ambigu atau tak terbaca → teks apa adanya (dirapikan),
 * supaya pengguna melihat persis yang ia ketik.
 */
export function normalisasiTanggal(teks: string, g: BulanGrid, urutan: UrutanTanggal | null = null): string {
  return satuTanggal(teks, g, urutan) ?? teks.trim()
}

/** 'YYYY-MM-DD' bila teksnya hanya bisa berarti satu tanggal (lihat `normalisasiTanggal`). */
function satuTanggal(teks: string, g: BulanGrid, urutan: UrutanTanggal | null): string | null {
  const t = teks.trim()
  const h = bacaTanggalGrid(t, g, urutan)
  if (h.status === 'ok') return h.ymd
  if (h.status === 'kosong') return null
  const bentuk = bentukDari(t)
  if (bentuk === null) return null
  const sahSemua = tafsiran(bentuk, g, urutan)
  return sahSemua.length === 1 ? keYmd(sahSemua[0]) : null
}

/** Apakah teks berbentuk tanggal (bulan apa pun)? Untuk mengenali kelas baris blok. */
export function tampakTanggal(teks: string): boolean {
  const bentuk = bentukDari(teks.trim())
  // Bulan bantu Januari tahun kabisat: hari 1–31 dan 29/02 tanpa tahun lolos.
  return bentuk !== null && tafsiran(bentuk, { tahun: 2024, bulan: 1 }, null).length > 0
}

/**
 * Bukti urutan dari SATU BLOK: sel bernomor dua potongan dengan potongan
 * pertama > 12 membuktikan hari/bulan; potongan kedua > 12 membuktikan
 * bulan/hari. Bukti saling bertentangan atau tidak ada → null (bulan grid
 * yang memutuskan per sel).
 */
export function urutanBlok(teks: readonly string[]): UrutanTanggal | null {
  let hb = false
  let bh = false
  for (const s of teks) {
    const bentuk = bentukDari(s.trim())
    if (bentuk?.jenis !== 'dua') continue
    if (bentuk.a > 12 && bentuk.b <= 12) hb = true
    else if (bentuk.b > 12 && bentuk.a <= 12) bh = true
  }
  if (hb === bh) return null
  return hb ? 'hari-bulan' : 'bulan-hari'
}

/** Teks TAMPILAN sel tanggal: "15 Okt 2026" bila teksnya satu tanggal pasti, apa adanya bila tidak. */
export function tampilTanggalSel(teks: string, g: BulanGrid): string {
  const ymd = satuTanggal(teks, g, null)
  return ymd === null ? teks : fmtTanggal(ymd)
}

/**
 * Tanggal yang dipilih pengguna lewat date-range-picker (pemilih RENTANG) yang
 * dibuka dengan nilai awal `awal` (kalender-sel.tsx): nilai awal sudah menjadi
 * tanggal mulai, jadi satu klik menutup rentang [awal, klik] atau [klik, awal].
 * Yang dipilih = ujung yang BUKAN `awal`; rentang satu hari atau tanpa ujung
 * akhir → tanggal mulainya.
 */
export function tanggalDariRentang(r: { from?: Date; to?: Date } | undefined, awal: string): string | null {
  if (!r?.from) return null
  const mulai = localDateToYmd(r.from)
  if (r.to && mulai === awal) return localDateToYmd(r.to)
  return mulai
}
