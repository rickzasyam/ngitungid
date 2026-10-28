// Keadaan DRAF grid mutasi kas (MP §5.G S6). MURNI (tanpa I/O, tanpa React) —
// reducer + selektor, diuji tanpa merender apa pun.
//
// ══ DRAF HIDUP DI SINI, BUKAN DI SERVER (D51) ════════════════════════════
// Ketik, tempel, berkas CSV, dan PDF semuanya berakhir sebagai baris draf di
// keadaan ini; tidak ada yang tersimpan sampai Simpan mengirim `diffKeBatch`
// ke SATU route batch (D48). Cadangan IndexedDB (S9) hanya menyalin keadaan
// ini, tidak punya aturan sendiri.
//
// ══ IDENTITAS BARIS YANG TIDAK DISENTUH DIPERTAHANKAN ═════════════════════
// Setiap aksi membuat array baris BARU, tapi objek baris yang tidak berubah
// tetap objek yang sama. Itu yang membuat validasi per baris bisa di-memo
// lewat WeakMap (spike S0: tempel 10.000 baris < 100 ms bergantung padanya),
// dan yang membuat undo/redo murah: riwayat hanya menyimpan array referensi.
//
// ══ SEL TERKUNCI DITOLAK DI SINI, BUKAN HANYA DIREDUPKAN ═════════════════
// Kunci per baris/kolom datang dari server (`kunciMutasi`, S7 — aturan yang
// SAMA dengan route). Reducer menolak setiap perubahan ke sel terkunci,
// termasuk lewat tempel dan aksi massal, dan melaporkan baris yang dilewati —
// supaya grid tidak pernah menampilkan suntingan yang pasti ditolak server.
//
// ══ Masuk/Keluar ↔ debit/kredit HANYA DI `diffKeBatch` (D36) ═════════════
// Grid berbicara Masuk/Keluar; database berbicara debit (= uang masuk akun kas)
// dan kredit. Penerjemahannya satu tempat, di ujung keluar.

import {
  KOLOM_GRID,
  bacaSaldoSel,
  nominalKeSel,
  selKosong,
  validasiBaris,
  ymdKeSel,
  type Arah,
  type BarisDilewati,
  type HasilBacaBlok,
  type HasilValidasi,
  type KolomGrid,
  type KonteksValidasi,
  type NilaiDraf,
  type SelDraf,
  type SumberBlok,
} from '@/lib/mutasi-draf'
import { fromMinorUnits } from '@/lib/journal'
import { tentukanArah, barisRantaiDariSel, type OrientasiBlok } from '@/lib/saldo-berantai'
import { fmtTanggal } from '@/lib/ymd'

export const BATAS_RIWAYAT = 100

export type AsalBaris = 'server' | 'ketik' | 'tempel' | 'berkas' | 'pdf'

/** Kunci satu baris (S7 `kunciMutasi`): `baris` = seluruh baris + hapus; `kolom` = per kolom. */
export type KunciBaris = {
  baris: string | null
  kolom: Partial<Record<KolomGrid, string>>
}

export const TANPA_KUNCI: KunciBaris = { baris: null, kolom: {} }

export type BarisGrid = {
  /** Kunci stabil grid: id server, atau `baru-N` untuk baris draf. */
  kunci: string
  /** Id server; null = baris baru. */
  id: string | null
  sel: SelDraf
  asal: AsalBaris
  /** Blok tempelan/berkas/PDF asal baris ini (arah per blok). */
  blok: string | null
  /** Halaman PDF (kolom "Hal."). */
  halaman: number | null
  /** Penanda DB/CR (petunjuk arah, S2). */
  penanda: Arah | null
  /** D50: teks saldo ASLI yang dikosongkan — tetap tampil dicoret & tercatat. null = tidak dikosongkan. */
  saldoDikosongkan: string | null
  terkunci: KunciBaris
}

/** Satu mutasi tersimpan, sebagaimana dikirim S8 — pembanding diff & titik "Batalkan semua". */
export type BarisServer = {
  id: string
  updatedAt: string
  nilai: NilaiDraf
  /** Teks akun lawan untuk sel (kode akun). */
  akunLawanTeks: string
  terkunci: KunciBaris
}

export type StatusArah = 'otomatis' | 'wajib' | 'dipilih'

export type BlokGrid = {
  id: string
  sumber: SumberBlok
  namaBerkas: string | null
  judulNominal: string[]
  /** Ke mana kolom nominal pertama ditaruh SEMENTARA oleh S2. */
  pertamaKe: Arah
  satuKolom: boolean
  /** Orientasi yang SEDANG diterapkan ke baris blok, relatif orientasi sementara S2. */
  diterapkan: OrientasiBlok
  status: StatusArah
  alasan: string
  peringatan: string | null
  dilewati: BarisDilewati[]
  /** Saldo baris SALDO AWAL di awal blok (teks) — jangkar rantai (D61). */
  jangkarSaldo: string | null
}

export type LaporanAksi = {
  aksi: string
  diterapkan: number
  dilewati: { kunci: string; alasan: string }[]
}

type Potret = { baris: readonly BarisGrid[]; blok: Readonly<Record<string, BlokGrid>> }

export type KeadaanGrid = {
  baris: readonly BarisGrid[]
  blok: Readonly<Record<string, BlokGrid>>
  server: ReadonlyMap<string, BarisServer>
  /** Urutan baris server saat dimuat — untuk "Batalkan semua". */
  urutanServer: readonly string[]
  lalu: readonly Potret[]
  nanti: readonly Potret[]
  /** Penghitung kunci baris & blok baru. */
  berikut: number
  laporan: LaporanAksi | null
}

export type AksiGrid =
  | { jenis: 'muat'; baris: readonly BarisServer[] }
  | { jenis: 'ubahSel'; kunci: string; kolom: KolomGrid; nilai: string }
  | { jenis: 'tempelSel'; indeks: number; kolom: KolomGrid; isi: readonly (readonly string[])[] }
  | {
      jenis: 'tempelBlok'
      indeks: number
      hasil: Extract<HasilBacaBlok, { ok: true }>
      sumber: SumberBlok
      namaBerkas: string | null
    }
  | { jenis: 'tambahBaris'; indeks: number; jumlah: number }
  | { jenis: 'hapusBaris'; kunci: readonly string[] }
  | { jenis: 'pilihArah'; blok: string; orientasi: OrientasiBlok }
  | { jenis: 'terapkanUsulan'; usulan: readonly { kunci: string; akunLawan: string }[] }
  | { jenis: 'isiAkunLawanMassal'; kunci: readonly string[]; akunLawan: string }
  | { jenis: 'isiTanggalAkhirPeriode'; kunci: readonly string[]; tanggal: string }
  | { jenis: 'kosongkanSaldo'; kunci: readonly string[] }
  | { jenis: 'undo' }
  | { jenis: 'redo' }
  | { jenis: 'buangSemua' }

// ── Pembangun ────────────────────────────────────────────────

export function selDariServer(b: BarisServer): SelDraf {
  return {
    tanggal: ymdKeSel(b.nilai.tanggal),
    uraian: b.nilai.keterangan ?? '',
    masuk: b.nilai.debit === '0.00' ? '' : nominalKeSel(b.nilai.debit),
    keluar: b.nilai.kredit === '0.00' ? '' : nominalKeSel(b.nilai.kredit),
    saldo: nominalKeSel(b.nilai.saldo),
    akunLawan: b.akunLawanTeks,
    catatan: b.nilai.catatan ?? '',
  }
}

function barisDariServer(b: BarisServer): BarisGrid {
  return {
    kunci: b.id,
    id: b.id,
    sel: selDariServer(b),
    asal: 'server',
    blok: null,
    halaman: null,
    penanda: null,
    saldoDikosongkan: null,
    terkunci: b.terkunci,
  }
}

export function keadaanAwal(baris: readonly BarisServer[] = []): KeadaanGrid {
  return {
    baris: baris.map(barisDariServer),
    blok: {},
    server: new Map(baris.map(b => [b.id, b])),
    urutanServer: baris.map(b => b.id),
    lalu: [],
    nanti: [],
    berikut: 1,
    laporan: null,
  }
}

const barisBaru = (kunci: string, asal: AsalBaris, sel: SelDraf = selKosong()): BarisGrid => ({
  kunci,
  id: null,
  sel,
  asal,
  blok: null,
  halaman: null,
  penanda: null,
  saldoDikosongkan: null,
  terkunci: TANPA_KUNCI,
})

// ── Penjaga kunci ────────────────────────────────────────────

/** Alasan sel ini tidak boleh diubah, atau null. */
export function alasanTerkunci(b: BarisGrid, kolom: KolomGrid): string | null {
  return b.terkunci.baris ?? b.terkunci.kolom[kolom] ?? null
}

// ── Reducer ──────────────────────────────────────────────────

/** Simpan potret SEBELUM perubahan; batas 100 aksi; redo dikosongkan. */
function catat(s: KeadaanGrid, baris: readonly BarisGrid[], blok: Readonly<Record<string, BlokGrid>>, extra: Partial<KeadaanGrid> = {}): KeadaanGrid {
  const lalu = [...s.lalu, { baris: s.baris, blok: s.blok }]
  if (lalu.length > BATAS_RIWAYAT) lalu.splice(0, lalu.length - BATAS_RIWAYAT)
  return { ...s, ...extra, baris, blok, lalu, nanti: [] }
}

function petaIndeks(baris: readonly BarisGrid[]): Map<string, number> {
  const m = new Map<string, number>()
  baris.forEach((b, i) => m.set(b.kunci, i))
  return m
}

/**
 * Tulis satu sel; kembalikan baris BARU, atau baris yang sama bila tak berubah.
 *
 * D50: saldo DOKUMEN (dari server, tempelan, berkas, PDF) yang dikosongkan —
 * lewat aksi "Kosongkan saldo" maupun tombol Delete — selalu dicatat aslinya,
 * supaya tidak pernah hilang diam-diam. Saldo yang diketik sendiri di baris
 * ketikan bukan fakta dokumen, jadi menghapusnya tidak ditandai. Saldo yang
 * diisi kembali bukan lagi "dikosongkan".
 */
function tulisSel(b: BarisGrid, kolom: KolomGrid, nilai: string): BarisGrid {
  if (b.sel[kolom] === nilai) return b
  const sel = { ...b.sel, [kolom]: nilai }
  let saldoDikosongkan = b.saldoDikosongkan
  if (kolom === 'saldo') {
    if (nilai.trim() !== '') saldoDikosongkan = null
    else if (b.asal !== 'ketik' && b.sel.saldo.trim() !== '') saldoDikosongkan = b.saldoDikosongkan ?? b.sel.saldo
  }
  return { ...b, sel, saldoDikosongkan }
}

const tukarMasukKeluar = (b: BarisGrid): BarisGrid => ({
  ...b,
  sel: { ...b.sel, masuk: b.sel.keluar, keluar: b.sel.masuk },
})

/**
 * Aksi massal ke sekumpulan baris: terapkan `ubah` ke yang boleh, laporkan
 * yang dilewati beserta alasannya. Satu entri riwayat untuk seluruh aksi.
 */
function massal(
  s: KeadaanGrid,
  aksi: string,
  kunci: readonly string[],
  ubah: (b: BarisGrid) => BarisGrid | { lewati: string }
): KeadaanGrid {
  const idx = petaIndeks(s.baris)
  const baris = [...s.baris]
  const dilewati: LaporanAksi['dilewati'] = []
  let diterapkan = 0
  for (const k of kunci) {
    const i = idx.get(k)
    if (i === undefined) continue
    const hasil = ubah(baris[i])
    if ('lewati' in hasil) {
      dilewati.push({ kunci: k, alasan: hasil.lewati })
      continue
    }
    if (hasil !== baris[i]) {
      baris[i] = hasil
      diterapkan++
    }
  }
  const laporan = { aksi, diterapkan, dilewati }
  if (diterapkan === 0) return { ...s, laporan }
  return catat(s, baris, s.blok, { laporan })
}

export function reducerGrid(s: KeadaanGrid, a: AksiGrid): KeadaanGrid {
  switch (a.jenis) {
    case 'muat':
      return keadaanAwal(a.baris)

    case 'ubahSel': {
      const i = s.baris.findIndex(b => b.kunci === a.kunci)
      if (i < 0) return s
      const b = s.baris[i]
      const alasan = alasanTerkunci(b, a.kolom)
      if (alasan) return { ...s, laporan: { aksi: 'Ubah sel', diterapkan: 0, dilewati: [{ kunci: a.kunci, alasan }] } }
      const baru = tulisSel(b, a.kolom, a.nilai)
      if (baru === b) return s
      const baris = [...s.baris]
      baris[i] = baru
      return catat(s, baris, s.blok, { laporan: null })
    }

    case 'tempelSel': {
      // Semantik spreadsheet: menimpa persegi mulai sel aktif; baris yang
      // melewati akhir grid ditambahkan sebagai baris baru.
      const mulaiKolom = KOLOM_GRID.indexOf(a.kolom)
      const baris = [...s.baris]
      let berikut = s.berikut
      const dilewati: LaporanAksi['dilewati'] = []
      let diterapkan = 0
      a.isi.forEach((isiBaris, r) => {
        const i = a.indeks + r
        if (i >= baris.length) baris.push(barisBaru(`baru-${berikut++}`, 'tempel'))
        let b = baris[i]
        isiBaris.forEach((teks, c) => {
          const kolom = KOLOM_GRID[mulaiKolom + c]
          if (kolom === undefined) return
          const alasan = alasanTerkunci(b, kolom)
          if (alasan) {
            dilewati.push({ kunci: b.kunci, alasan })
            return
          }
          b = tulisSel(b, kolom, teks)
        })
        if (b !== baris[i]) {
          baris[i] = b
          diterapkan++
        }
      })
      if (diterapkan === 0 && berikut === s.berikut) {
        return { ...s, laporan: { aksi: 'Tempel', diterapkan: 0, dilewati } }
      }
      return catat(s, baris, s.blok, { berikut, laporan: { aksi: 'Tempel', diterapkan, dilewati } })
    }

    case 'tempelBlok': {
      // Blok TRANSAKSI (judul dikenali, atau baris utuh mulai kolom Tanggal):
      // DISISIPKAN sebagai baris baru — tidak pernah menimpa mutasi tersimpan.
      // Arahnya diputuskan di sini lewat rantai saldo (S3).
      const h = a.hasil
      const blokId = `blok-${s.berikut}`
      let berikut = s.berikut + 1
      const asal: AsalBaris = a.sumber
      const rows = h.baris.map(bb => ({
        ...barisBaru(`baru-${berikut++}`, asal, bb.sel),
        blok: blokId,
        halaman: bb.halaman,
        penanda: bb.penanda,
      }))
      const jangkarTeks = h.titikSaldo.find(t => t.setelah === 0)?.saldo ?? null
      const titik = h.titikSaldo.flatMap(t => {
        const sd = bacaSaldoSel(t.saldo)
        return sd.status === 'ok' ? [{ setelah: t.setelah, saldo: sd.minor }] : []
      })
      const arah =
        h.judulNominal.length === 0
          ? null
          : tentukanArah({
              baris: rows.map(r => ({ ...barisRantaiDariSel(r.sel), penanda: r.penanda })),
              titik,
            })
      // Tanpa kolom nominal sama sekali tidak ada yang perlu diputuskan.
      const status: StatusArah = arah === null || arah.arah !== null ? 'otomatis' : 'wajib'
      const diterapkan: OrientasiBlok = arah === null ? 'normal' : (arah.arah ?? arah.usulan)
      const final = diterapkan === 'tukar' ? rows.map(tukarMasukKeluar) : rows
      const blok: BlokGrid = {
        id: blokId,
        sumber: a.sumber,
        namaBerkas: a.namaBerkas,
        judulNominal: h.judulNominal,
        pertamaKe: h.pertamaKe,
        satuKolom: h.satuKolom,
        diterapkan,
        status,
        alasan: arah?.alasan ?? 'Blok tanpa kolom nominal.',
        peringatan: arah?.peringatan ?? null,
        dilewati: h.dilewati,
        jangkarSaldo: jangkarTeks,
      }
      const indeks = Math.max(0, Math.min(a.indeks, s.baris.length))
      const baris = [...s.baris.slice(0, indeks), ...final, ...s.baris.slice(indeks)]
      return catat(s, baris, { ...s.blok, [blokId]: blok }, {
        berikut,
        laporan: { aksi: 'Tempel blok', diterapkan: final.length, dilewati: [] },
      })
    }

    case 'tambahBaris': {
      let berikut = s.berikut
      const baru = Array.from({ length: Math.max(0, a.jumlah) }, () => barisBaru(`baru-${berikut++}`, 'ketik'))
      if (baru.length === 0) return s
      const indeks = Math.max(0, Math.min(a.indeks, s.baris.length))
      const baris = [...s.baris.slice(0, indeks), ...baru, ...s.baris.slice(indeks)]
      return catat(s, baris, s.blok, { berikut, laporan: null })
    }

    case 'hapusBaris': {
      const target = new Set(a.kunci)
      const dilewati: LaporanAksi['dilewati'] = []
      const baris = s.baris.filter(b => {
        if (!target.has(b.kunci)) return true
        if (b.terkunci.baris) {
          dilewati.push({ kunci: b.kunci, alasan: b.terkunci.baris })
          return true
        }
        return false
      })
      const laporan = { aksi: 'Hapus baris', diterapkan: s.baris.length - baris.length, dilewati }
      if (baris.length === s.baris.length) return { ...s, laporan }
      return catat(s, baris, s.blok, { laporan })
    }

    case 'pilihArah': {
      const blok = s.blok[a.blok]
      if (!blok) return s
      const perluTukar = blok.diterapkan !== a.orientasi
      const dilewati: LaporanAksi['dilewati'] = []
      const baris = perluTukar
        ? s.baris.map(b => {
            if (b.blok !== a.blok) return b
            const alasan = alasanTerkunci(b, 'masuk') ?? alasanTerkunci(b, 'keluar')
            if (alasan) {
              dilewati.push({ kunci: b.kunci, alasan })
              return b
            }
            return tukarMasukKeluar(b)
          })
        : s.baris
      if (!perluTukar && blok.status !== 'wajib') return s
      // Pilihan pengguna selalu tercatat sebagai 'dipilih' — juga saat ia
      // menimpa arah otomatis dari saldo (rantai yang lalu putus tetap menahan Simpan).
      const blokBaru: BlokGrid = { ...blok, diterapkan: a.orientasi, status: 'dipilih' }
      return catat(s, baris, { ...s.blok, [a.blok]: blokBaru }, {
        laporan: { aksi: 'Pilih arah', diterapkan: baris === s.baris ? 0 : baris.filter(b => b.blok === a.blok).length, dilewati },
      })
    }

    case 'terapkanUsulan': {
      const peta = new Map(a.usulan.map(u => [u.kunci, u.akunLawan]))
      return massal(s, 'Terapkan usulan', [...peta.keys()], b => {
        const alasan = alasanTerkunci(b, 'akunLawan')
        if (alasan) return { lewati: alasan }
        return tulisSel(b, 'akunLawan', peta.get(b.kunci) ?? b.sel.akunLawan)
      })
    }

    case 'isiAkunLawanMassal':
      return massal(s, 'Isi akun lawan', a.kunci, b => {
        const alasan = alasanTerkunci(b, 'akunLawan')
        if (alasan) return { lewati: alasan }
        return tulisSel(b, 'akunLawan', a.akunLawan)
      })

    case 'isiTanggalAkhirPeriode': {
      // D60: aksi EKSPLISIT, hanya untuk baris yang tanggalnya KOSONG —
      // tanggal yang sudah ada tidak pernah ditimpa tanggal karangan.
      const teks = ymdKeSel(a.tanggal)
      return massal(s, 'Isi tanggal akhir periode', a.kunci, b => {
        if (b.sel.tanggal.trim() !== '') return { lewati: 'Sudah bertanggal.' }
        const alasan = alasanTerkunci(b, 'tanggal')
        if (alasan) return { lewati: alasan }
        return tulisSel(b, 'tanggal', teks)
      })
    }

    case 'kosongkanSaldo':
      // D50: saldo ASLI disimpan di baris supaya tetap tampil (dicoret) dan
      // tercatat sebagai event `saldo_dikosongkan` saat Simpan.
      return massal(s, 'Kosongkan saldo', a.kunci, b => {
        if (b.sel.saldo.trim() === '') return { lewati: 'Saldo sudah kosong.' }
        const alasan = alasanTerkunci(b, 'saldo')
        if (alasan) return { lewati: alasan }
        return { ...tulisSel(b, 'saldo', ''), saldoDikosongkan: b.saldoDikosongkan ?? b.sel.saldo }
      })

    case 'undo': {
      const p = s.lalu[s.lalu.length - 1]
      if (!p) return s
      return {
        ...s,
        baris: p.baris,
        blok: p.blok,
        lalu: s.lalu.slice(0, -1),
        nanti: [...s.nanti, { baris: s.baris, blok: s.blok }],
        laporan: null,
      }
    }

    case 'redo': {
      const p = s.nanti[s.nanti.length - 1]
      if (!p) return s
      return {
        ...s,
        baris: p.baris,
        blok: p.blok,
        nanti: s.nanti.slice(0, -1),
        lalu: [...s.lalu, { baris: s.baris, blok: s.blok }],
        laporan: null,
      }
    }

    case 'buangSemua': {
      const awal = s.urutanServer.flatMap(id => {
        const b = s.server.get(id)
        return b ? [barisDariServer(b)] : []
      })
      return catat(s, awal, {}, { laporan: null })
    }
  }
}

// ── Selektor ─────────────────────────────────────────────────

/** Blok yang masih punya baris dan arahnya WAJIB dipilih — menahan Simpan. */
export function blokWajibPilih(s: KeadaanGrid): BlokGrid[] {
  const ada = new Set(s.baris.map(b => b.blok).filter((x): x is string => x !== null))
  return Object.values(s.blok).filter(b => b.status === 'wajib' && ada.has(b.id))
}

/** Blok yang masih punya baris (untuk banner arah & panel baris dilewati). */
export function blokAktif(s: KeadaanGrid): BlokGrid[] {
  const ada = new Set(s.baris.map(b => b.blok).filter((x): x is string => x !== null))
  return Object.values(s.blok).filter(b => ada.has(b.id))
}

/**
 * Jangkar rantai saldo grid (D61), urut: baris SALDO AWAL blok yang membuka
 * grid → saldo tersimpan sebelum rentang (S8) → isian manual di bilah grid.
 */
export function jangkarGrid(s: KeadaanGrid, saldoServer: string | null, manual: string): { teks: string | null; sumber: 'blok' | 'server' | 'manual' | null } {
  const pertama = s.baris[0]
  const blok = pertama?.blok ? s.blok[pertama.blok] : undefined
  if (blok?.jangkarSaldo) return { teks: blok.jangkarSaldo, sumber: 'blok' }
  if (saldoServer !== null) return { teks: nominalKeSel(saldoServer), sumber: 'server' }
  if (manual.trim() !== '') return { teks: manual, sumber: 'manual' }
  return { teks: null, sumber: null }
}

export type KonteksGrid = KonteksValidasi & {
  /** Kunci periode klien (D17); tanggal ≤ ini = galat untuk baris baru/berubah tanggal. */
  terkunciSampai: string | null
}

/**
 * Validator per baris, di-memo per OBJEK baris (WeakMap) — aman karena reducer
 * mempertahankan identitas baris yang tidak disentuh. Dibuat ulang bila
 * konteksnya berubah.
 */
export function buatValidator(k: KonteksGrid, server: ReadonlyMap<string, BarisServer>) {
  const memo = new WeakMap<BarisGrid, HasilValidasi>()
  return (b: BarisGrid): HasilValidasi => {
    const lama = memo.get(b)
    if (lama) return lama
    let h = validasiBaris(b.sel, k)
    if (h.nilai && k.terkunciSampai && h.nilai.tanggal <= k.terkunciSampai) {
      const asal = b.id ? server.get(b.id) : undefined
      if (!asal || asal.nilai.tanggal !== h.nilai.tanggal) {
        h = {
          galat: { tanggal: `Periode terkunci s.d. ${fmtTanggal(k.terkunciSampai)} — pilih tanggal sesudahnya.` },
          galatBaris: [],
          nilai: null,
        }
      }
    }
    memo.set(b, h)
    return h
  }
}

// ── diff → batch (D48) ───────────────────────────────────────

export type BatchBaru = NilaiDraf & {
  kunci: string
  /** Posisi dalam Simpan ini (1-based) — urutan baku `tanggal, created_at, urutan, id` (D49). */
  urutan: number
  asal: Exclude<AsalBaris, 'server'>
  /** Blok berkas/PDF → satu `cash_mutation_imports` per berkas (N4). */
  blok: string | null
  /** D50: saldo kanonik ASLI bila dikosongkan. */
  saldoDikosongkan: string | null
}

export type BatchUbah = NilaiDraf & {
  id: string
  updatedAt: string
  saldoDikosongkan: string | null
}

export type BatchHapus = { id: string; updatedAt: string }

export type BerkasBatch = { blok: string; namaBerkas: string; sumber: 'berkas' | 'pdf' }

export type HasilDiff = {
  baru: BatchBaru[]
  ubah: BatchUbah[]
  hapus: BatchHapus[]
  berkas: BerkasBatch[]
  /** Kunci baris baru/berubah yang masih galat — Simpan tertahan. */
  galat: string[]
}

const samaNilai = (a: NilaiDraf, b: NilaiDraf) =>
  a.tanggal === b.tanggal &&
  a.debit === b.debit &&
  a.kredit === b.kredit &&
  a.saldo === b.saldo &&
  a.keterangan === b.keterangan &&
  a.catatan === b.catatan &&
  a.akunLawanId === b.akunLawanId

const saldoKanonik = (teks: string | null): string | null => {
  if (teks === null) return null
  const h = bacaSaldoSel(teks)
  return h.status === 'ok' ? fromMinorUnits(h.minor) : null
}

/**
 * Keadaan draf → isi `POST /api/cash-mutations/batch`.
 *
 * Perbandingan atas NILAI tervalidasi, bukan teks sel: "1500000" dan
 * "1.500.000" adalah nilai yang sama, jadi baris yang dikembalikan ke nilai
 * semulanya tidak ikut terkirim. Baris tersimpan yang tidak berubah tidak
 * divalidasi ulang sebagai syarat Simpan.
 */
export function diffKeBatch(s: KeadaanGrid, validasi: (b: BarisGrid) => HasilValidasi): HasilDiff {
  const baru: BatchBaru[] = []
  const ubah: BatchUbah[] = []
  const galat: string[] = []
  const tetap = new Set<string>()
  const berkasPerBlok = new Map<string, BerkasBatch>()

  for (const b of s.baris) {
    if (b.id === null) {
      // Baris baru yang seluruh selnya kosong adalah baris kosong grid — bukan mutasi.
      if (Object.values(b.sel).every(v => v.trim() === '')) continue
      const h = validasi(b)
      if (!h.nilai) {
        galat.push(b.kunci)
        continue
      }
      const asal = b.asal === 'server' ? 'ketik' : b.asal
      baru.push({
        ...h.nilai,
        kunci: b.kunci,
        urutan: baru.length + 1,
        asal,
        blok: b.blok,
        saldoDikosongkan: h.nilai.saldo === null ? saldoKanonik(b.saldoDikosongkan) : null,
      })
      if (b.blok && (asal === 'berkas' || asal === 'pdf')) {
        const blok = s.blok[b.blok]
        if (blok && !berkasPerBlok.has(blok.id)) {
          berkasPerBlok.set(blok.id, { blok: blok.id, namaBerkas: blok.namaBerkas ?? 'berkas', sumber: asal })
        }
      }
      continue
    }
    tetap.add(b.id)
    const asalServer = s.server.get(b.id)
    if (!asalServer) continue
    const h = validasi(b)
    if (!h.nilai) {
      // Baris tersimpan yang galat hanya menahan Simpan bila SELNYA berubah.
      const selAwal = selDariServer(asalServer)
      if (KOLOM_GRID.some(k => selAwal[k] !== b.sel[k])) galat.push(b.kunci)
      continue
    }
    if (samaNilai(h.nilai, asalServer.nilai)) continue
    ubah.push({
      ...h.nilai,
      id: b.id,
      updatedAt: asalServer.updatedAt,
      saldoDikosongkan:
        h.nilai.saldo === null && asalServer.nilai.saldo !== null && b.saldoDikosongkan !== null
          ? asalServer.nilai.saldo
          : null,
    })
  }

  const hapus: BatchHapus[] = []
  for (const [id, sv] of s.server) if (!tetap.has(id)) hapus.push({ id, updatedAt: sv.updatedAt })

  return { baru, ubah, hapus, berkas: [...berkasPerBlok.values()], galat }
}

/** Ada perubahan yang belum disimpan? (penjaga D51). */
export function adaPerubahan(d: HasilDiff): boolean {
  return d.baru.length + d.ubah.length + d.hapus.length > 0 || d.galat.length > 0
}
