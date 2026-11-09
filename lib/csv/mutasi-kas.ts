// Pembaca CSV rekening koran. MURNI (tanpa I/O, tanpa React).
//
// ══ MVP: CSV SAJA, PDF MENYUSUL ══════════════════════════════════════════
// Aturan proyek: CSV/Excel lebih dulu karena akurasinya tidak ditebak. PDF
// rekening koran butuh OCR + deteksi tabel, dan hasilnya harus ditinjau
// baris-demi-baris — itu modul tersendiri, bukan cabang di sini.
//
// ══ TANPA RegExp SAMA SEKALI (D22) ═══════════════════════════════════════
// Seluruh berkas ini bekerja per karakter. Isi CSV adalah input pengguna:
// nama kolom, keterangan transaksi, dan angka semuanya datang dari berkas yang
// diunggah, dan pola yang disusun dari teks semacam itu adalah jalan masuk
// ReDoS. Larangan ini juga membuat perilakunya bisa dibaca tanpa menjalankan
// mesin regex di kepala.
//
// ══ PEMETAAN KOLOM MANUAL ADALAH JALUR NORMAL, BUKAN DARURAT ═════════════
// Tiap bank menulis header berbeda, dan sebagian tidak menulis header sama
// sekali. Deteksi alias di bawah adalah TEBAKAN AWAL yang mengisi formulir
// pemetaan — bukan syarat supaya berkasnya bisa diimpor. Importer yang hanya
// jalan kalau headernya dikenali akan gagal pada bank berikutnya.

import { pemisahDesimal, type Pemisah as PemisahAngka } from '@/lib/nominal'

export type MutasiField = 'tanggal' | 'keterangan' | 'debit' | 'kredit' | 'saldo'

export const MUTASI_FIELDS: readonly MutasiField[] = [
  'tanggal',
  'keterangan',
  'debit',
  'kredit',
  'saldo',
]

export const MUTASI_FIELD_LABEL: Record<MutasiField, string> = {
  tanggal: 'Tanggal',
  keterangan: 'Keterangan',
  debit: 'Debit (uang masuk)',
  kredit: 'Kredit (uang keluar)',
  saldo: 'Saldo berjalan',
}

/** Field yang tanpa isinya satu baris tidak bisa jadi mutasi. */
export const FIELD_WAJIB: readonly MutasiField[] = ['tanggal']

/** Pemetaan field → INDEKS kolom di berkas. Kolom yang tidak dipakai: absen. */
export type ColumnMapping = Partial<Record<MutasiField, number>>

// ── 1. Pembelah CSV ──────────────────────────────────────────

const KANDIDAT_PEMISAH = [',', ';', '\t', '|'] as const
export type Pemisah = (typeof KANDIDAT_PEMISAH)[number]

/**
 * Menebak pemisah kolom dengan MENGHITUNG kemunculannya DI LUAR tanda kutip.
 *
 * Bank Indonesia lazim memakai `;` justru karena angkanya memakai koma desimal
 * — menebak `,` pada berkas semacam itu memecah setiap nominal jadi dua kolom,
 * dan hasilnya terbaca "berhasil" dengan angka yang salah.
 */
export function detectDelimiter(teks: string): Pemisah {
  const hitung: Record<string, number> = { ',': 0, ';': 0, '\t': 0, '|': 0 }
  let dalamKutip = false

  for (let i = 0; i < teks.length; i++) {
    const ch = teks[i]
    if (ch === '"') {
      // "" di dalam kutip = kutip literal, bukan penutup.
      if (dalamKutip && teks[i + 1] === '"') i++
      else dalamKutip = !dalamKutip
      continue
    }
    if (dalamKutip) continue
    if (ch in hitung) hitung[ch]++
  }

  let terbaik: Pemisah = ','
  for (const c of KANDIDAT_PEMISAH) if (hitung[c] > hitung[terbaik]) terbaik = c
  return terbaik
}

export type RawRow = {
  /** Nomor baris DI BERKAS, mulai 1 — bukan indeks array. Yang dibuka akunting
   *  saat membetulkan berkasnya adalah nomor ini. */
  nomor: number
  cells: string[]
}

export type CsvParseResult = {
  pemisah: Pemisah
  rows: RawRow[]
}

/**
 * Membelah CSV jadi baris bernomor. Mesin keadaan per karakter: menangani
 * tanda kutip, kutip ganda di dalam kutip, newline di dalam sel, dan CRLF.
 *
 * Baris yang SELURUH selnya kosong dibuang — berkas rekening koran sering
 * berakhir dengan baris kosong, dan baris kosong yang lolos akan muncul sebagai
 * "baris bermasalah" yang tidak pernah bisa dibetulkan siapa pun.
 */
export function parseCsv(teks: string, pemisahPilihan?: Pemisah): CsvParseResult {
  // Pemisah boleh DITENTUKAN pemanggil. Deteksinya tebakan — pada berkas satu
  // kolom nominal dengan koma desimal, jumlah `,` dan `;` bisa sama persis dan
  // tidak ada cara memutuskannya dari teksnya saja. Wizard impor menampilkan
  // pemisah yang dipakai dan membolehkan akunting menggantinya.
  const pemisah = pemisahPilihan ?? detectDelimiter(teks)
  const rows: RawRow[] = []

  let cells: string[] = []
  let buf = ''
  let dalamKutip = false
  let nomor = 1

  const tutupSel = () => {
    cells.push(buf.trim())
    buf = ''
  }
  const tutupBaris = () => {
    tutupSel()
    if (cells.some(c => c !== '')) rows.push({ nomor, cells })
    cells = []
    nomor++
  }

  for (let i = 0; i < teks.length; i++) {
    const ch = teks[i]

    if (dalamKutip) {
      if (ch === '"') {
        if (teks[i + 1] === '"') {
          buf += '"'
          i++
        } else dalamKutip = false
      } else buf += ch
      continue
    }

    if (ch === '"') dalamKutip = true
    else if (ch === pemisah) tutupSel()
    else if (ch === '\n') tutupBaris()
    else if (ch === '\r') {
      // CRLF: \n berikutnya yang menutup barisnya. CR sendirian (Mac klasik)
      // tetap menutup baris.
      if (teks[i + 1] !== '\n') tutupBaris()
    } else buf += ch
  }

  // Baris terakhir tanpa newline penutup.
  if (buf !== '' || cells.length > 0) tutupBaris()

  return { pemisah, rows }
}

// ── 2. Deteksi header ────────────────────────────────────────

const ALIAS: Record<string, MutasiField> = {
  // tanggal
  'tanggal': 'tanggal',
  'tgl': 'tanggal',
  'tgl transaksi': 'tanggal',
  'tanggal transaksi': 'tanggal',
  'tanggal transaksi posting': 'tanggal',
  'posting date': 'tanggal',
  'transaction date': 'tanggal',
  'date': 'tanggal',
  'value date': 'tanggal',
  // keterangan
  'keterangan': 'keterangan',
  'uraian': 'keterangan',
  'berita': 'keterangan',
  'deskripsi': 'keterangan',
  'catatan': 'keterangan',
  'description': 'keterangan',
  'remark': 'keterangan',
  'remarks': 'keterangan',
  'narrative': 'keterangan',
  'transaction remarks': 'keterangan',
  // ══ KOLOM NOMINAL: KATA BANK TERBALIK DARI KATA KITA ═══════════════════
  // Rekening koran ditulis dari pembukuan BANK, dan di sana simpanan nasabah
  // adalah kewajiban: setoran DIKREDIT, penarikan DIDEBET. Di pembukuan kita
  // akun kas adalah aset, jadi uang masuk = DEBIT (D36).
  //
  // Artinya kolom berjudul "Kredit" di rekening koran memetakan ke field
  // `debit` kita, dan sebaliknya. Ini bukan salah ketik di tabel bawah — ini
  // seluruh jebakannya, dan ia menyalahkan ARAH SETIAP BARIS kalau dibiarkan
  // dipetakan apa adanya. Kata yang TIDAK memakai istilah akuntansi
  // ("masuk"/"keluar") tidak ikut terbalik, karena ia memang sudut pandang
  // pemilik rekening.
  //
  // Tebakan ini tetap bisa ditimpa lewat pemetaan kolom manual, dan pratinjau
  // impor menampilkan "masuk/keluar" dengan kata, bukan "debit/kredit".

  // → field `debit` kita = uang MASUK
  'kredit': 'debit',
  'credit': 'debit',
  'cr': 'debit',
  'kredit masuk': 'debit',
  'mutasi kredit': 'debit',
  'masuk': 'debit',
  'uang masuk': 'debit',
  'mutasi masuk': 'debit',
  'penerimaan': 'debit',
  'setoran': 'debit',
  'deposit': 'debit',
  // → field `kredit` kita = uang KELUAR
  'debit': 'kredit',
  'debet': 'kredit',
  'dr': 'kredit',
  'debet keluar': 'kredit',
  'mutasi debet': 'kredit',
  'keluar': 'kredit',
  'uang keluar': 'kredit',
  'mutasi keluar': 'kredit',
  'pengeluaran': 'kredit',
  'penarikan': 'kredit',
  'withdrawal': 'kredit',
  // saldo
  'saldo': 'saldo',
  'saldo akhir': 'saldo',
  'balance': 'saldo',
  'running balance': 'saldo',
  'ending balance': 'saldo',
}

/**
 * Normalisasi teks header: huruf kecil, tanda baca jadi spasi, spasi
 * dirapatkan. Per karakter, tanpa regex (D22) — nama kolom datang dari berkas.
 */
export function normalizeHeader(raw: unknown): string {
  const teks = typeof raw === 'string' ? raw : String(raw ?? '')
  const out: string[] = []
  let spasiTertunda = false

  for (const ch of teks.toLowerCase()) {
    const kode = ch.codePointAt(0) ?? 0
    const huruf = (kode >= 97 && kode <= 122) || (kode > 127 && ch.toLowerCase() !== ch.toUpperCase())
    const angka = kode >= 48 && kode <= 57
    if (huruf || angka) {
      if (spasiTertunda && out.length > 0) out.push(' ')
      spasiTertunda = false
      out.push(ch)
    } else if (out.length > 0) spasiTertunda = true
  }
  return out.join('')
}

export type HeaderDetection = {
  /** Indeks baris header di `rows` (bukan nomor berkas), atau null bila tidak
   *  ada baris yang dikenali sama sekali. */
  headerRowIndex: number | null
  mapping: ColumnMapping
  /** Field wajib yang belum terpetakan — layar pemetaan manual memakainya. */
  hilang: MutasiField[]
}

/**
 * Menebak baris header dan pemetaan kolomnya.
 *
 * Memindai 20 baris pertama karena rekening koran sering diawali kop: nama
 * bank, nomor rekening, periode, baris kosong. Baris dengan kecocokan
 * TERBANYAK yang menang — bukan yang pertama cocok, karena kop sering memuat
 * kata "Tanggal" pada baris "Periode: Tanggal 1 s/d 30".
 *
 * Kembalian `headerRowIndex: null` BUKAN kegagalan: ia berarti pemetaan manual
 * dibutuhkan, dan itu jalur yang memang didukung.
 */
export function detectHeader(rows: readonly RawRow[]): HeaderDetection {
  const batas = Math.min(rows.length, 20)
  let terbaik: { idx: number; mapping: ColumnMapping; skor: number } | null = null

  for (let i = 0; i < batas; i++) {
    const mapping: ColumnMapping = {}
    rows[i].cells.forEach((cell, kolom) => {
      const field = ALIAS[normalizeHeader(cell)]
      if (field && mapping[field] === undefined) mapping[field] = kolom
    })
    const skor = Object.keys(mapping).length
    if (skor === 0) continue
    // Wajib memuat tanggal DAN setidaknya satu kolom nominal — tanpa itu, baris
    // kop yang kebetulan memuat kata "tanggal" akan menang.
    const punyaNominal = mapping.debit !== undefined || mapping.kredit !== undefined
    if (mapping.tanggal === undefined || !punyaNominal) continue
    if (!terbaik || skor > terbaik.skor) terbaik = { idx: i, mapping, skor }
  }

  if (!terbaik) return { headerRowIndex: null, mapping: {}, hilang: [...FIELD_WAJIB] }

  return {
    headerRowIndex: terbaik.idx,
    mapping: terbaik.mapping,
    hilang: FIELD_WAJIB.filter(f => terbaik!.mapping[f] === undefined),
  }
}

// ── 3. Pembaca sel ───────────────────────────────────────────

/**
 * Nominal dari sel rekening koran → string 2 desimal, atau null.
 *
 * ══ DUA KONVENSI ANGKA, DAN KELIRU MEMILIH ITU MAHAL ════════════════════
 * "1.234.567,89" (Indonesia) dan "1,234,567.89" (Inggris) memakai karakter yang
 * sama dengan arti terbalik. Klasifikasi pemisahnya DIBAGI dengan form & server
 * lewat `pemisahDesimal` (lib/nominal.ts), supaya satu teks tidak pernah berarti
 * dua angka di dua pintu:
 *   - Kalau titik DAN koma muncul: yang MUNCUL TERAKHIR adalah desimal.
 *   - Kalau hanya satu jenis yang muncul SEKALI dan diikuti 0–2 digit: ia
 *     desimal ("1234,56", "1234,5").
 *   - Selain itu ia pemisah ribuan dan dibuang ("1.000", "1.234.567").
 *
 * "1.000" karena itu dibaca SERIBU, bukan satu koma nol: pemisah ribuan selalu
 * diikuti tepat 3 digit. Sampai 2026-09-24 aturan kedua berbunyi "tepat 2
 * digit", sehingga "1234,5" terbaca 12.345 — sepuluh kali lipat, tanpa galat.
 *
 * Tanda kurung dan tanda minus di depan sama-sama berarti negatif; pemanggil
 * yang memutuskan apakah negatif itu sah (saldo boleh, nominal tidak).
 */
export function parseNominalCell(raw: unknown): string | null {
  const teks = typeof raw === 'string' ? raw : String(raw ?? '')
  let negatif = false
  const angka: string[] = []
  let titik = -1
  let koma = -1
  let jumlahTitik = 0
  let jumlahKoma = 0
  let terakhir: PemisahAngka | null = null

  for (const ch of teks) {
    if (ch === '(' || ch === '-') {
      negatif = true
      continue
    }
    if (ch === ')') continue
    const kode = ch.codePointAt(0) ?? 0
    if (kode >= 48 && kode <= 57) {
      angka.push(ch)
      continue
    }
    if (ch === '.') {
      titik = angka.length
      jumlahTitik++
      terakhir = '.'
      continue
    }
    if (ch === ',') {
      koma = angka.length
      jumlahKoma++
      terakhir = ','
      continue
    }
    // Huruf (Rp, IDR, DB/CR), spasi, dan sisanya diabaikan. Penanda DB/CR
    // TIDAK diterjemahkan di sini: arah uang datang dari KOLOM mana sel ini
    // berada, dan menebaknya dari huruf di dalam sel akan bertabrakan dengan
    // pemetaan kolom yang sudah dipilih akunting.
  }

  if (angka.length === 0) return null

  // Posisi pemisah desimal, dihitung sebagai "berapa digit sesudahnya".
  const desimal = pemisahDesimal({
    jumlahDigit: angka.length,
    titik: { jumlah: jumlahTitik, posisiTerakhir: titik },
    koma: { jumlah: jumlahKoma, posisiTerakhir: koma },
    terakhir,
  })
  let digitDesimal = 0
  if (desimal === '.') digitDesimal = angka.length - titik
  else if (desimal === ',') digitDesimal = angka.length - koma

  // Lebih dari 2 digit desimal dibulatkan ke bawah ke 2 — rekening koran
  // sesekali menulis 4 desimal untuk kurs. Memotong, bukan membulatkan:
  // membulatkan ke atas menciptakan uang yang tidak ada di rekening.
  let digits = angka.join('')
  if (digitDesimal > 2) {
    digits = digits.slice(0, digits.length - (digitDesimal - 2))
    digitDesimal = 2
  }

  const utuh = digitDesimal === 0 ? digits : digits.slice(0, digits.length - digitDesimal) || '0'
  const pecahan = (digitDesimal === 0 ? '' : digits.slice(digits.length - digitDesimal)).padEnd(2, '0')

  // Nol di depan dibuang tanpa mengubah nilainya — dengan loop, bukan regex:
  // berkas ini menyatakan dirinya bebas RegExp, dan satu pengecualian kecil
  // adalah awal dari klaim yang tidak lagi benar.
  let mulai = 0
  while (mulai < utuh.length - 1 && utuh[mulai] === '0') mulai++
  const bersih = utuh.slice(mulai) || '0'

  const nilai = `${bersih}.${pecahan}`
  return negatif && nilai !== '0.00' ? `-${nilai}` : nilai
}

const BULAN_ID: Record<string, number> = {
  jan: 1, januari: 1, january: 1,
  feb: 2, februari: 2, february: 2, peb: 2,
  mar: 3, maret: 3, march: 3,
  apr: 4, april: 4,
  mei: 5, may: 5,
  jun: 6, juni: 6, june: 6,
  jul: 7, juli: 7, july: 7,
  agu: 8, agustus: 8, aug: 8, august: 8, agt: 8,
  sep: 9, september: 9, sept: 9,
  okt: 10, oktober: 10, oct: 10, october: 10,
  nov: 11, november: 11,
  des: 12, desember: 12, dec: 12, december: 12,
}

function hariDalamBulan(tahun: number, bulan: number): number {
  const panjang = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  if (bulan === 2 && (tahun % 4 === 0 && (tahun % 100 !== 0 || tahun % 400 === 0))) return 29
  return panjang[bulan - 1] ?? 0
}

/**
 * Tanggal dari sel → 'YYYY-MM-DD', atau null.
 *
 * ══ TANPA `new Date` (P2) ════════════════════════════════════════════════
 * Seluruhnya aritmetika atas potongan STRING. `new Date('01/02/2026')` ditebak
 * mesin JS sebagai 2 Januari atau 1 Februari tergantung format — dan
 * tebakannya bergeser satu hari lagi oleh zona waktu. Untuk mutasi kas, tanggal
 * yang meleset sehari memindahkan transaksi ke periode lain.
 *
 * Bentuk yang diterima: `YYYY-MM-DD`, `DD/MM/YYYY`, `DD-MM-YYYY`, `DD.MM.YYYY`,
 * `DD MMM YYYY` (nama bulan Indonesia/Inggris), dan `DD/MM/YY`.
 *
 * `MM/DD/YYYY` TIDAK didukung dengan sengaja: ia tidak bisa dibedakan dari
 * `DD/MM/YYYY` untuk tanggal 1–12, jadi mendukungnya berarti menebak — dan
 * separuh tebakannya salah tanpa ada yang tahu.
 */
/** Pecah teks jadi potongan angka/huruf, per karakter. Tanpa regex (D22).
 *  Diekspor untuk pembaca draf grid (lib/mutasi-draf.ts) — satu pemotong
 *  tanggal untuk CSV dan grid. */
export function potonganTanggal(raw: unknown): string[] {
  const teks = (typeof raw === 'string' ? raw : String(raw ?? '')).trim()
  if (teks === '') return []
  const out: string[] = []
  let buf = ''
  let jenis: 'angka' | 'huruf' | null = null
  for (const ch of teks) {
    const kode = ch.codePointAt(0) ?? 0
    const angka = kode >= 48 && kode <= 57
    const huruf = (kode >= 65 && kode <= 90) || (kode >= 97 && kode <= 122)
    const jenisIni = angka ? 'angka' : huruf ? 'huruf' : null
    if (jenisIni === null) {
      if (buf !== '') out.push(buf)
      buf = ''
      jenis = null
      continue
    }
    if (jenis !== null && jenisIni !== jenis) {
      out.push(buf)
      buf = ''
    }
    jenis = jenisIni
    buf += ch
  }
  if (buf !== '') out.push(buf)
  return out
}

const semuaAngka = (s: string) => s.length > 0 && [...s].every(ch => ch >= '0' && ch <= '9')

export function parseTanggalCell(raw: unknown): string | null {
  const potongan = potonganTanggal(raw)
  if (potongan.length < 3) return null

  const [a, b, c] = potongan
  let tahun: number
  let bulan: number
  let hari: number

  const isAngka = semuaAngka

  if (isAngka(a) && a.length === 4) {
    // YYYY-MM-DD
    tahun = Number(a)
    bulan = isAngka(b) ? Number(b) : (BULAN_ID[b.toLowerCase()] ?? 0)
    hari = Number(c)
  } else {
    hari = Number(a)
    bulan = isAngka(b) ? Number(b) : (BULAN_ID[b.toLowerCase()] ?? 0)
    tahun = Number(c)
    // Dua digit tahun: 00–69 → 2000-an, 70–99 → 1900-an. Batas yang sama
    // dipakai POSIX, dan rekening koran tidak pernah dari tahun 1970-an.
    if (c.length === 2) tahun += tahun < 70 ? 2000 : 1900
  }

  if (!Number.isInteger(tahun) || !Number.isInteger(bulan) || !Number.isInteger(hari)) return null
  if (tahun < 1900 || tahun > 2999) return null
  if (bulan < 1 || bulan > 12) return null
  if (hari < 1 || hari > hariDalamBulan(tahun, bulan)) return null

  return `${tahun}-${String(bulan).padStart(2, '0')}-${String(hari).padStart(2, '0')}`
}

// ── 3b. Deteksi format tanggal Amerika (MM/DD/YYYY) ─────────

export type DeteksiMMDD = {
  terdeteksi: boolean
  /** Sampai tiga contoh sel yang membuktikannya — dipakai di pesan penolakan. */
  contoh: { nomor: number; nilai: string }[]
}

/**
 * Apakah kolom tanggal berkas ini ditulis **MM/DD/YYYY**?
 *
 * ══ KENAPA DIPERIKSA DI TINGKAT BERKAS, BUKAN PER SEL ═══════════════════
 * Satu sel `01/02/2026` mustahil dibedakan: ia 1 Februari (Indonesia) atau
 * 2 Januari (Amerika), dan keduanya tanggal yang sah. Yang bisa memutuskan
 * hanya SELURUH kolomnya — begitu ada satu sel yang potongan KEDUA-nya lebih
 * dari 12, urutannya pasti bulan-di-depan, karena tidak ada bulan ke-13.
 *
 * Tanpa pemeriksaan ini, berkas MM/DD/YYYY masuk SEPARUH: baris bertanggal 1–12
 * terbaca dengan hari dan bulan TERTUKAR, dan baris bertanggal 13+ ditolak satu
 * per satu sebagai "tanggal tidak terbaca". Akunting melihat beberapa baris
 * gagal, membetulkannya, dan tidak pernah tahu sisanya masuk ke bulan yang
 * salah. Itu kegagalan paling mahal yang bisa dihasilkan modul ini: transaksi
 * pindah periode tanpa satu pun galat.
 *
 * `false` BUKAN jaminan formatnya DD/MM — berkas yang seluruh tanggalnya 1–12
 * memang tidak bisa diputuskan. Ia berarti "tidak ada bukti bahwa ia terbalik",
 * dan sisanya urusan peringatan di layar pratinjau.
 */
export function deteksiTanggalMMDD(
  sel: readonly { nomor: number; nilai: unknown }[]
): DeteksiMMDD {
  const contoh: { nomor: number; nilai: string }[] = []

  for (const s of sel) {
    const p = potonganTanggal(s.nilai)
    if (p.length < 3) continue
    const [a, b] = p
    // YYYY-… tidak ambigu, dan nama bulan juga tidak.
    if (semuaAngka(a) && a.length === 4) continue
    if (!semuaAngka(a) || !semuaAngka(b)) continue
    const pertama = Number(a)
    const kedua = Number(b)
    // Potongan kedua > 12 hanya mungkin bila ia HARI — berarti bulan di depan.
    // Potongan pertama juga harus masuk akal sebagai bulan; kalau ia > 12,
    // urutannya justru DD/MM dan tidak ada yang perlu dipersoalkan.
    if (pertama >= 1 && pertama <= 12 && kedua > 12 && kedua <= 31) {
      if (contoh.length < 3) contoh.push({ nomor: s.nomor, nilai: String(s.nilai ?? '') })
    }
  }

  return { terdeteksi: contoh.length > 0, contoh }
}

// ── 4. Pemetaan baris ────────────────────────────────────────

export type MappedRow = {
  nomor: number
  tanggal: string
  keterangan: string | null
  /** String 2 desimal; tepat satu dari keduanya bukan '0.00'. */
  debit: string
  kredit: string
  saldo: string | null
}

export type ProblemRow = {
  nomor: number
  /** Sel mentah, supaya layar pratinjau bisa menunjukkan barisnya apa adanya. */
  cells: string[]
  alasan: string
}

export type MapResult = {
  rows: MappedRow[]
  bermasalah: ProblemRow[]
}

/**
 * Menerapkan pemetaan kolom ke baris mentah.
 *
 * ══ BARIS BERMASALAH DIKEMBALIKAN, BUKAN DIBUANG ════════════════════════
 * Berkas rekening koran selalu memuat baris yang bukan transaksi: kop, subtotal
 * per halaman, baris "SALDO AWAL", catatan kaki. Membuangnya diam-diam berarti
 * jumlah baris yang diimpor tidak pernah bisa dicocokkan dengan berkasnya —
 * dan satu transaksi yang hilang karena tanggalnya salah format akan terlihat
 * sama persis dengan baris kop yang memang tidak perlu diimpor.
 *
 * `mulaiDariIndex` melewati baris header dan segala yang di atasnya.
 */
export function mapRows({
  rows,
  mapping,
  mulaiDariIndex = 0,
}: {
  rows: readonly RawRow[]
  mapping: ColumnMapping
  mulaiDariIndex?: number
}): MapResult {
  const out: MappedRow[] = []
  const bermasalah: ProblemRow[] = []

  const ambil = (cells: string[], field: MutasiField): string => {
    const idx = mapping[field]
    if (idx === undefined) return ''
    return cells[idx] ?? ''
  }

  for (let i = mulaiDariIndex; i < rows.length; i++) {
    const { nomor, cells } = rows[i]

    const tanggal = parseTanggalCell(ambil(cells, 'tanggal'))
    if (tanggal === null) {
      bermasalah.push({ nomor, cells, alasan: 'Tanggal tidak terbaca.' })
      continue
    }

    const debit = parseNominalCell(ambil(cells, 'debit'))
    const kredit = parseNominalCell(ambil(cells, 'kredit'))
    const debitAda = debit !== null && debit !== '0.00'
    const kreditAda = kredit !== null && kredit !== '0.00'

    if (!debitAda && !kreditAda) {
      bermasalah.push({ nomor, cells, alasan: 'Tidak ada nominal di kolom debit maupun kredit.' })
      continue
    }
    if (debitAda && kreditAda) {
      bermasalah.push({
        nomor,
        cells,
        alasan: 'Debit dan kredit terisi bersamaan — periksa pemetaan kolomnya.',
      })
      continue
    }
    // Nominal negatif pada kolom debit/kredit hampir selalu berarti kolomnya
    // tertukar, bukan uang bertanda minus. Ditolak dengan menyebut sebabnya.
    const terpakai = debitAda ? debit! : kredit!
    if (terpakai.startsWith('-')) {
      bermasalah.push({
        nomor,
        cells,
        alasan: 'Nominal negatif — arah uang ditentukan kolomnya, bukan tandanya.',
      })
      continue
    }

    const keteranganMentah = ambil(cells, 'keterangan').trim()

    out.push({
      nomor,
      tanggal,
      keterangan: keteranganMentah === '' ? null : keteranganMentah,
      debit: debitAda ? debit! : '0.00',
      kredit: kreditAda ? kredit! : '0.00',
      saldo: parseNominalCell(ambil(cells, 'saldo')),
    })
  }

  return { rows: out, bermasalah }
}
