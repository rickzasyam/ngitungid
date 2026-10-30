// Turunan TAMPILAN grid mutasi kas (MP §5.G S9). MURNI — dipanggil halaman
// pada setiap perubahan draf, diuji tanpa merender apa pun.
//
// ══ YANG TIDAK DIHITUNG DI SINI ══════════════════════════════════════════
// Status, sisa alokasi, kunci, dan saldo akun Pindah Buku datang JADI dari
// server (S7/S8, route Pindah Buku). Modul ini hanya merangkai hasil modul
// murni yang sudah ada — rantai saldo (S3), usulan aturan (S4), diff (S6) —
// menjadi bentuk yang dibaca grid: per KUNCI baris, bukan per indeks, karena
// indeks bergeser setiap kali baris disisipkan atau filter dinyalakan.

import { periksaKesinambungan, barisRantaiDariSel, type BarisRantai, type Putus } from '@/lib/saldo-berantai'
import { parseCsv } from '@/lib/csv/mutasi-kas'
import {
  KOLOM_GRID,
  bacaBlok,
  bacaSaldoSel,
  bacaUangSel,
  belahTempelan,
  cocokkanAkun,
  kenaliJudul,
  nominalKeSel,
  type HasilBacaBlok,
  type IndeksAkun,
  type KolomGrid,
  type Periode,
} from '@/lib/mutasi-draf'
import { usulkanAkunLawan, type AturanSiap } from '@/lib/aturan-mutasi'
import { blokWajibPilih, type BarisGrid, type HasilDiff, type KeadaanGrid } from '@/lib/mutasi-grid-state'
import { fromMinorUnits } from '@/lib/journal'
import { bulanGridDari, normalisasiTanggal, urutanBlok } from '@/lib/mutasi-tanggal'

// ── Rantai saldo per baris ───────────────────────────────────

export type PutusBaris = Putus & { pesan: string }

export type RantaiGrid = {
  utuh: boolean
  /** Putus per KUNCI baris (jenis 'baris'); titik di tengah blok tidak dipakai grid. */
  putus: ReadonlyMap<string, PutusBaris>
  /** Kunci baris putus PERTAMA — tujuan tombol "Ke baris putus". */
  pertama: string | null
  terverifikasi: number
  /** Baris bersaldo pertama tidak terverifikasi karena grid tidak punya jangkar. */
  pertamaTanpaJangkar: boolean
}

const rp = (minor: number) => (minor < 0 ? '−' : '') + 'Rp ' + nominalKeSel(fromMinorUnits(Math.abs(minor)))

/**
 * Rantai saldo atas seluruh baris grid dalam URUTAN TAMPILAN (= urutan
 * rekening koran). `jangkarTeks` dari `jangkarGrid` (D61); null = tanpa jangkar.
 */
export function rantaiGrid(
  baris: readonly BarisGrid[],
  jangkarTeks: string | null,
  /** Memo per OBJEK baris — reducer S6 mempertahankan identitas baris yang tak disentuh. */
  memo?: WeakMap<BarisGrid, BarisRantai>
): RantaiGrid {
  const j = jangkarTeks === null ? null : bacaSaldoSel(jangkarTeks)
  const jangkar = j && j.status === 'ok' ? j.minor : null
  const h = periksaKesinambungan(
    baris.map(b => {
      const ada = memo?.get(b)
      if (ada) return ada
      const r = barisRantaiDariSel(b.sel)
      memo?.set(b, r)
      return r
    }),
    jangkar
  )
  const putus = new Map<string, PutusBaris>()
  let pertama: string | null = null
  for (const p of h.semuaPutus) {
    if (p.jenis !== 'baris') continue
    const b = baris[p.indeks]
    if (!b) continue
    if (pertama === null) pertama = b.kunci
    putus.set(b.kunci, {
      ...p,
      pesan: `Saldo putus: menurut rantai ${rp(p.diharapkan)}, tercetak ${rp(p.tercetak)} (selisih ${rp(p.selisih)}). Perbaiki nominal di atasnya, atau kosongkan saldo baris ini bila rekening korannya sendiri tidak konsisten.`,
    })
  }
  return { utuh: putus.size === 0, putus, pertama, terverifikasi: h.terverifikasi, pertamaTanpaJangkar: h.pertamaTanpaJangkar }
}

// ── Usulan akun lawan (aturan D57 + Pindah Buku D59) ─────────

export type Usulan = {
  /** Teks sel akun lawan yang akan diterapkan (kode akun). */
  akunLawan: string
  sumber: 'aturan' | 'pindah-buku'
  /** Label untuk tooltip & `aria-description`. */
  label: string
}

export type HasilUsulan = {
  usulan: ReadonlyMap<string, Usulan>
  /** Baris yang dicocokkan > 1 aturan setara dengan akun berbeda — tidak diusulkan. */
  bentrok: ReadonlyMap<string, number>
}

const arahSel = (b: BarisGrid): 'masuk' | 'keluar' | null => {
  const m = bacaUangSel(b.sel.masuk)
  const k = bacaUangSel(b.sel.keluar)
  if (m.status === 'ok' && m.minor > 0) return 'masuk'
  if (k.status === 'ok' && k.minor > 0) return 'keluar'
  return null
}

/**
 * Usulan hanya untuk sel akun lawan yang KOSONG dan tidak terkunci — sel yang
 * sudah diisi tidak pernah ditimpa usulan. Pindah Buku (pasangan tunggal dari
 * server) didahulukan atas aturan: pasangannya fakta dua rekening, aturan
 * hanya pola teks.
 */
export function hitungUsulan(opts: {
  baris: readonly BarisGrid[]
  akunKasId: string
  aturan: readonly AturanSiap[]
  /** Akun lawan per id akun (untuk kode & label). */
  akunById: ReadonlyMap<string, { kode: string; nama: string }>
  /** Id mutasi tersimpan → akun Pindah Buku (dari route Pindah Buku). */
  pindahBuku: ReadonlyMap<string, { akunId: string; seberang: string }>
  /**
   * Memo per OBJEK baris. Pemanggil WAJIB membuat WeakMap baru bila aturan,
   * akun, atau usulan Pindah Buku berubah — hasil per baris bergantung padanya.
   */
  memo?: WeakMap<BarisGrid, HasilUsulanBaris>
}): HasilUsulan {
  const usulan = new Map<string, Usulan>()
  const bentrok = new Map<string, number>()
  for (const b of opts.baris) {
    let h = opts.memo?.get(b)
    if (h === undefined) {
      h = usulanBaris(b, opts)
      opts.memo?.set(b, h)
    }
    if (h === null) continue
    if ('bentrok' in h) bentrok.set(b.kunci, h.bentrok)
    else usulan.set(b.kunci, h)
  }
  return { usulan, bentrok }
}

export type HasilUsulanBaris = Usulan | { bentrok: number } | null

function usulanBaris(
  b: BarisGrid,
  opts: Pick<Parameters<typeof hitungUsulan>[0], 'akunKasId' | 'aturan' | 'akunById' | 'pindahBuku'>
): HasilUsulanBaris {
  if (b.sel.akunLawan.trim() !== '') return null
  if (b.terkunci.baris || b.terkunci.kolom.akunLawan) return null
  const pb = b.id ? opts.pindahBuku.get(b.id) : undefined
  if (pb) {
    const a = opts.akunById.get(pb.akunId)
    if (a) return { akunLawan: a.kode, sumber: 'pindah-buku', label: `Usulan Pindah Buku: ${a.kode} · ${a.nama} — pasangan ${pb.seberang}` }
  }
  if (opts.aturan.length === 0) return null
  const u = usulkanAkunLawan({ uraian: b.sel.uraian, arah: arahSel(b), akunKasId: opts.akunKasId }, opts.aturan)
  if (u === null) return null
  if (u.jenis === 'bentrok') return { bentrok: u.aturanId.length }
  const a = opts.akunById.get(u.akunId)
  if (!a) return null
  return { akunLawan: a.kode, sumber: 'aturan', label: `Usulan aturan: ${a.kode} · ${a.nama}` }
}

// ── Label akun lawan di sel ──────────────────────────────────

/**
 * "6-1002" → "6-1002 · Beban Sewa Kantor" bila cocok; teks apa adanya bila
 * tidak. Pencocoknya `cocokkanAkun` (S2) — aturan yang sama dengan validator,
 * jadi label tidak pernah menamai akun yang akan ditolak Simpan.
 */
export function labelAkun(teks: string, indeks: IndeksAkun): string {
  const c = cocokkanAkun(teks, indeks)
  if (c.status !== 'ok') return teks
  const a = indeks.byId.get(c.akunId)
  return a ? `${a.kode} · ${a.nama}` : teks
}

// ── Ringkasan bilah alat & gerbang Simpan ────────────────────

export type RingkasanGrid = {
  baru: number
  ubah: number
  hapus: number
  /** Σ Masuk / Σ Keluar seluruh baris yang terbaca, kanonik. */
  totalMasuk: string
  totalKeluar: string
  jumlahBaris: number
}

export function ringkasGrid(baris: readonly BarisGrid[], diff: HasilDiff): RingkasanGrid {
  let masuk = 0
  let keluar = 0
  for (const b of baris) {
    const m = bacaUangSel(b.sel.masuk)
    const k = bacaUangSel(b.sel.keluar)
    if (m.status === 'ok') masuk += m.minor
    if (k.status === 'ok') keluar += k.minor
  }
  return {
    baru: diff.baru.length,
    ubah: diff.ubah.length,
    hapus: diff.hapus.length,
    totalMasuk: fromMinorUnits(masuk),
    totalKeluar: fromMinorUnits(keluar),
    jumlahBaris: baris.filter(b => b.id !== null || Object.values(b.sel).some(v => v.trim() !== '')).length,
  }
}

export type GerbangSimpan = { boleh: true; label: string } | { boleh: false; label: string; alasan: string[] }

/**
 * Batas satu Simpan (D52) — CERMIN `BATAS_*` di lib/api/cash-mutation-batch.ts
 * (modul server, tidak bisa diimpor grid). Kesamaannya dikunci test baca-sumber.
 * Melewatinya menahan Simpan dengan alasan; tidak pernah dipecah diam-diam.
 */
export const BATAS_SIMPAN = { baru: 10_000, ubah: 2_000, hapus: 2_000 } as const

/**
 * Simpan TERIKAT pada galat, saldo putus (D50), dan arah blok yang belum
 * dipilih — satu fungsi, supaya tombol & pintasan keyboard memakai syarat yang
 * sama.
 */
export function gerbangSimpan(s: KeadaanGrid, diff: HasilDiff, rantai: RantaiGrid, sedangMenyimpan: boolean): GerbangSimpan {
  const n = diff.baru.length + diff.ubah.length + diff.hapus.length
  const label = n === 0 ? 'Simpan' : `Simpan ${n.toLocaleString('id-ID')} perubahan`
  const alasan: string[] = []
  if (diff.galat.length > 0) alasan.push(`${diff.galat.length.toLocaleString('id-ID')} baris masih bergalat.`)
  if (!rantai.utuh) alasan.push(`Saldo putus di ${rantai.putus.size.toLocaleString('id-ID')} baris.`)
  const wajib = blokWajibPilih(s)
  if (wajib.length > 0) alasan.push(`Arah ${wajib.length} blok tempelan belum dipilih.`)
  const lewat = (['baru', 'ubah', 'hapus'] as const).filter(k => diff[k].length > BATAS_SIMPAN[k])
  if (lewat.length > 0) {
    alasan.push(
      `Satu Simpan paling banyak ${BATAS_SIMPAN.baru.toLocaleString('id-ID')} baris baru, ${BATAS_SIMPAN.ubah.toLocaleString('id-ID')} ubah, dan ${BATAS_SIMPAN.hapus.toLocaleString('id-ID')} hapus — simpan sebagian lebih dulu.`
    )
  }
  if (sedangMenyimpan) alasan.push('Sedang menyimpan…')
  if (n === 0 && diff.galat.length === 0) alasan.push('Belum ada perubahan.')
  return alasan.length === 0 ? { boleh: true, label } : { boleh: false, label, alasan }
}

// ── Tempel: persegi sel atau blok transaksi ──────────────────

export type RencanaTempel =
  | { jenis: 'blok'; hasil: Extract<HasilBacaBlok, { ok: true }> }
  | { jenis: 'sel'; isi: string[][] }
  | { jenis: 'galat'; pesan: string }

const BATAS_PINDAI_JUDUL = 20
// Blok tanpa judul = tempelan mulai sel Tanggal yang mencapai kolom Debet —
// baris transaksi minimal. Diturunkan dari urutan kolom, bukan angka mati.
const KOLOM_MIN_BLOK = KOLOM_GRID.indexOf('masuk') + 1

/**
 * Tempelan → jenis aksinya (S6 punya keduanya; yang memilih ada di sini).
 *
 * BLOK TRANSAKSI bila (a) ada baris judul yang dikenali di 20 baris pertama,
 * atau (b) ditempel mulai sel Tanggal dengan ≥ 3 kolom — bentuk sepotong
 * rekening koran. Blok DISISIPKAN sebagai baris baru (tidak pernah menimpa
 * mutasi tersimpan) dan arahnya diputuskan rantai saldo, bukan judul kolom.
 * Selain itu PERSEGI SEL ala spreadsheet: menimpa mulai sel aktif.
 */
export function rencanaTempel(teks: string, posisi: { kolom: KolomGrid }, periode: Periode): RencanaTempel {
  const { baris, nomor } = belahTempelan(teks)
  if (baris.length === 0) return { jenis: 'galat', pesan: 'Tempelan kosong.' }
  const lebar = baris.reduce((m, b) => Math.max(m, b.length), 0)
  const adaJudul = baris.slice(0, BATAS_PINDAI_JUDUL).some(b => kenaliJudul(b) !== null)
  const blok = adaJudul || (posisi.kolom === 'tanggal' && lebar >= KOLOM_MIN_BLOK)
  if (!blok) return { jenis: 'sel', isi: normalisasiKolomTanggal(baris, posisi.kolom, periode) }
  const hasil = bacaBlok({ baris, nomor, sumber: 'tempel', periode, jangkarKolom: posisi.kolom })
  if (!hasil.ok) return { jenis: 'galat', pesan: hasil.pesan }
  return { jenis: 'blok', hasil }
}

/**
 * Persegi sel: sel yang mendarat di kolom Tanggal dinormalisasi ke
 * 'YYYY-MM-DD' (D66), dengan bukti urutan hari/bulan dari sel-sel tanggal
 * tempelan itu sendiri — aturan yang sama dengan blok.
 */
function normalisasiKolomTanggal(isi: string[][], mulai: KolomGrid, periode: Periode): string[][] {
  const c = KOLOM_GRID.indexOf('tanggal') - KOLOM_GRID.indexOf(mulai)
  if (c < 0) return isi
  const grid = bulanGridDari(periode)
  const urutan = urutanBlok(isi.map(r => r[c] ?? ''))
  return isi.map(r => (c < r.length ? r.map((v, i) => (i === c ? normalisasiTanggal(v, grid, urutan) : v)) : r))
}

/** Ketikan satu sel → teks yang disimpan: sel Tanggal dinormalisasi (D66), sel lain apa adanya. */
export function teksKetikan(kolom: KolomGrid, nilai: string, periode: Periode): string {
  return kolom === 'tanggal' ? normalisasiTanggal(nilai, bulanGridDari(periode)) : nilai
}

/**
 * Berkas CSV (D47: pintu masuk grid, pengganti wizard impor) → blok transaksi.
 * Jalurnya SAMA dengan tempelan — `bacaBlok`, rantai saldo, arah — hanya
 * sumbernya 'berkas' (satu `cash_mutation_imports` per berkas saat Simpan).
 */
export function rencanaBerkas(teks: string, periode: Periode): RencanaTempel {
  const isi = teks.charCodeAt(0) === 0xfeff ? teks.slice(1) : teks
  const { rows } = parseCsv(isi)
  if (rows.length === 0) return { jenis: 'galat', pesan: 'Berkas kosong.' }
  const hasil = bacaBlok({
    baris: rows.map(r => r.cells),
    nomor: rows.map(r => r.nomor),
    sumber: 'berkas',
    periode,
    jangkarKolom: 'tanggal',
  })
  if (!hasil.ok) return { jenis: 'galat', pesan: hasil.pesan }
  if (hasil.baris.length === 0) return { jenis: 'galat', pesan: 'Tidak ada baris transaksi yang terbaca di berkas ini.' }
  return { jenis: 'blok', hasil }
}

// ── Galat Simpan dari server → sel ───────────────────────────

export type GalatServer = { kunci: string; kolom?: string; pesan: string; jenis: string }
export type GalatServerBaris = Partial<Record<KolomGrid, string>> & { baris?: string }

/**
 * Galat per baris & per kolom dari route batch → peta per KUNCI grid. Kunci
 * yang tidak ada di grid (mis. baris yang dihapus dari grid tapi ditolak
 * server) dikembalikan sebagai daftar `lepas` — ditampilkan di banner, tidak
 * pernah dibuang diam-diam.
 */
export function petaGalatServer(
  galat: readonly GalatServer[],
  kunciGrid: ReadonlySet<string>
): { perBaris: Map<string, GalatServerBaris>; lepas: string[] } {
  const perBaris = new Map<string, GalatServerBaris>()
  const lepas: string[] = []
  for (const g of galat) {
    if (!kunciGrid.has(g.kunci)) {
      lepas.push(g.pesan)
      continue
    }
    const sel: GalatServerBaris = perBaris.get(g.kunci) ?? {}
    const kolom = g.kolom && (KOLOM_GRID as readonly string[]).includes(g.kolom) ? (g.kolom as KolomGrid) : 'baris'
    sel[kolom] = sel[kolom] ? `${sel[kolom]} ${g.pesan}` : g.pesan
    perBaris.set(g.kunci, sel)
  }
  return { perBaris, lepas }
}
