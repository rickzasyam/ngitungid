import * as XLSX from 'xlsx'

// Parser Master COA dari file Excel (.xlsx/.xls). Semua logika SheetJS
// diisolasi di sini supaya route handler tetap tipis & modul ini bisa
// dipakai ulang oleh upload flow (Phase 2.4) nanti.

export interface ParsedCoaRow {
  kode: string
  nama: string
  posisi: string
  kelompok: string
  subKelompok: string
  classCf: string | null
}

export interface CoaParseResult {
  rows: ParsedCoaRow[]
  errors: string[]
}

type Field = 'kode' | 'nama' | 'posisi' | 'kelompok' | 'subKelompok' | 'classCf'

// Field wajib ada isinya per baris (classCf boleh kosong → null).
const REQUIRED_FIELDS: Field[] = ['kode', 'nama', 'posisi', 'kelompok', 'subKelompok']

const FIELD_LABEL: Record<Field, string> = {
  kode: 'Kode',
  nama: 'Nama Akun',
  posisi: 'Posisi',
  kelompok: 'Kelompok',
  subKelompok: 'Sub Kelompok',
  classCf: 'Class CF',
}

// Alias header (sudah dinormalisasi) → field skema. Toleran terhadap variasi
// penulisan template klien. Tambah alias di sini kalau ketemu format baru.
const HEADER_ALIASES: Record<string, Field> = {
  'kode': 'kode',
  'kode akun': 'kode',
  'code': 'kode',
  'account code': 'kode',
  'no akun': 'kode',
  'nomor akun': 'kode',
  'nama': 'nama',
  'nama akun': 'nama',
  'account name': 'nama',
  'name': 'nama',
  'akun': 'nama',
  'keterangan': 'nama',
  'posisi': 'posisi',
  'posisi normal': 'posisi',
  'saldo normal': 'posisi',
  'normal balance': 'posisi',
  'db kr': 'posisi',
  'kelompok': 'kelompok',
  'kelompok akun': 'kelompok',
  'group': 'kelompok',
  'jenis': 'kelompok',
  'sub kelompok': 'subKelompok',
  'subkelompok': 'subKelompok',
  'sub group': 'subKelompok',
  'sub jenis': 'subKelompok',
  'kategori': 'subKelompok',
  'class cf': 'classCf',
  'classcf': 'classCf',
  'class arus kas': 'classCf',
  'kelompok cf': 'classCf',
  'cash flow class': 'classCf',
  'arus kas': 'classCf',
  'cf': 'classCf',
}

const MAX_ERRORS = 25

// Lowercase, trim, buang tanda baca umum, ratakan spasi ganda.
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

/**
 * Parse workbook Master COA menjadi baris tervalidasi.
 * Kontrak: kalau `errors` tidak kosong, JANGAN tulis ke DB — kembalikan 400.
 */
export function parseCoaWorkbook(data: ArrayBuffer): CoaParseResult {
  let wb: XLSX.WorkBook
  try {
    wb = XLSX.read(new Uint8Array(data), { type: 'array' })
  } catch {
    return { rows: [], errors: ['File tidak bisa dibaca sebagai Excel yang valid.'] }
  }

  const sheetName = wb.SheetNames[0]
  if (!sheetName) return { rows: [], errors: ['Workbook tidak punya sheet apa pun.'] }

  const sheet = wb.Sheets[sheetName]
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    blankrows: false,
    defval: '',
  })

  if (matrix.length === 0) return { rows: [], errors: ['Sheet kosong.'] }

  // Baris pertama yang punya isi dianggap header.
  const headerRowIdx = matrix.findIndex(row => row.some(cell => cellToString(cell) !== ''))
  if (headerRowIdx === -1) return { rows: [], errors: ['Tidak ada header terdeteksi.'] }

  const headerRow = matrix[headerRowIdx]

  // Petakan field → index kolom.
  const colIndex: Partial<Record<Field, number>> = {}
  headerRow.forEach((cell, idx) => {
    const field = HEADER_ALIASES[normalizeHeader(cell)]
    if (field && colIndex[field] === undefined) colIndex[field] = idx
  })

  const missingCols = REQUIRED_FIELDS.filter(f => colIndex[f] === undefined)
  if (missingCols.length > 0) {
    return {
      rows: [],
      errors: [
        `Kolom wajib tidak ditemukan: ${missingCols.map(f => FIELD_LABEL[f]).join(', ')}. ` +
          `Pastikan baris header memuat: Kode, Nama Akun, Posisi, Kelompok, Sub Kelompok (Class CF opsional).`,
      ],
    }
  }

  const rows: ParsedCoaRow[] = []
  const errors: string[] = []
  const seenKode = new Set<string>()

  const pick = (row: unknown[], field: Field): string =>
    colIndex[field] === undefined ? '' : cellToString(row[colIndex[field]!])

  for (let i = headerRowIdx + 1; i < matrix.length; i++) {
    const row = matrix[i]
    const excelRow = i + 1 // 1-indexed untuk pesan error yang sesuai tampilan spreadsheet

    const values: Record<Field, string> = {
      kode: pick(row, 'kode'),
      nama: pick(row, 'nama'),
      posisi: pick(row, 'posisi'),
      kelompok: pick(row, 'kelompok'),
      subKelompok: pick(row, 'subKelompok'),
      classCf: pick(row, 'classCf'),
    }

    // Baris kosong total → lewati diam-diam (baris trailing yang wajar).
    if (REQUIRED_FIELDS.every(f => values[f] === '') && values.classCf === '') continue

    const missing = REQUIRED_FIELDS.filter(f => values[f] === '')
    if (missing.length > 0) {
      if (errors.length < MAX_ERRORS) {
        errors.push(`Baris ${excelRow}: kolom kosong — ${missing.map(f => FIELD_LABEL[f]).join(', ')}.`)
      }
      continue
    }

    if (seenKode.has(values.kode)) {
      if (errors.length < MAX_ERRORS) {
        errors.push(`Baris ${excelRow}: kode "${values.kode}" duplikat di dalam file.`)
      }
      continue
    }
    seenKode.add(values.kode)

    rows.push({
      kode: values.kode,
      nama: values.nama,
      posisi: values.posisi,
      kelompok: values.kelompok,
      subKelompok: values.subKelompok,
      classCf: values.classCf === '' ? null : values.classCf,
    })
  }

  if (rows.length === 0 && errors.length === 0) {
    errors.push('Tidak ada baris data akun yang ditemukan di bawah header.')
  }

  return { rows, errors }
}
