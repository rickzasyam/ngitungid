// Satu pintu dari TEKS BERTABEL ke BARIS DRAF grid mutasi kas (MP §5.G S2).
// MURNI (tanpa I/O, tanpa React), TANPA RegExp (D22 — dikunci test pemindai
// sumber).
//
// ══ SATU ATURAN UNTUK SEMUA SUMBER ═══════════════════════════════════════
// Tempelan (TSV dari Excel/Google Sheets/internet banking), berkas CSV, dan
// tabel hasil AI dari PDF (`HalamanMentah`, kontrak Stream B) semuanya lewat
// `bacaBlok`. Tidak ada parser khusus per bank dan tidak ada parser khusus per
// sumber: yang berbeda hanya cara teksnya sampai ke sini.
//
// ══ ARAH UANG TIDAK PERNAH DARI JUDUL KOLOM (ditetapkan Ricko 2026-10-26) ═
// Template akuntan: Debet = MASUK. Rekening koran bank: Debet = KELUAR. Judul
// "Debet/Kredit" di sini hanya berarti "ada dua kolom nominal". Modul ini
// menaruh nilainya di Masuk/Keluar dengan orientasi SEMENTARA (`pertamaKe`) —
// yang memutuskan arah adalah rantai saldo (lib/saldo-berantai.ts, S3), atau
// pilihan eksplisit pengguna bila saldonya tidak ada. Judul yang tak ambigu
// ("Masuk", "Penerimaan") dan penanda DB/CR hanya PETUNJUK.
//
// ══ BARIS YANG BUKAN TRANSAKSI DIKEMBALIKAN, BUKAN DIBUANG ═══════════════
// Judul kolom yang tercetak ulang, SALDO AWAL/AKHIR, TOTAL, dan baris kosong
// dilewati — tapi sebagai DAFTAR BERALASAN, supaya jumlah baris berkas tetap
// bisa dicocokkan. Baris yang ragu-ragu TIDAK dilewati: ia masuk grid sebagai
// transaksi yang galat (merah), karena transaksi yang hilang diam-diam adalah
// kegagalan termahal modul ini.

import {
  deteksiTanggalMMDD,
  normalizeHeader,
  parseCsv,
  parseTanggalCell,
  potonganTanggal,
} from '@/lib/csv/mutasi-kas'
import { bacaNominal, pesanGalatNominal } from '@/lib/nominal'
import { fromMinorUnits, toMinorUnits } from '@/lib/journal'
import { CATATAN_MAX, KETERANGAN_MAX, validateCashMutation } from '@/lib/cash-mutation'
import { fmtTanggal } from '@/lib/ymd'
import type { BarisMentah, HalamanMentah } from '@/lib/mutasi-kas/kontrak-baris-mentah'

// ── Kolom grid ───────────────────────────────────────────────

/** Urutan kolom grid — juga urutan POSISIONAL untuk tempelan tanpa judul. */
export const KOLOM_GRID = ['tanggal', 'uraian', 'masuk', 'keluar', 'saldo', 'akunLawan', 'catatan'] as const
export type KolomGrid = (typeof KOLOM_GRID)[number]

export const LABEL_KOLOM: Record<KolomGrid, string> = {
  tanggal: 'Tanggal',
  uraian: 'Uraian',
  masuk: 'Masuk',
  keluar: 'Keluar',
  saldo: 'Saldo',
  akunLawan: 'Akun lawan',
  catatan: 'Catatan',
}

/** Isi satu baris draf: TEKS sebagaimana tampil/diketik di sel. */
export type SelDraf = Record<KolomGrid, string>

export function selKosong(): SelDraf {
  return { tanggal: '', uraian: '', masuk: '', keluar: '', saldo: '', akunLawan: '', catatan: '' }
}

/** Rentang periode grid, inklusif, 'YYYY-MM-DD'. Memutus makna tanggal ambigu. */
export type Periode = { mulai: string; akhir: string }

export type Arah = 'masuk' | 'keluar'

export type SumberBlok = 'tempel' | 'berkas' | 'pdf'

// ── Judul kolom → peran ──────────────────────────────────────

export type Peran =
  | 'tanggal'
  | 'uraian'
  | 'nominal'
  | 'penanda'
  | 'saldo'
  | 'akunLawan'
  | 'catatan'
  | 'abaikan'

export type PeranKolom = {
  peran: Peran
  /** Judul apa adanya ('' untuk pemetaan posisional tanpa judul). */
  judul: string
  /** Hanya untuk `nominal`: arah yang TERSIRAT judulnya, bila tak ambigu. */
  petunjuk?: Arah | null
}

type Alias = { peran: Peran; petunjuk?: Arah | null }

// Kunci = hasil `normalizeHeader` (huruf kecil, tanda baca jadi spasi).
//
// Debet/Kredit/Debit/Credit/DB/CR sengaja TANPA petunjuk — itulah seluruh
// kotak Arah di MP §5.G. Yang berpetunjuk hanya kata yang memang sudut pandang
// pemilik rekening ("masuk", "penerimaan", "penarikan").
//
// "catatan" di sini = kolom CATATAN (Konfirmasi/Reff template akuntan), BUKAN
// uraian — berbeda dari alias impor CSV lama (N3) yang memetakannya ke
// keterangan. Alias lama itu (beserta "Debet = keluar") pensiun bersama wizard
// lama di S9 (D47).
const JUDUL: Record<string, Alias> = {
  // tanggal
  'tanggal': { peran: 'tanggal' },
  'tgl': { peran: 'tanggal' },
  'tgl transaksi': { peran: 'tanggal' },
  'tanggal transaksi': { peran: 'tanggal' },
  'tgl trans': { peran: 'tanggal' },
  'trans date': { peran: 'tanggal' },
  'transaction date': { peran: 'tanggal' },
  'posting date': { peran: 'tanggal' },
  'tanggal transaksi posting': { peran: 'tanggal' },
  'value date': { peran: 'tanggal' },
  'date': { peran: 'tanggal' },
  // uraian
  'uraian': { peran: 'uraian' },
  'uraian transaksi': { peran: 'uraian' },
  'keterangan': { peran: 'uraian' },
  'keterangan transaksi': { peran: 'uraian' },
  'deskripsi': { peran: 'uraian' },
  'description': { peran: 'uraian' },
  'berita': { peran: 'uraian' },
  'remark': { peran: 'uraian' },
  'remarks': { peran: 'uraian' },
  'transaction remarks': { peran: 'uraian' },
  'narrative': { peran: 'uraian' },
  // nominal TANPA arah — dua kolom ini hanya berarti "ada dua kolom nominal"
  'debet': { peran: 'nominal', petunjuk: null },
  'debit': { peran: 'nominal', petunjuk: null },
  'kredit': { peran: 'nominal', petunjuk: null },
  'credit': { peran: 'nominal', petunjuk: null },
  'db': { peran: 'nominal', petunjuk: null },
  'cr': { peran: 'nominal', petunjuk: null },
  'dr': { peran: 'nominal', petunjuk: null },
  'mutasi debet': { peran: 'nominal', petunjuk: null },
  'mutasi debit': { peran: 'nominal', petunjuk: null },
  'mutasi kredit': { peran: 'nominal', petunjuk: null },
  'mutasi credit': { peran: 'nominal', petunjuk: null },
  'mutasi': { peran: 'nominal', petunjuk: null },
  'nominal': { peran: 'nominal', petunjuk: null },
  'jumlah': { peran: 'nominal', petunjuk: null },
  'amount': { peran: 'nominal', petunjuk: null },
  'nilai': { peran: 'nominal', petunjuk: null },
  // nominal BERPETUNJUK — kata sudut pandang pemilik rekening
  'masuk': { peran: 'nominal', petunjuk: 'masuk' },
  'uang masuk': { peran: 'nominal', petunjuk: 'masuk' },
  'mutasi masuk': { peran: 'nominal', petunjuk: 'masuk' },
  'kredit masuk': { peran: 'nominal', petunjuk: 'masuk' },
  'penerimaan': { peran: 'nominal', petunjuk: 'masuk' },
  'pemasukan': { peran: 'nominal', petunjuk: 'masuk' },
  'setoran': { peran: 'nominal', petunjuk: 'masuk' },
  'deposit': { peran: 'nominal', petunjuk: 'masuk' },
  'cash in': { peran: 'nominal', petunjuk: 'masuk' },
  'money in': { peran: 'nominal', petunjuk: 'masuk' },
  'keluar': { peran: 'nominal', petunjuk: 'keluar' },
  'uang keluar': { peran: 'nominal', petunjuk: 'keluar' },
  'mutasi keluar': { peran: 'nominal', petunjuk: 'keluar' },
  'debet keluar': { peran: 'nominal', petunjuk: 'keluar' },
  'pengeluaran': { peran: 'nominal', petunjuk: 'keluar' },
  'penarikan': { peran: 'nominal', petunjuk: 'keluar' },
  'withdrawal': { peran: 'nominal', petunjuk: 'keluar' },
  'cash out': { peran: 'nominal', petunjuk: 'keluar' },
  'money out': { peran: 'nominal', petunjuk: 'keluar' },
  // kolom penanda DB/CR tersendiri
  'db cr': { peran: 'penanda' },
  'cr db': { peran: 'penanda' },
  'dr cr': { peran: 'penanda' },
  'd k': { peran: 'penanda' },
  'jenis mutasi': { peran: 'penanda' },
  'tipe mutasi': { peran: 'penanda' },
  // saldo
  'saldo': { peran: 'saldo' },
  'saldo akhir': { peran: 'saldo' },
  'saldo berjalan': { peran: 'saldo' },
  'balance': { peran: 'saldo' },
  'running balance': { peran: 'saldo' },
  'ending balance': { peran: 'saldo' },
  // akun lawan — kode ATAU nama
  'akun lawan': { peran: 'akunLawan' },
  'akun': { peran: 'akunLawan' },
  'kode akun': { peran: 'akunLawan' },
  'nama akun': { peran: 'akunLawan' },
  'kode akun lawan': { peran: 'akunLawan' },
  'coa': { peran: 'akunLawan' },
  'kode coa': { peran: 'akunLawan' },
  'account': { peran: 'akunLawan' },
  // catatan (Konfirmasi/Reff template akuntan)
  'catatan': { peran: 'catatan' },
  'konfirmasi': { peran: 'catatan' },
  'reff': { peran: 'catatan' },
  'ref': { peran: 'catatan' },
}

/** Peran satu judul kolom; `abaikan` bila tidak dikenali (No. Ref, Cabang, …). */
export function peranJudul(judul: string): PeranKolom {
  const a = JUDUL[normalizeHeader(judul)]
  if (!a) return { peran: 'abaikan', judul }
  return a.peran === 'nominal' ? { peran: 'nominal', judul, petunjuk: a.petunjuk ?? null } : { peran: a.peran, judul }
}

/**
 * Apakah satu baris adalah BARIS JUDUL kolom? Kalau ya, pemetaannya.
 *
 * Syaratnya sama dengan `detectHeader` N3: wajib memuat tanggal DAN setidaknya
 * satu kolom nominal — tanpa itu, baris kop "Periode: tanggal 1 s/d 30" akan
 * menang. Peran yang sama di dua kolom: yang pertama dipakai (nominal: dua
 * yang pertama); sisanya `abaikan`, jadi kolom tambahan tidak menggeser apa pun.
 */
export function kenaliJudul(sel: readonly string[]): PeranKolom[] | null {
  const dipakai = new Set<Peran>()
  let jumlahNominal = 0
  const out: PeranKolom[] = sel.map(teks => {
    const p = peranJudul(teks)
    if (p.peran === 'abaikan') return p
    if (p.peran === 'nominal') {
      if (jumlahNominal >= 2) return { peran: 'abaikan', judul: teks }
      jumlahNominal++
      return p
    }
    if (dipakai.has(p.peran)) return { peran: 'abaikan', judul: teks }
    dipakai.add(p.peran)
    return p
  })
  if (!dipakai.has('tanggal') || jumlahNominal === 0) return null
  return out
}

/** Pemetaan POSISIONAL dari kolom grid tempat tempelan dimulai. */
export function pemetaanPosisional(jangkarKolom: KolomGrid, jumlahKolom: number): PeranKolom[] {
  const mulai = KOLOM_GRID.indexOf(jangkarKolom)
  const out: PeranKolom[] = []
  for (let i = 0; i < jumlahKolom; i++) {
    const kolom = KOLOM_GRID[mulai + i]
    if (kolom === undefined) out.push({ peran: 'abaikan', judul: '' })
    else if (kolom === 'masuk' || kolom === 'keluar') {
      // Judul grid sendiri — tak ambigu, tapi tetap PETUNJUK (kotak Arah).
      out.push({ peran: 'nominal', judul: LABEL_KOLOM[kolom], petunjuk: kolom })
    } else out.push({ peran: kolom === 'uraian' ? 'uraian' : kolom, judul: LABEL_KOLOM[kolom] })
  }
  return out
}

// ── Teks: token, spasi, penanda DB/CR ────────────────────────

const isHuruf = (ch: string) => {
  const k = ch.codePointAt(0) ?? 0
  return (k >= 65 && k <= 90) || (k >= 97 && k <= 122)
}
const isAngka = (ch: string) => ch >= '0' && ch <= '9'
const isSpasi = (ch: string) => ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r' || ch === ' '

/** Spasi apa pun (termasuk baris baru di dalam sel berkutip) → SATU spasi. */
export function rapikanSpasi(teks: string): string {
  let out = ''
  let tertunda = false
  for (const ch of teks) {
    if (isSpasi(ch)) {
      if (out !== '') tertunda = true
      continue
    }
    if (tertunda) out += ' '
    tertunda = false
    out += ch
  }
  return out
}

/** Token huruf/angka utuh, huruf kecil. "TRSF E-BANKING CR 2510/X" → [trsf, e, banking, cr, 2510, x]. */
function token(teks: string): string[] {
  const out: string[] = []
  let buf = ''
  for (const ch of teks.toLowerCase()) {
    if (isHuruf(ch) || isAngka(ch)) buf += ch
    else if (buf !== '') {
      out.push(buf)
      buf = ''
    }
  }
  if (buf !== '') out.push(buf)
  return out
}

/**
 * Penanda DB/CR sebagai TOKEN UTUH: DB = uang keluar dari rekening, CR = uang
 * masuk. Keduanya muncul → tidak bisa diputuskan (null). Hanya PETUNJUK —
 * rantai saldo yang memutuskan (kotak Arah).
 */
export function penandaDbCr(teks: string): Arah | null {
  let db = false
  let cr = false
  for (const t of token(teks)) {
    if (t === 'db') db = true
    else if (t === 'cr') cr = true
  }
  if (db === cr) return null
  return db ? 'keluar' : 'masuk'
}

/** Isi kolom penanda tersendiri: DB/DR/D → keluar, CR/K → masuk. */
function bacaKolomPenanda(teks: string): Arah | null {
  const t = token(teks)
  if (t.length !== 1) return null
  if (t[0] === 'db' || t[0] === 'dr' || t[0] === 'd') return 'keluar'
  if (t[0] === 'cr' || t[0] === 'k' || t[0] === 'c') return 'masuk'
  return null
}

/**
 * Sel nominal rekening koran → teks angka bersih + penanda yang menempel.
 * "1,500,000.00 DB" → { teks: '1,500,000.00', penanda: 'keluar' }. Tanda
 * minus di depan atau di belakang dicatat terpisah (`negatif`) — untuk kolom
 * nominal TUNGGAL ia satu-satunya tanda arah; untuk dua kolom ia galat.
 */
export function pisahkanNominal(mentah: string): { teks: string; penanda: Arah | null; negatif: boolean } {
  let teks = rapikanSpasi(mentah)
  let penanda: Arah | null = null
  const atas = teks.toUpperCase()
  for (const [akhiran, arah] of [
    ['DB', 'keluar'],
    ['CR', 'masuk'],
  ] as const) {
    if (atas.endsWith(akhiran) && (atas.length === 2 || !isHuruf(atas[atas.length - 3]))) {
      penanda = arah
      teks = teks.slice(0, -2).trim()
      break
    }
    if (atas.startsWith(akhiran) && (atas.length === 2 || !isHuruf(atas[2]))) {
      penanda = arah
      teks = teks.slice(2).trim()
      break
    }
  }
  let negatif = false
  if (teks.startsWith('-')) {
    negatif = true
    teks = teks.slice(1).trim()
  } else if (teks.endsWith('-') && !teks.endsWith(',-') && !teks.endsWith('.-')) {
    negatif = true
    teks = teks.slice(0, -1).trim()
  } else if (teks.startsWith('(') && teks.endsWith(')')) {
    negatif = true
    teks = teks.slice(1, -1).trim()
  }
  return { teks, penanda, negatif }
}

// ── Pembaca nilai sel ────────────────────────────────────────

export type BacaUang =
  | { status: 'kosong' }
  | { status: 'ok'; minor: number }
  | { status: 'galat'; pesan: string }

/** Sel Masuk/Keluar → SEN (≥ 0). Aturan pemisah = `bacaNominal`, satu untuk seluruh sistem. */
export function bacaUangSel(teks: string): BacaUang {
  if (teks.trim() === '') return { status: 'kosong' }
  const galat = pesanGalatNominal(teks)
  if (galat !== null) return { status: 'galat', pesan: galat }
  const h = bacaNominal(teks)
  if (h.status !== 'ok') return { status: 'kosong' }
  return { status: 'ok', minor: toMinorUnits(h.nilai) ?? 0 }
}

/**
 * Sel Saldo → SEN, BOLEH NEGATIF (rekening bisa minus/cerukan). Bentuk negatif
 * yang diterima: "-1.000", "1.000-", "(1.000)".
 */
export function bacaSaldoSel(teks: string): BacaUang {
  if (teks.trim() === '') return { status: 'kosong' }
  const p = pisahkanNominal(teks)
  if (p.penanda !== null) {
    return { status: 'galat', pesan: 'Saldo tidak memakai penanda DB/CR — tulis minus bila saldonya negatif.' }
  }
  const h = bacaUangSel(p.teks)
  if (h.status === 'kosong') return { status: 'galat', pesan: 'Saldo tidak terbaca.' }
  if (h.status === 'galat') return h
  return { status: 'ok', minor: p.negatif ? -h.minor : h.minor }
}

/**
 * Nilai kanonik ("1500000.25", "-500.00") → teks sel format Indonesia
 * ("1.500.000,25", "-500"). Sen nol tidak ditulis. Kebalikan `bacaUangSel` /
 * `bacaSaldoSel`: teks yang dihasilkan selalu terbaca kembali ke nilai yang sama.
 */
export function nominalKeSel(kanonik: string | null): string {
  if (kanonik === null || kanonik === '') return ''
  const negatif = kanonik.startsWith('-')
  const [utuh, pecahan = '00'] = (negatif ? kanonik.slice(1) : kanonik).split('.')
  let ribuan = ''
  for (let i = 0; i < utuh.length; i++) {
    if (i > 0 && (utuh.length - i) % 3 === 0) ribuan += '.'
    ribuan += utuh[i]
  }
  const sen = pecahan.padEnd(2, '0').slice(0, 2)
  return `${negatif ? '-' : ''}${ribuan}${sen === '00' ? '' : `,${sen}`}`
}

// ── Tanggal ──────────────────────────────────────────────────

const pad2 = (n: number) => String(n).padStart(2, '0')

/** 'YYYY-MM-DD' → 'DD/MM/YYYY', bentuk baku sel tanggal grid. */
export function ymdKeSel(ymd: string): string {
  const [y, m, d] = ymd.split('-')
  return `${d}/${m}/${y}`
}

type BagianTanggal = { hari: number; bulan: number; tahun: number | null }

/**
 * Teks tanggal → bagian-bagiannya; `tahun: null` untuk tanggal TANPA TAHUN
 * ("26/10", "26 Okt"). Pembacaan bertahun memakai `parseTanggalCell` apa
 * adanya (DD/MM/YYYY, DD/Mon/YYYY, D-Mon-YYYY, YYYY-MM-DD, DD/MM/YY).
 * Tanpa tahun: dibaca dengan tahun kabisat bantu supaya 29/02 tidak ditolak
 * sebelum tahun sebenarnya diketahui.
 */
function bagianTanggal(teks: string): BagianTanggal | null {
  const bertahun = parseTanggalCell(teks)
  if (bertahun !== null) {
    const [y, m, d] = bertahun.split('-').map(Number)
    return { hari: d, bulan: m, tahun: y }
  }
  if (potonganTanggal(teks).length !== 2) return null
  const bantu = parseTanggalCell(`${teks} 2024`)
  if (bantu === null) return null
  const [, m, d] = bantu.split('-').map(Number)
  return { hari: d, bulan: m, tahun: null }
}

function keYmd(hari: number, bulan: number, tahun: number): string | null {
  const ymd = parseTanggalCell(`${tahun}-${pad2(bulan)}-${pad2(hari)}`)
  return ymd
}

const tahunDari = (ymd: string) => Number(ymd.slice(0, 4))
const bulanDari = (ymd: string) => Number(ymd.slice(5, 7))

/** Tahun untuk tanggal tanpa tahun yang BERDIRI SENDIRI: tahun periode yang memuat bulannya. */
function tahunMenurutPeriode(bulan: number, periode: Periode): number {
  const yMulai = tahunDari(periode.mulai)
  const yAkhir = tahunDari(periode.akhir)
  if (yMulai === yAkhir) return yMulai
  return bulan >= bulanDari(periode.mulai) ? yMulai : yAkhir
}

/**
 * Tanggal satu SEL → 'YYYY-MM-DD', atau null bila tak terbaca. Tanpa tahun →
 * tahun periode yang memuat bulannya (`tahunMenurutPeriode`).
 */
export function bacaTanggalSel(teks: string, periode: Periode): string | null {
  const b = bagianTanggal(teks.trim())
  if (b === null) return null
  if (b.tahun !== null) return keYmd(b.hari, b.bulan, b.tahun)
  return keYmd(b.hari, b.bulan, tahunMenurutPeriode(b.bulan, periode))
}

/**
 * Tahun untuk SEDERET tanggal satu blok — deterministik.
 *
 * Tanggal bertahun dipakai apa adanya dan menjadi tahun berjalan. Tanggal
 * tanpa tahun: yang pertama memakai tahun periode yang memuat bulannya; yang
 * berikutnya mewarisi tahun berjalan, NAIK satu tahun saat bulannya melompat
 * Des→Jan dan TURUN satu tahun saat Jan→Des (rekening koran yang terurut
 * terbaru-dulu). Hanya lompatan tepat 12↔1 yang dihitung — urutan bulan lain
 * yang mundur bukan pergantian tahun.
 *
 * Kembalian sejajar dengan masukan: null = tak terbaca.
 */
export function tetapkanTahun(tanggal: readonly string[], periode: Periode): (string | null)[] {
  let tahun: number | null = null
  let bulanSebelum: number | null = null
  return tanggal.map(teks => {
    const b = teks.trim() === '' ? null : bagianTanggal(teks.trim())
    if (b === null) return null
    if (b.tahun !== null) {
      tahun = b.tahun
      bulanSebelum = b.bulan
      return keYmd(b.hari, b.bulan, b.tahun)
    }
    if (tahun === null || bulanSebelum === null) tahun = tahunMenurutPeriode(b.bulan, periode)
    else if (bulanSebelum === 12 && b.bulan === 1) tahun++
    else if (bulanSebelum === 1 && b.bulan === 12) tahun--
    bulanSebelum = b.bulan
    return keYmd(b.hari, b.bulan, tahun)
  })
}

const dalamPeriode = (ymd: string, p: Periode) => ymd >= p.mulai && ymd <= p.akhir

/**
 * Apakah blok ini ditulis BULAN-DI-DEPAN (MM/DD)? Keputusan Ricko 2026-09-21
 * tetap: berkas MM/DD DITOLAK, tidak ditebak.
 *
 * Dua bukti, keduanya di tingkat BLOK:
 *   1. `deteksiTanggalMMDD` (N3): ada sel yang potongan keduanya > 12.
 *   2. PERIODE: seluruh tanggal numeriknya ≤ 12/12, jadi bentuknya sendiri
 *      tidak bisa memutuskan — tapi bacaan MM/DD-nya yang jatuh di periode
 *      lebih banyak daripada bacaan DD/MM. Seri → DD/MM (bawaan Indonesia).
 */
export function periksaUrutanTanggal(
  sel: readonly { nomor: number; teks: string }[],
  periode: Periode
): { ditolak: false } | { ditolak: true; pesan: string } {
  const mmdd = deteksiTanggalMMDD(sel.map(s => ({ nomor: s.nomor, nilai: s.teks })))
  if (mmdd.terdeteksi) {
    const contoh = mmdd.contoh.map(c => `baris ${c.nomor} "${c.nilai}"`).join(', ')
    return {
      ditolak: true,
      pesan: `Tanggal blok ini ditulis bulan-di-depan (MM/DD), mis. ${contoh}. Ubah ke DD/MM/YYYY lalu tempel lagi.`,
    }
  }

  let ddmmDalam = 0
  let mmddDalam = 0
  for (const s of sel) {
    const p = potonganTanggal(s.teks)
    if (p.length < 2) continue
    const [a, b, c] = p
    const angka = (x: string) => x !== undefined && x.length > 0 && [...x].every(isAngka)
    if (!angka(a) || !angka(b) || a.length > 2 || b.length > 2) continue
    const x = Number(a)
    const y = Number(b)
    if (x < 1 || x > 12 || y < 1 || y > 12 || x === y) continue
    const tahun =
      c === undefined
        ? null
        : angka(c)
          ? c.length === 2
            ? Number(c) + (Number(c) < 70 ? 2000 : 1900)
            : Number(c)
          : null
    if (c !== undefined && tahun === null) continue
    const ddmm = keYmd(x, y, tahun ?? tahunMenurutPeriode(y, periode))
    const mmddYmd = keYmd(y, x, tahun ?? tahunMenurutPeriode(x, periode))
    if (ddmm && dalamPeriode(ddmm, periode)) ddmmDalam++
    if (mmddYmd && dalamPeriode(mmddYmd, periode)) mmddDalam++
  }
  if (mmddDalam > ddmmDalam) {
    return {
      ditolak: true,
      pesan:
        'Tanggal blok ini tampaknya ditulis bulan-di-depan (MM/DD): dibaca DD/MM sebagian besar jatuh di luar periode, ' +
        'dibaca MM/DD jatuh di dalamnya. Ubah ke DD/MM/YYYY lalu tempel lagi.',
    }
  }
  return { ditolak: false }
}

// ── Akun lawan: kode ATAU nama persis ────────────────────────

export type AkunCoa = { id: string; kode: string; nama: string }

export type IndeksAkun = {
  kode: Map<string, string>
  nama: Map<string, string[]>
  byId: Map<string, AkunCoa>
}

const kunciAkun = (s: string) => s.trim().toLowerCase()

/** Dibangun SEKALI per Master COA — 10.000 baris tidak boleh memindai COA 10.000 kali. */
export function indeksAkun(coa: readonly AkunCoa[]): IndeksAkun {
  const kode = new Map<string, string>()
  const nama = new Map<string, string[]>()
  const byId = new Map<string, AkunCoa>()
  for (const a of coa) {
    byId.set(a.id, a)
    kode.set(kunciAkun(a.kode), a.id)
    const k = kunciAkun(a.nama)
    nama.set(k, [...(nama.get(k) ?? []), a.id])
  }
  return { kode, nama, byId }
}

export type CocokAkun =
  | { status: 'kosong' }
  | { status: 'ok'; akunId: string }
  | { status: 'galat'; pesan: string }

/**
 * Sel akun lawan → akun Master COA. **Kode persis dulu, lalu nama persis**
 * (trim, abaikan huruf besar/kecil). Nama yang dipakai lebih dari satu akun
 * TIDAK ditebak — galat yang meminta kodenya.
 */
export function cocokkanAkun(teks: string, indeks: IndeksAkun): CocokAkun {
  const k = kunciAkun(teks)
  if (k === '') return { status: 'kosong' }
  const lewatKode = indeks.kode.get(k)
  if (lewatKode !== undefined) return { status: 'ok', akunId: lewatKode }
  // Label grid "kode · nama" (S9) — sah HANYA bila namanya persis nama akun
  // berkode itu, supaya sel yang disalin dari grid bisa ditempel kembali tanpa
  // membuka pintu tebakan.
  const pisah = k.indexOf(' · ')
  if (pisah > 0) {
    const id = indeks.kode.get(k.slice(0, pisah).trim())
    const a = id === undefined ? undefined : indeks.byId.get(id)
    if (a && kunciAkun(a.nama) === k.slice(pisah + 3).trim()) return { status: 'ok', akunId: a.id }
  }
  const lewatNama = indeks.nama.get(k) ?? []
  if (lewatNama.length === 1) return { status: 'ok', akunId: lewatNama[0] }
  if (lewatNama.length > 1) {
    return { status: 'galat', pesan: `Nama akun "${teks.trim()}" dipakai ${lewatNama.length} akun — tulis kodenya.` }
  }
  return { status: 'galat', pesan: `Akun "${teks.trim()}" tidak ada di Master COA klien ini (kode atau nama persis).` }
}

// ── Kelas baris ──────────────────────────────────────────────

export type KelasBaris = 'transaksi' | 'kosong' | 'judul' | 'saldo' | 'ringkasan' | 'lanjutan'
export type KelasDilewati = Exclude<KelasBaris, 'transaksi'>

/** Satu baris mentah yang sudah dipetakan ke peran kolomnya. */
export type BarisTerpetakan = {
  tanggal: string
  uraian: string
  /** Teks tiap kolom nominal, urut kiri-ke-kanan (0–2). */
  nominal: string[]
  penanda: string
  saldo: string
  akunLawan: string
  catatan: string
  /** Seluruh sel apa adanya — untuk deteksi judul berulang & daftar dilewati. */
  semua: string[]
}

// Kata kunci baris RINGKASAN — dicocokkan pada teks ternormalisasi
// (`normalizeHeader`), per kata utuh, TANPA RegExp.
const KATA_RINGKASAN = ['total', 'subtotal', 'jumlah', 'grand total', 'mutasi debet', 'mutasi debit', 'mutasi kredit', 'mutasi credit', 'rata rata']
const KATA_SALDO = ['saldo', 'balance']

function memuatKata(teksNormal: string, kata: string): boolean {
  if (teksNormal === kata) return true
  return (
    teksNormal.startsWith(`${kata} `) ||
    teksNormal.endsWith(` ${kata}`) ||
    teksNormal.includes(` ${kata} `)
  )
}

function nominalAda(teks: string): boolean {
  const p = pisahkanNominal(teks)
  if (p.teks === '') return false
  const h = bacaUangSel(p.teks)
  // Teks yang bukan angka tetap dianggap "ada" — lebih baik ia masuk grid
  // sebagai galat yang terlihat daripada membuat barisnya dilewati.
  return h.status !== 'ok' || h.minor !== 0
}

/**
 * Kelas satu baris. Urutannya penting: kosong → judul → saldo → ringkasan →
 * lanjutan → transaksi. Semua kata kunci lewat huruf kecil + kata utuh, tanpa
 * RegExp.
 *
 * - `judul`: judul kolom yang tercetak ULANG (tiap halaman PDF, tiap halaman
 *   ekspor internet banking) — dikenali seperti baris judul pertama, atau
 *   ≥ 2 selnya sama dengan judul yang sudah diketahui.
 * - `saldo`: SALDO AWAL/AKHIR — tanpa nominal, bersaldo, DAN menyebut
 *   saldo/balance. Kata kuncinya wajib: baris bertanggal yang nominalnya
 *   hilang (salah baca) harus tampil merah, bukan dilewati sebagai saldo.
 * - `ringkasan`: TOTAL/SUBTOTAL/MUTASI DEBET-KREDIT TANPA tanggal.
 * - `lanjutan`: teks saja (tanpa tanggal, nominal, saldo). **Hanya untuk
 *   tempelan & berkas** — baris PDF sudah tidak memuat lanjutan (uraian
 *   terlipat digabung Stream B, kontrak `BarisMentah`), jadi baris PDF teks-saja
 *   adalah anomali dan masuk grid sebagai transaksi yang galat.
 */
export function kelasBaris(
  b: BarisTerpetakan,
  opsi: { sumber: SumberBlok; judulDikenal: ReadonlySet<string> }
): { kelas: KelasBaris; alasan: string } {
  if (b.semua.every(s => s.trim() === '')) return { kelas: 'kosong', alasan: 'Baris kosong.' }

  const adaTanggal = b.tanggal.trim() !== '' && bagianTanggal(b.tanggal.trim()) !== null
  if (!adaTanggal) {
    if (kenaliJudul(b.semua) !== null) return { kelas: 'judul', alasan: 'Judul kolom yang tercetak ulang.' }
    let sama = 0
    for (const s of b.semua) {
      const n = normalizeHeader(s)
      if (n !== '' && opsi.judulDikenal.has(n)) sama++
    }
    if (sama >= 2) return { kelas: 'judul', alasan: 'Judul kolom yang tercetak ulang.' }
  }

  const adaNominal = b.nominal.some(nominalAda)
  const adaSaldo = b.saldo.trim() !== ''
  const teksNormal = b.semua.map(normalizeHeader).filter(s => s !== '')

  if (!adaNominal && adaSaldo && teksNormal.some(t => KATA_SALDO.some(k => memuatKata(t, k)))) {
    return { kelas: 'saldo', alasan: `Baris saldo (${rapikanSpasi(b.uraian) || 'SALDO'}) — dipakai sebagai jangkar rantai saldo.` }
  }

  if (!adaTanggal && teksNormal.some(t => KATA_RINGKASAN.some(k => memuatKata(t, k)))) {
    return { kelas: 'ringkasan', alasan: 'Baris ringkasan (total/subtotal) tanpa tanggal.' }
  }

  if (
    opsi.sumber !== 'pdf' &&
    b.tanggal.trim() === '' &&
    !adaNominal &&
    !adaSaldo &&
    (b.uraian.trim() !== '' || b.catatan.trim() !== '')
  ) {
    return { kelas: 'lanjutan', alasan: 'Lanjutan uraian baris sebelumnya.' }
  }

  return { kelas: 'transaksi', alasan: '' }
}

// ── bacaBlok ─────────────────────────────────────────────────

/** Satu baris TRANSAKSI hasil baca, siap jadi baris draf. */
export type BarisBaca = {
  /** Nomor baris di sumbernya (baris tempelan / baris berkas), mulai 1. */
  nomor: number
  /** Halaman PDF (kolom "Hal."), null untuk tempelan/berkas. */
  halaman: number | null
  /** Teks sel, nominal dalam orientasi SEMENTARA (`pertamaKe`). */
  sel: SelDraf
  /** Penanda DB/CR baris ini (kolom penanda, sel nominal, atau uraian). PETUNJUK. */
  penanda: Arah | null
}

export type BarisDilewati = {
  nomor: number
  halaman: number | null
  kelas: KelasDilewati
  alasan: string
  /** Sel mentah digabung — supaya panel "baris dilewati" menampilkan apa adanya. */
  teks: string
}

/** Saldo dari baris kelas `saldo`: jangkar (sebelum transaksi pertama) atau titik periksa. */
export type TitikSaldo = {
  /** Jumlah baris transaksi SEBELUM titik ini. 0 = jangkar awal blok. */
  setelah: number
  saldo: string
  nomor: number
  halaman: number | null
}

export type HasilBacaBlok =
  | { ok: false; pesan: string }
  | {
      ok: true
      pemetaan: PeranKolom[]
      /** true = pemetaan dari baris judul; false = posisional atau eksplisit. */
      dariJudul: boolean
      baris: BarisBaca[]
      dilewati: BarisDilewati[]
      titikSaldo: TitikSaldo[]
      /** Judul kolom nominal apa adanya, kiri-ke-kanan — untuk pemilih arah. */
      judulNominal: string[]
      /** Ke mana kolom nominal PERTAMA ditaruh sementara. */
      pertamaKe: Arah
      /** Satu kolom nominal: arah per baris dari penandanya. */
      satuKolom: boolean
    }

export type OpsiBacaBlok = {
  baris: readonly (readonly string[])[]
  sumber: SumberBlok
  periode: Periode
  /** Kolom grid tempat tempelan dimulai — dipakai bila tidak ada baris judul. */
  jangkarKolom?: KolomGrid
  /** Pemetaan eksplisit (pemetaan manual wizard CSV, adaptor PDF) — melewati deteksi judul. */
  pemetaan?: readonly PeranKolom[]
  /** Nomor sumber tiap baris (nomor baris berkas). Bawaan: indeks + 1. */
  nomor?: readonly number[]
  /** Halaman PDF tiap baris. */
  halaman?: readonly (number | null)[]
  /** Judul tambahan yang dikenal (kolom tercetak tiap halaman PDF). */
  judulTambahan?: readonly string[]
}

const BATAS_PINDAI_JUDUL = 20
const lawan = (a: Arah): Arah => (a === 'masuk' ? 'keluar' : 'masuk')

/**
 * Teks bertabel → baris draf. Lihat kepala berkas untuk prinsipnya.
 *
 * Langkah: (1) pemetaan — eksplisit, atau baris judul di 20 baris pertama
 * (baris di atasnya = kop, dilewati), atau posisional dari `jangkarKolom`;
 * (2) kelas tiap baris; lanjutan digabung ke uraian transaksi sebelumnya
 * dengan satu spasi (aturan yang sama dengan Stream B untuk PDF); (3) urutan
 * tanggal blok (MM/DD → ditolak) dan tahunnya; (4) nominal ke Masuk/Keluar
 * dalam orientasi sementara.
 */
export function bacaBlok(opsi: OpsiBacaBlok): HasilBacaBlok {
  const { baris, sumber, periode } = opsi
  const nomorDari = (i: number) => opsi.nomor?.[i] ?? i + 1
  const halamanDari = (i: number) => opsi.halaman?.[i] ?? null
  const gabung = (sel: readonly string[]) => sel.map(rapikanSpasi).filter(s => s !== '').join(' · ')

  const dilewati: BarisDilewati[] = []
  let pemetaan: PeranKolom[]
  let dariJudul = false
  let mulai = 0

  if (opsi.pemetaan) {
    pemetaan = [...opsi.pemetaan]
  } else {
    let terbaik: { idx: number; pemetaan: PeranKolom[]; skor: number } | null = null
    for (let i = 0; i < Math.min(baris.length, BATAS_PINDAI_JUDUL); i++) {
      const p = kenaliJudul(baris[i])
      if (p === null) continue
      const skor = p.filter(k => k.peran !== 'abaikan').length
      if (!terbaik || skor > terbaik.skor) terbaik = { idx: i, pemetaan: p, skor }
    }
    if (terbaik) {
      pemetaan = terbaik.pemetaan
      dariJudul = true
      for (let i = 0; i < terbaik.idx; i++) {
        if (baris[i].every(s => s.trim() === '')) continue
        dilewati.push({ nomor: nomorDari(i), halaman: halamanDari(i), kelas: 'judul', alasan: 'Kop di atas baris judul kolom.', teks: gabung(baris[i]) })
      }
      dilewati.push({ nomor: nomorDari(terbaik.idx), halaman: halamanDari(terbaik.idx), kelas: 'judul', alasan: 'Baris judul kolom.', teks: gabung(baris[terbaik.idx]) })
      mulai = terbaik.idx + 1
    } else {
      const lebar = baris.reduce((m, r) => Math.max(m, r.length), 0)
      pemetaan = pemetaanPosisional(opsi.jangkarKolom ?? 'tanggal', lebar)
    }
  }

  const indeksPeran = (peran: Peran) => pemetaan.findIndex(p => p.peran === peran)
  const iTanggal = indeksPeran('tanggal')
  const iUraian = indeksPeran('uraian')
  const iPenanda = indeksPeran('penanda')
  const iSaldo = indeksPeran('saldo')
  const iAkun = indeksPeran('akunLawan')
  const iCatatan = indeksPeran('catatan')
  const iNominal = pemetaan.flatMap((p, i) => (p.peran === 'nominal' ? [i] : [])).slice(0, 2)
  const satuKolom = iNominal.length === 1
  const judulNominal = iNominal.map(i => pemetaan[i].judul)
  const petunjuk0 = iNominal.length > 0 ? (pemetaan[iNominal[0]].petunjuk ?? null) : null
  const petunjuk1 = iNominal.length > 1 ? (pemetaan[iNominal[1]].petunjuk ?? null) : null
  const pertamaKe: Arah = petunjuk0 ?? (petunjuk1 !== null ? lawan(petunjuk1) : 'masuk')

  const judulDikenal = new Set<string>()
  for (const p of pemetaan) {
    const n = normalizeHeader(p.judul)
    if (n !== '') judulDikenal.add(n)
  }
  for (const j of opsi.judulTambahan ?? []) {
    const n = normalizeHeader(j)
    if (n !== '') judulDikenal.add(n)
  }

  const ambil = (r: readonly string[], i: number) => (i < 0 ? '' : (r[i] ?? ''))

  type Calon = { nomor: number; halaman: number | null; b: BarisTerpetakan }
  const calon: Calon[] = []
  const titikSaldo: TitikSaldo[] = []

  for (let i = mulai; i < baris.length; i++) {
    const r = baris[i]
    const b: BarisTerpetakan = {
      tanggal: rapikanSpasi(ambil(r, iTanggal)),
      uraian: rapikanSpasi(ambil(r, iUraian)),
      nominal: iNominal.map(k => ambil(r, k)),
      penanda: ambil(r, iPenanda),
      saldo: rapikanSpasi(ambil(r, iSaldo)),
      akunLawan: rapikanSpasi(ambil(r, iAkun)),
      catatan: rapikanSpasi(ambil(r, iCatatan)),
      semua: [...r],
    }
    const { kelas, alasan } = kelasBaris(b, { sumber, judulDikenal })
    if (kelas === 'transaksi') {
      calon.push({ nomor: nomorDari(i), halaman: halamanDari(i), b })
      continue
    }
    if (kelas === 'saldo') {
      titikSaldo.push({ setelah: calon.length, saldo: b.saldo, nomor: nomorDari(i), halaman: halamanDari(i) })
    }
    if (kelas === 'lanjutan') {
      const sebelum = calon[calon.length - 1]
      if (sebelum) {
        sebelum.b.uraian = rapikanSpasi(`${sebelum.b.uraian} ${b.uraian}`)
        if (b.catatan !== '') sebelum.b.catatan = rapikanSpasi(`${sebelum.b.catatan} ${b.catatan}`)
        dilewati.push({ nomor: nomorDari(i), halaman: halamanDari(i), kelas, alasan: `Digabung ke uraian baris ${sebelum.nomor}.`, teks: gabung(r) })
        continue
      }
      dilewati.push({ nomor: nomorDari(i), halaman: halamanDari(i), kelas, alasan: 'Teks tanpa transaksi sebelumnya.', teks: gabung(r) })
      continue
    }
    if (kelas !== 'kosong') {
      dilewati.push({ nomor: nomorDari(i), halaman: halamanDari(i), kelas, alasan, teks: gabung(r) })
    }
  }

  // Urutan tanggal ditentukan per BLOK, sebelum satu baris pun jadi draf.
  const urutan = periksaUrutanTanggal(
    calon.map(c => ({ nomor: c.nomor, teks: c.b.tanggal })),
    periode
  )
  if (urutan.ditolak) return { ok: false, pesan: urutan.pesan }
  const ymd = tetapkanTahun(
    calon.map(c => c.b.tanggal),
    periode
  )

  const hasil: BarisBaca[] = calon.map((c, idx) => {
    const sel = selKosong()
    sel.tanggal = ymd[idx] !== null ? ymdKeSel(ymd[idx] as string) : c.b.tanggal
    sel.uraian = c.b.uraian
    sel.saldo = c.b.saldo
    sel.akunLawan = c.b.akunLawan
    sel.catatan = c.b.catatan

    const dariKolom = bacaKolomPenanda(c.b.penanda)
    let penanda: Arah | null = dariKolom

    if (satuKolom) {
      const p = pisahkanNominal(c.b.nominal[0])
      penanda = penanda ?? p.penanda ?? penandaDbCr(c.b.uraian) ?? (p.negatif ? 'keluar' : null)
      const arah = penanda ?? pertamaKe
      sel[arah] = p.teks
    } else {
      for (let k = 0; k < c.b.nominal.length; k++) {
        const p = pisahkanNominal(c.b.nominal[k])
        penanda = penanda ?? p.penanda
        // Minus di kolom nominal ganda dibiarkan TERLIHAT — `bacaNominal`
        // menolaknya dengan pesan di selnya; arah datang dari kolomnya.
        const teks = p.negatif ? `-${p.teks}` : p.teks
        if (teks === '') continue
        const arah = k === 0 ? pertamaKe : lawan(pertamaKe)
        sel[arah] = teks
      }
      penanda = penanda ?? penandaDbCr(c.b.uraian)
    }
    return { nomor: c.nomor, halaman: c.halaman, sel, penanda }
  })

  return { ok: true, pemetaan, dariJudul, baris: hasil, dilewati, titikSaldo, judulNominal, pertamaKe, satuKolom }
}

/**
 * Teks tempelan (TSV) → baris sel bernomor. `parseCsv` dengan pemisah TAB —
 * kutip, kutip ganda, dan baris baru DI DALAM sel (Excel: Alt+Enter) ikut
 * tertangani; baris yang seluruh selnya kosong dibuang di sana.
 */
export function belahTempelan(teks: string): { baris: string[][]; nomor: number[] } {
  const { rows } = parseCsv(teks, '\t')
  return { baris: rows.map(r => r.cells), nomor: rows.map(r => r.nomor) }
}

// ── Adaptor PDF: HalamanMentah (kontrak Stream B) → bacaBlok ─

/**
 * `HalamanMentah[]` dari X4/X5 → masukan `bacaBlok`, TANPA interpretasi:
 * semua sel tetap teks. Kolomnya tetap: Tanggal · Uraian · nominal pertama ·
 * nominal kedua · penanda · Saldo · Catatan. Kolom `lain` yang judulnya alias
 * catatan (Reff/Ref/Konfirmasi/Catatan) jadi catatan; sisanya diabaikan.
 *
 * Judul kolom yang tercetak ulang dan baris SALDO AWAL tiap halaman tetap
 * dikirim sebagai baris biasa (kontrak) — `kelasBaris` yang melewatkannya;
 * kolom tercetak tiap halaman ikut sebagai judul yang dikenal.
 */
export function dariHalamanMentah(halaman: readonly HalamanMentah[]): Pick<
  OpsiBacaBlok,
  'baris' | 'pemetaan' | 'halaman' | 'judulTambahan'
> {
  const semua: BarisMentah[] = halaman.flatMap(h => h.baris)
  const contoh = semua.find(b => b.nominal.bentuk === 'dua-kolom') ?? semua[0]
  let judul1 = ''
  let judul2 = ''
  if (contoh?.nominal.bentuk === 'dua-kolom') {
    judul1 = contoh.nominal.pertama.judul
    judul2 = contoh.nominal.kedua.judul
  } else if (contoh?.nominal.bentuk === 'satu-kolom') {
    judul1 = contoh.nominal.judul
  }
  const peranNominal = (judul: string): PeranKolom => {
    const p = peranJudul(judul)
    return { peran: 'nominal', judul, petunjuk: p.peran === 'nominal' ? (p.petunjuk ?? null) : null }
  }
  const pemetaan: PeranKolom[] = [
    { peran: 'tanggal', judul: 'Tanggal' },
    { peran: 'uraian', judul: 'Uraian' },
    peranNominal(judul1),
    ...(judul2 !== '' || contoh?.nominal.bentuk === 'dua-kolom' ? [peranNominal(judul2)] : [{ peran: 'abaikan' as const, judul: '' }]),
    { peran: 'penanda', judul: '' },
    { peran: 'saldo', judul: 'Saldo' },
    { peran: 'catatan', judul: 'Catatan' },
  ]
  const baris = semua.map(b => {
    const n = b.nominal
    const catatan = b.lain.find(l => peranJudul(l.judul).peran === 'catatan')?.teks ?? ''
    return n.bentuk === 'dua-kolom'
      ? [b.tanggal, b.uraian, n.pertama.teks, n.kedua.teks, '', b.saldo, catatan]
      : [b.tanggal, b.uraian, n.teks, '', n.penanda, b.saldo, catatan]
  })
  return {
    baris,
    pemetaan,
    halaman: semua.map(b => b.halaman),
    judulTambahan: halaman.flatMap(h => h.kolom),
  }
}

// ── Validasi satu baris draf ─────────────────────────────────

export type KonteksValidasi = {
  periode: Periode
  akunKasId: string
  akun: IndeksAkun
}

/** Nilai satu baris yang lolos — bentuk yang dikirim ke route batch (D36: debit = masuk). */
export type NilaiDraf = {
  tanggal: string
  debit: string
  kredit: string
  saldo: string | null
  keterangan: string | null
  catatan: string | null
  akunLawanId: string | null
}

export type HasilValidasi = {
  /** Galat PER SEL — yang ditampilkan merah di sel itu. */
  galat: Partial<Record<KolomGrid, string>>
  /** Galat tingkat baris dari hakim terakhir (`validateCashMutation`). */
  galatBaris: string[]
  nilai: NilaiDraf | null
}

/**
 * Validasi satu baris draf: galat PER SEL lebih dulu (tanggal, uang lewat
 * `bacaNominal`, "Masuk ATAU Keluar", saldo, akun lawan, panjang teks), lalu
 * `validateCashMutation` sebagai HAKIM TERAKHIR — aturan yang sama dengan
 * server, jadi baris yang hijau di grid tidak ditolak route batch karena aturan
 * yang berbeda.
 */
export function validasiBaris(sel: SelDraf, k: KonteksValidasi): HasilValidasi {
  const galat: Partial<Record<KolomGrid, string>> = {}

  // Tanggal (D60): kosong = wajib diisi; di luar periode = galat.
  let tanggal: string | null = null
  if (sel.tanggal.trim() === '') {
    galat.tanggal = 'Tanggal wajib diisi — atau pakai "Isi tanggal akhir periode".'
  } else {
    tanggal = bacaTanggalSel(sel.tanggal, k.periode)
    if (tanggal === null) galat.tanggal = 'Tanggal tidak terbaca. Pakai DD/MM/YYYY, mis. 05/04/2026.'
    else if (!dalamPeriode(tanggal, k.periode)) {
      galat.tanggal = `Tanggal di luar periode ${fmtTanggal(k.periode.mulai)} – ${fmtTanggal(k.periode.akhir)}. Perlebar periodenya bila memang benar.`
    }
  }

  const masuk = bacaUangSel(sel.masuk)
  const keluar = bacaUangSel(sel.keluar)
  if (masuk.status === 'galat') galat.masuk = masuk.pesan
  if (keluar.status === 'galat') galat.keluar = keluar.pesan
  const masukMinor = masuk.status === 'ok' ? masuk.minor : 0
  const keluarMinor = keluar.status === 'ok' ? keluar.minor : 0
  if (masuk.status !== 'galat' && keluar.status !== 'galat') {
    if (masukMinor === 0 && keluarMinor === 0) {
      galat.masuk = 'Isi Masuk atau Keluar.'
      galat.keluar = 'Isi Masuk atau Keluar.'
    } else if (masukMinor > 0 && keluarMinor > 0) {
      galat.masuk = 'Hanya satu yang boleh terisi: Masuk atau Keluar.'
      galat.keluar = 'Hanya satu yang boleh terisi: Masuk atau Keluar.'
    }
  }

  const saldo = bacaSaldoSel(sel.saldo)
  if (saldo.status === 'galat') galat.saldo = saldo.pesan

  let akunLawanId: string | null = null
  const akun = cocokkanAkun(sel.akunLawan, k.akun)
  if (akun.status === 'galat') galat.akunLawan = akun.pesan
  else if (akun.status === 'ok') {
    if (akun.akunId === k.akunKasId) galat.akunLawan = 'Akun lawan tidak boleh akun kas ini sendiri.'
    else akunLawanId = akun.akunId
  }

  const uraian = sel.uraian.trim()
  if (uraian.length > KETERANGAN_MAX) galat.uraian = `Uraian maksimal ${KETERANGAN_MAX} karakter.`
  const catatan = sel.catatan.trim()
  if (catatan.length > CATATAN_MAX) galat.catatan = `Catatan maksimal ${CATATAN_MAX} karakter.`

  if (Object.keys(galat).length > 0) return { galat, galatBaris: [], nilai: null }

  const hakim = validateCashMutation({
    tanggal,
    akunKasId: k.akunKasId,
    debit: fromMinorUnits(masukMinor),
    kredit: fromMinorUnits(keluarMinor),
    keterangan: uraian,
    saldo: saldo.status === 'ok' ? fromMinorUnits(saldo.minor) : null,
    akunLawanId,
    catatan,
  })
  if (!hakim.ok) return { galat, galatBaris: hakim.errors, nilai: null }
  const v = hakim.value
  return {
    galat,
    galatBaris: [],
    nilai: {
      tanggal: v.tanggal,
      debit: v.debit,
      kredit: v.kredit,
      saldo: v.saldo,
      keterangan: v.keterangan,
      catatan: v.catatan,
      akunLawanId: v.akunLawanId,
    },
  }
}
