import * as XLSX from 'xlsx'
import {
  NAMA_MAX,
  NAMA_MIN,
  TERMIN_MAX,
  TERMIN_MIN,
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

export interface ParsedSupplierRow {
  nama: string
  kontak: string | null
  npwp: string | null
  terminPembayaran: number | null
  /** KODE akun hutang dari file. Route yang me-resolve ke id. */
  akunHutangKode: string | null
}

export interface SupplierParseResult {
  rows: ParsedSupplierRow[]
  errors: string[]
  /** Non-blocking: baris dilewati, termin tak terbaca, nama dobel di file. */
  warnings?: string[]
}

type Field = 'nama' | 'kontak' | 'npwp' | 'termin' | 'akun'

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
  'termin': 'termin',
  'termin pembayaran': 'termin',
  'termin hari': 'termin',
  'termin (hari)': 'termin',
  'tempo': 'termin',
  'payment term': 'termin',
  'akun hutang': 'akun',
  'kode akun hutang': 'akun',
  'akun hutang default': 'akun',
  'kode akun': 'akun',
}

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

function detectHeader(
  matrix: unknown[][]
): { headerRowIdx: number; colIndex: Partial<Record<Field, number>>; requiredMatched: number } | null {
  const scanLimit = Math.min(matrix.length, 20)
  let best: { headerRowIdx: number; colIndex: Partial<Record<Field, number>>; requiredMatched: number } | null = null
  for (let i = 0; i < scanLimit; i++) {
    const colIndex: Partial<Record<Field, number>> = {}
    ;(matrix[i] ?? []).forEach((cell, idx) => {
      // normalizeHeader membuang tanda baca, jadi "Termin (Hari)" perlu
      // dicocokkan dua kali: apa adanya dan versi tanpa kurung.
      const key = normalizeHeader(cell)
      const field = HEADER_ALIASES[key] ?? HEADER_ALIASES[key.replace(/[()]/g, '').replace(/\s+/g, ' ').trim()]
      if (field && colIndex[field] === undefined) colIndex[field] = idx
    })
    const requiredMatched = REQUIRED_FIELDS.filter(f => colIndex[f] !== undefined).length
    if (requiredMatched === 0) continue
    if (!best || requiredMatched > best.requiredMatched) best = { headerRowIdx: i, colIndex, requiredMatched }
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

    let terminPembayaran: number | null = null
    const terminRaw = ambil(baris, 'termin')
    if (terminRaw !== '') {
      const n = Number(terminRaw)
      if (!Number.isInteger(n) || n < TERMIN_MIN || n > TERMIN_MAX) {
        warnings.push(
          `Baris ${nomorBaris}: termin "${terminRaw}" tidak dikenali (harus ${TERMIN_MIN}–${TERMIN_MAX} hari) — dikosongkan.`
        )
      } else {
        terminPembayaran = n
      }
    }

    rows.push({
      nama,
      kontak: kosongJadiNull(ambil(baris, 'kontak')),
      npwp: kosongJadiNull(ambil(baris, 'npwp')),
      terminPembayaran,
      akunHutangKode: kosongJadiNull(ambil(baris, 'akun')),
    })
  }

  if (errors.length === 0 && rows.length === 0) {
    errors.push('Tidak ada baris supplier yang bisa dibaca dari file ini.')
  }

  return { rows, errors, warnings: warnings.length > 0 ? warnings : undefined }
}
