// SPIKE S0 (MP §5.G, D46) — branch `spike/grid-library`, TIDAK di-merge.
// Data sintetis + validasi + tempel untuk mengukur react-data-grid. Bukan
// modul produksi: aturan sebenarnya lahir di S2 (lib/mutasi-draf.ts) dan S3
// (lib/saldo-berantai.ts). Yang dipakai ulang di sini hanya pembaca yang
// sudah ada, supaya angka kinerjanya mewakili biaya validasi sungguhan.

import { parseCsv, parseTanggalCell } from '@/lib/csv/mutasi-kas'
import { bacaNominal } from '@/lib/nominal'
import { toMinorUnits } from '@/lib/journal'
import { formatTampilan } from '@/lib/nominal-input'

export type Kolom = 'tanggal' | 'uraian' | 'masuk' | 'keluar' | 'saldo' | 'akunLawan' | 'catatan'
export const URUTAN_KOLOM: readonly Kolom[] = ['tanggal', 'uraian', 'masuk', 'keluar', 'saldo', 'akunLawan', 'catatan']
export const KOLOM_UANG: ReadonlySet<Kolom> = new Set(['masuk', 'keluar', 'saldo'])

export type BarisDraf = { kunci: string } & Record<Kolom, string>

export type GalatBaris = Partial<Record<Kolom, string>>

// PRNG deterministik (mulberry32) — dua kali muat = data sama, angka sebanding.
function prng(benih: number) {
  let a = benih >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const URAIAN = [
  'Penjualan Shopee INV/2026/04/',
  'Transfer ke BCA 1234',
  'Biaya admin marketplace',
  'Pembayaran supplier PT Sumber',
  'Setoran tunai',
  'Ongkir JNE resi ',
  'Refund pembeli ',
  'Gaji karyawan April',
]

const sen = (n: number) => `${Math.floor(n / 100)}.${String(n % 100).padStart(2, '0')}`

/** n baris April 2026, saldo berantai utuh (dalam sen). */
export function buatData(n: number, benih = 26): BarisDraf[] {
  const acak = prng(benih)
  const out: BarisDraf[] = []
  let saldo = 50_000_000_00
  for (let i = 0; i < n; i++) {
    const hari = 1 + Math.floor((i / n) * 30)
    const masukKah = acak() < 0.6
    const nominal = (1 + Math.floor(acak() * 2_500_000)) * 100 + (acak() < 0.2 ? Math.floor(acak() * 100) : 0)
    saldo += masukKah ? nominal : -nominal
    if (saldo < 0) saldo += 2 * nominal
    out.push({
      kunci: `s${i}`,
      tanggal: `${String(hari).padStart(2, '0')}/04/2026`,
      uraian: `${URAIAN[i % URAIAN.length]}${i}`,
      masuk: masukKah ? sen(nominal) : '',
      keluar: masukKah ? '' : sen(nominal),
      saldo: sen(saldo),
      akunLawan: i % 3 === 0 ? '4-1001' : '',
      catatan: i % 5 === 0 ? `REF${i}` : '',
    })
  }
  // Saldo baris pertama selalu konsisten dengan nominalnya sendiri; tidak ada
  // jangkar SALDO AWAL di data sintetis, jadi rantai mulai dari baris kedua.
  return out
}

// ── Validasi per baris, di-memo per objek baris ──────────────────────────
// Objek baris yang tidak berubah = referensi sama (reducer menyalin hanya
// baris yang disentuh), jadi WeakMap cukup sebagai memo tanpa invalidasi.

const memo = new WeakMap<BarisDraf, GalatBaris | null>()

export function galatBaris(b: BarisDraf): GalatBaris | null {
  const ada = memo.get(b)
  if (ada !== undefined) return ada
  const g: GalatBaris = {}
  if (b.tanggal.trim() === '') g.tanggal = 'Tanggal wajib diisi.'
  else if (parseTanggalCell(b.tanggal) === null) g.tanggal = 'Tanggal tidak terbaca.'
  for (const k of ['masuk', 'keluar', 'saldo'] as const) {
    const h = bacaNominal(b[k])
    if (h.status === 'galat') g[k] = h.pesan
  }
  const isiMasuk = b.masuk.trim() !== ''
  const isiKeluar = b.keluar.trim() !== ''
  if (isiMasuk === isiKeluar && !g.masuk && !g.keluar) {
    const pesan = isiMasuk ? 'Isi Masuk ATAU Keluar, bukan keduanya.' : 'Isi Masuk atau Keluar.'
    g.masuk = pesan
    g.keluar = pesan
  }
  const hasil = Object.keys(g).length === 0 ? null : g
  memo.set(b, hasil)
  return hasil
}

/** Rantai saldo O(n) dalam sen: indeks baris bersaldo pertama yang putus, atau null. */
export function putusPertama(rows: readonly BarisDraf[]): { indeks: number; selisihSen: number } | null {
  let sebelum: number | null = null
  let berjalan = 0
  for (let i = 0; i < rows.length; i++) {
    const b = rows[i]
    if (galatBaris(b)) return null // rantai baru bermakna sesudah semua sel terbaca
    berjalan += (toMinorUnits(b.masuk === '' ? '0' : b.masuk) ?? 0) - (toMinorUnits(b.keluar === '' ? '0' : b.keluar) ?? 0)
    if (b.saldo === '') continue
    const s = toMinorUnits(b.saldo) ?? 0
    if (sebelum !== null && sebelum + berjalan !== s) return { indeks: i, selisihSen: s - (sebelum + berjalan) }
    sebelum = s
    berjalan = 0
  }
  return null
}

// ── Tempel multi-baris ───────────────────────────────────────────────────

let urutKunci = 0

function normalSel(kolom: Kolom, teks: string): string {
  if (!KOLOM_UANG.has(kolom)) return teks
  const h = bacaNominal(teks)
  return h.status === 'ok' ? h.nilai : teks
}

/**
 * Teks TSV (Excel / Google Sheets) ditempel mulai sel aktif. Kolom di luar
 * tepi kanan dibuang; baris melewati ujung grid ditambahkan sebagai baris baru.
 * Baris yang tidak tersentuh tetap objek yang sama (memo validasi bertahan).
 */
export function tempel(rows: readonly BarisDraf[], teks: string, baris: number, kolomAwal: number): { rows: BarisDraf[]; jumlah: number } {
  const { rows: sel } = parseCsv(teks, '\t')
  const out = rows.slice()
  for (let r = 0; r < sel.length; r++) {
    const target = baris + r
    const lama: BarisDraf =
      out[target] ?? { kunci: `p${urutKunci++}`, tanggal: '', uraian: '', masuk: '', keluar: '', saldo: '', akunLawan: '', catatan: '' }
    const baru = { ...lama }
    const cells = sel[r].cells
    for (let c = 0; c < cells.length && kolomAwal + c < URUTAN_KOLOM.length; c++) {
      const k = URUTAN_KOLOM[kolomAwal + c]
      baru[k] = normalSel(k, cells[c])
    }
    out[target] = baru
  }
  return { rows: out, jumlah: sel.length }
}

/**
 * Teks TSV n baris dari data sintetis, berbentuk salinan Excel/Google Sheets:
 * nominal tampilan Indonesia ("1.234.567,89"), CRLF, dan tiap baris ke-500
 * uraiannya berkutip dengan baris baru di dalam sel.
 */
export function tsvSintetis(n: number, benih = 99): string {
  const uang = (v: string) => (v === '' ? '' : formatTampilan(v, 2))
  return buatData(n, benih)
    .map((b, i) =>
      [b.tanggal, i % 500 === 0 ? `"${b.uraian}\nbaris kedua"` : b.uraian, uang(b.masuk), uang(b.keluar), uang(b.saldo), b.akunLawan, b.catatan].join('\t')
    )
    .join('\r\n')
}
