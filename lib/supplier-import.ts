import * as XLSX from 'xlsx'
import {
  BANK_ATAS_NAMA_MAX,
  BANK_NAMA_MAX,
  BANK_REKENING_MAX,
  NAMA_MAX,
  NAMA_MIN,
  namaSupplierKey,
  normalizeNamaSupplier,
} from '@/lib/supplier'

// Parser impor Master Supplier. Pola persis lib/coa-import.ts: alias header,
// deteksi baris header lintas-sheet, dan kontrak "kalau `errors` tidak kosong,
// JANGAN tulis ke DB".
//
// ══ KOLOM AKUN BERISI KODE, BUKAN ID ══════════════════════════════════════
// Parser ini TIDAK menyentuh database, jadi ia tidak bisa (dan tidak boleh)
// menerjemahkan kode akun ke id. Route yang melakukannya, dan kode yang tidak
// dikenal jadi WARNING — bukan error: supplier-nya tetap layak diimpor tanpa
// akun default, dan menggagalkan seluruh file karena satu kode salah ketik
// memaksa orang mengulang dari awal.
//
// ══ NOMOR REKENING TETAP TEKS ═════════════════════════════════════════════
// Sel dibaca apa adanya sebagai string, tidak pernah lewat Number(): "0123"
// harus tetap "0123". Berkas hasil ekspor kita menulis semua sel sebagai
// string, jadi round-trip aman. Yang tidak bisa diselamatkan parser mana pun
// adalah sel yang di Excel sudah berupa ANGKA — nolnya hilang sebelum berkas
// sampai ke sini.

export interface ParsedSupplierRow {
  nama: string
  kontak: string | null
  npwp: string | null
  bankNama: string | null
  bankRekening: string | null
  bankAtasNama: string | null
  /** KODE akun hutang dari file. Route yang me-resolve ke id. */
  akunHutangKode: string | null
}

export interface SupplierParseResult {
  rows: ParsedSupplierRow[]
  errors: string[]
  /** Non-blocking: baris dilewati, nilai terlalu panjang, nama dobel di file, kolom termin lama. */
  warnings?: string[]
}

type Field = 'nama' | 'kontak' | 'npwp' | 'bankNama' | 'bankRekening' | 'bankAtasNama' | 'akun'

const REQUIRED_FIELDS: Field[] = ['nama']

const HEADER_ALIASES: Record<string, Field> = {
  'nama': 'nama',
  'nama supplier': 'nama',
  'supplier': 'nama',
  'vendor': 'nama',
  'nama vendor': 'nama',
  'supplier name': 'nama',
  'kontak': 'kontak',
  'pic': 'kontak',
  'kontak pic': 'kontak',
  'narahubung': 'kontak',
  'telepon': 'kontak',
  'contact': 'kontak',
  'npwp': 'npwp',
  'no npwp': 'npwp',
  'nomor npwp': 'npwp',
  'tax id': 'npwp',
  'bank': 'bankNama',
  'nama bank': 'bankNama',
  'bank name': 'bankNama',
  'rekening': 'bankRekening',
  'no rekening': 'bankRekening',
  'nomor rekening': 'bankRekening',
  'no rek': 'bankRekening',
  'norek': 'bankRekening',
  'rekening bank': 'bankRekening',
  'account number': 'bankRekening',
  'atas nama': 'bankAtasNama',
  'atas nama rekening': 'bankAtasNama',
  'nama rekening': 'bankAtasNama',
  'pemilik rekening': 'bankAtasNama',
  'account name': 'bankAtasNama',
  'akun hutang': 'akun',
  'kode akun hutang': 'akun',
  'akun hutang default': 'akun',
  'kode akun': 'akun',
}

/**
 * Header termin dari berkas LAMA (sebelum 0019). Tidak dipetakan ke apa pun —
 * termin kini diisi per invoice (D43) — tapi kehadirannya diberi peringatan
 * sekali, supaya orang yang mengimpor cadangan lama tahu kolom itu diabaikan
 * dan tidak mengira nilainya ikut tersimpan.
 */
const HEADER_TERMIN_LAMA = new Set(['termin', 'termin pembayaran', 'termin hari', 'tempo', 'payment term'])

const SUPPLIER_SHEET_NAME_RE = /supplier|vendor/i

function normalizeHeader(raw: unknown): string {
  return String(raw ?? '')
    .toLowerCase()
    .replace(/[._\-/]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function cellToString(value: unknown): string {
  if (value === null || value === undefined) return ''
  return String(value).trim()
}

const kosongJadiNull = (v: string): string | null => (v === '' ? null : v)

type HeaderTerdeteksi = {
  headerRowIdx: number
  colIndex: Partial<Record<Field, number>>
  requiredMatched: number
  /** Baris header memuat kolom termin dari berkas lama (lihat HEADER_TERMIN_LAMA). */
  adaTerminLama: boolean
}

function detectHeader(matrix: unknown[][]): HeaderTerdeteksi | null {
  const scanLimit = Math.min(matrix.length, 20)
  let best: HeaderTerdeteksi | null = null
  for (let i = 0; i < scanLimit; i++) {
    const colIndex: Partial<Record<Field, number>> = {}
    let adaTerminLama = false
    ;(matrix[i] ?? []).forEach((cell, idx) => {
      // normalizeHeader membuang tanda baca, jadi header berkurung seperti
      // "Termin (Hari)" perlu dicocokkan dua kali: apa adanya dan tanpa kurung.
      const key = normalizeHeader(cell)
      const tanpaKurung = key.replace(/[()]/g, '').replace(/\s+/g, ' ').trim()
      const field = HEADER_ALIASES[key] ?? HEADER_ALIASES[tanpaKurung]
      if (field && colIndex[field] === undefined) colIndex[field] = idx
      if (HEADER_TERMIN_LAMA.has(key) || HEADER_TERMIN_LAMA.has(tanpaKurung)) adaTerminLama = true
    })
    const requiredMatched = REQUIRED_FIELDS.filter(f => colIndex[f] !== undefined).length
    if (requiredMatched === 0) continue
    if (!best || requiredMatched > best.requiredMatched) best = { headerRowIdx: i, colIndex, requiredMatched, adaTerminLama }
  }
  return best
}

/**
 * Parse workbook Master Supplier menjadi baris tervalidasi.
 * Kontrak: kalau `errors` tidak kosong, JANGAN tulis ke DB — kembalikan 400.
 */
export function parseSupplierWorkbook(data: ArrayBuffer): SupplierParseResult {
  let wb: XLSX.WorkBook
  try {
    wb = XLSX.read(new Uint8Array(data), { type: 'array' })
  } catch {
    return { rows: [], errors: ['File tidak bisa dibaca sebagai Excel yang valid.'] }
  }

  if (wb.SheetNames.length === 0) {
    return { rows: [], errors: ['File tidak punya sheet apa pun.'] }
  }

  // Sheet bernama "…Supplier…" menang telak; kalau tidak ada, pakai sheet
  // pertama yang headernya terdeteksi.
  const urutan = [
    ...wb.SheetNames.filter(n => SUPPLIER_SHEET_NAME_RE.test(n)),
    ...wb.SheetNames.filter(n => !SUPPLIER_SHEET_NAME_RE.test(n)),
  ]

  let pilihan: { matrix: unknown[][]; header: NonNullable<ReturnType<typeof detectHeader>> } | null = null
  for (const name of urutan) {
    const sheet = wb.Sheets[name]
    if (!sheet) continue
    const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      blankrows: false,
      defval: '',
    })
    const header = detectHeader(matrix)
    if (header) {
      pilihan = { matrix, header }
      break
    }
  }

  if (!pilihan) {
    return {
      rows: [],
      errors: [
        'Kolom "Nama Supplier" tidak ditemukan. Pastikan ada baris header dengan kolom nama supplier.',
      ],
    }
  }

  const { matrix, header } = pilihan
  const { headerRowIdx, colIndex } = header
  const rows: ParsedSupplierRow[] = []
  const errors: string[] = []
  const warnings: string[] = []
  const namaTerpakai = new Map<string, number>()

  if (header.adaTerminLama) {
    warnings.push(
      'Kolom termin diabaikan — termin kini diisi per invoice pembelian, bukan per supplier.'
    )
  }

  const ambil = (baris: unknown[], f: Field): string =>
    colIndex[f] === undefined ? '' : cellToString(baris[colIndex[f]!])

  for (let i = headerRowIdx + 1; i < matrix.length; i++) {
    const baris = matrix[i] ?? []
    const nomorBaris = i + 1 // 1-based, seperti terlihat di Excel

    // Dinormalkan lebih dulu: spasi ganda dirapikan, ujung di-trim. Nilai yang
    // ditulis ke DB harus sama bentuknya dengan yang ditulis formulir.
    const nama = normalizeNamaSupplier(ambil(baris, 'nama'))
    if (nama === '') continue // baris kosong / pemisah — dilewati diam-diam

    if (nama.length < NAMA_MIN) {
      errors.push(`Baris ${nomorBaris}: nama supplier minimal ${NAMA_MIN} karakter.`)
      continue
    }
    if (nama.length > NAMA_MAX) {
      errors.push(`Baris ${nomorBaris}: nama supplier maksimal ${NAMA_MAX} karakter.`)
      continue
    }

    // Nama dobel DI DALAM FILE: yang belakangan dilewati, bukan menimpa yang
    // depan. Impor memakai upsert by nama, jadi dua baris bernama sama di satu
    // file berarti file itu sendiri tidak bisa menentukan nilai mana yang benar.
    // Kunci pencocokan yang SAMA dengan yang dipakai route saat upsert.
    // Kalau keduanya berbeda, baris yang lolos parser sebagai satu supplier
    // bisa membentur indeks unik di DB.
    const kunci = namaSupplierKey(nama)
    const sebelumnya = namaTerpakai.get(kunci)
    if (sebelumnya !== undefined) {
      warnings.push(
        `Baris ${nomorBaris}: nama "${nama}" sudah ada di baris ${sebelumnya} — baris ini dilewati.`
      )
      continue
    }
    namaTerpakai.set(kunci, nomorBaris)

    // Nilai yang melebihi batas formulir dikosongkan dengan peringatan, bukan
    // menggagalkan berkas — pola yang sama dengan kode akun tak dikenal. Pada
    // supplier yang sudah ada, "kosong" berarti nilai lamanya dipertahankan.
    const teksBerbatas = (f: Field, label: string, maks: number): string | null => {
      const v = ambil(baris, f)
      if (v.length > maks) {
        warnings.push(`Baris ${nomorBaris}: ${label} lebih dari ${maks} karakter — dikosongkan.`)
        return null
      }
      return kosongJadiNull(v)
    }

    rows.push({
      nama,
      kontak: kosongJadiNull(ambil(baris, 'kontak')),
      npwp: kosongJadiNull(ambil(baris, 'npwp')),
      bankNama: teksBerbatas('bankNama', 'nama bank', BANK_NAMA_MAX),
      bankRekening: teksBerbatas('bankRekening', 'nomor rekening', BANK_REKENING_MAX),
      bankAtasNama: teksBerbatas('bankAtasNama', 'nama pemilik rekening', BANK_ATAS_NAMA_MAX),
      akunHutangKode: kosongJadiNull(ambil(baris, 'akun')),
    })
  }

  if (errors.length === 0 && rows.length === 0) {
    errors.push('Tidak ada baris supplier yang bisa dibaca dari file ini.')
  }

  return { rows, errors, warnings: warnings.length > 0 ? warnings : undefined }
}
