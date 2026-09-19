import * as XLSX from 'xlsx'
import { parseKasCell, parseTipeAkunCell, type AccountType } from '@/lib/coa/account-type'

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
  /** Kolom OPSIONAL (E3). null = tidak diisi berkas → jangan menimpa yang ada. */
  tipeAkun: AccountType | null
  isKas: boolean | null
}

export interface CoaParseResult {
  rows: ParsedCoaRow[]
  errors: string[]
  // Non-blocking: mis. kode dobel yang di-suffix otomatis. Import tetap lanjut.
  // Optional — early-return (error) path tidak mengisinya; konsumen pakai `?? []`.
  warnings?: string[]
  /**
   * Kode DASAR yang muncul lebih dari sekali di file (sebelum di-suffix).
   * Contoh: file punya dua baris "24-0001" → hasilnya "24-0001" & "24-0001-2",
   * dan "24-0001" masuk daftar ini.
   *
   * Dipakai re-link saat ganti Master COA: baris mana yang "asli" pemegang kode
   * itu ditentukan semata oleh urutan baris di Excel, jadi menyambungkan mapping
   * lama ke salah satunya adalah tebakan. Kode di daftar ini SENGAJA tidak
   * di-re-link — lebih baik admin memetakan ulang secara sadar daripada diam-diam
   * menyambung ke akun yang salah. Optional, alasan sama dengan `warnings`.
   */
  ambiguousKode?: string[]
}

type Field = 'kode' | 'nama' | 'posisi' | 'kelompok' | 'subKelompok' | 'classCf' | 'tipeAkun' | 'isKas'

// Field wajib ada isinya per baris (classCf boleh kosong → null).
const REQUIRED_FIELDS: Field[] = ['kode', 'nama', 'posisi', 'kelompok', 'subKelompok']

const FIELD_LABEL: Record<Field, string> = {
  kode: 'Kode',
  nama: 'Nama Akun',
  posisi: 'Posisi',
  kelompok: 'Kelompok',
  subKelompok: 'Sub Kelompok',
  classCf: 'Class CF',
  tipeAkun: 'Tipe Akun',
  isKas: 'Kas?',
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
  // Template Rasyuka menamai kolom nama akun-nya "COA".
  'coa': 'nama',
  'nama coa': 'nama',
  'account': 'nama',
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
  // ── Kolom opsional Fase 2 (E3) ──────────────────────────────
  // 'tipe' sendirian SENGAJA TIDAK didaftarkan: ia terlalu umum dan akan
  // menyerobot kolom lain yang berjudul "Tipe" di template klien (mis. tipe
  // transaksi). Alias di sini semuanya menyebut kata 'akun' atau berbahasa
  // Inggris yang tak ambigu.
  'tipe akun': 'tipeAkun',
  'tipeakun': 'tipeAkun',
  'jenis akun': 'tipeAkun',
  'golongan akun': 'tipeAkun',
  'account type': 'tipeAkun',
  // 'kas' TELANJANG juga tidak didaftarkan: di sheet akuntansi ia jauh lebih
  // mungkin kolom nominal saldo kas daripada penanda ya/tidak.
  'kas?': 'isKas',
  'akun kas': 'isKas',
  'is kas': 'isKas',
  'iskas': 'isKas',
  'is cash': 'isKas',
  'cash account': 'isKas',
}

const MAX_ERRORS = 25

// Nama sheet yang menandakan "ini Master COA" — dipakai sbg tiebreak saat >1
// sheet punya header COA lengkap (workbook akuntansi klien bisa punya beberapa
// sheet ber-kolom COA: master, neraca saldo, olah data). Hanya jadi bobot,
// bukan syarat — sheet tetap harus benar-benar punya kolom COA.
const COA_SHEET_NAME_RE = /master\s*(coa|data|akun)|\bcoa\b|daftar\s+akun|bagan\s+akun|chart\s+of\s+account|kode\s+akun/i

// Lowercase, trim, buang tanda baca umum, ratakan spasi ganda.
function normalizeHeader(raw: unknown): string {
  return String(raw ?? '')
    .toLowerCase()
    .replace(/[._\-/]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// Baca hanya N baris pertama sebuah sheet (buat scan header lintas-sheet tanpa
// mem-parse ribuan baris di tiap sheet workbook besar).
function readHead(sheet: XLSX.WorkSheet, maxRows: number): unknown[][] {
  const ref = sheet['!ref']
  if (!ref) return []
  const r = XLSX.utils.decode_range(ref)
  const range = { s: { r: r.s.r, c: r.s.c }, e: { r: Math.min(r.e.r, r.s.r + maxRows - 1), c: r.e.c } }
  return XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, blankrows: false, defval: '', range })
}

// Deteksi baris header dalam satu matrix: baris (di ~20 baris pertama) dengan
// field COA-dikenal terbanyak. Melewati baris banner/judul/preamble.
function detectHeader(matrix: unknown[][]): { headerRowIdx: number; colIndex: Partial<Record<Field, number>>; requiredMatched: number } | null {
  const scanLimit = Math.min(matrix.length, 20)
  let best: { headerRowIdx: number; colIndex: Partial<Record<Field, number>>; requiredMatched: number } | null = null
  for (let i = 0; i < scanLimit; i++) {
    const colIndex: Partial<Record<Field, number>> = {}
    matrix[i].forEach((cell, idx) => {
      const field = HEADER_ALIASES[normalizeHeader(cell)]
      if (field && colIndex[field] === undefined) colIndex[field] = idx
    })
    const requiredMatched = REQUIRED_FIELDS.filter(f => colIndex[f] !== undefined).length
    if (requiredMatched === 0) continue
    if (!best || requiredMatched > best.requiredMatched) best = { headerRowIdx: i, colIndex, requiredMatched }
  }
  return best
}

function cellToString(value: unknown): string {
  if (value === null || value === undefined) return ''
  return String(value).trim()
}

// D/K (dan variannya) → Debit/Kredit — template Rasyuka pakai singkatan.
// Nilai lain (mis. "-" pada baris non-postable) disimpan apa adanya.
function normalizePosisi(raw: string): string {
  const v = raw.trim().toLowerCase()
  if (v === 'd' || v === 'dr' || v === 'debit') return 'Debit'
  if (v === 'k' || v === 'kr' || v === 'cr' || v === 'c' || v === 'kredit' || v === 'credit') return 'Kredit'
  return raw.trim()
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

  if (wb.SheetNames.length === 0) return { rows: [], errors: ['Workbook tidak punya sheet apa pun.'] }

  // Pilih sheet COA: workbook klien bisa punya puluhan sheet (buku kas, jurnal,
  // neraca, dst) dan Master COA-nya BUKAN selalu sheet pertama. Skor tiap sheet
  // dari header COA terbaiknya (jumlah field wajib yang cocok) + bobot kalau nama
  // sheet menandakan COA. Baca hanya kepala tiap sheet dulu (hemat, workbook bisa
  // ribuan baris/sheet); sheet pemenang baru dibaca penuh.
  let bestSheet: string | null = null
  let bestScore = -1
  for (const name of wb.SheetNames) {
    const det = detectHeader(readHead(wb.Sheets[name], 20))
    if (!det) continue
    const score = det.requiredMatched + (COA_SHEET_NAME_RE.test(name) ? 10 : 0)
    if (score > bestScore) {
      bestScore = score
      bestSheet = name
    }
  }
  if (!bestSheet) {
    return {
      rows: [],
      errors: [
        `Tidak ada sheet yang berisi kolom Master COA yang dikenali (dicek ${wb.SheetNames.length} sheet). ` +
          `Pastikan ada sheet dengan baris header: Kode, Nama Akun, Posisi, Kelompok, Sub Kelompok (Class CF opsional).`,
      ],
    }
  }

  const matrix = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[bestSheet], {
    header: 1,
    blankrows: false,
    defval: '',
  })
  const det = detectHeader(matrix)
  if (!det) return { rows: [], errors: [`Sheet "${bestSheet}" kosong saat dibaca ulang.`] }
  const { headerRowIdx, colIndex } = det

  const missingCols = REQUIRED_FIELDS.filter(f => colIndex[f] === undefined)
  if (missingCols.length > 0) {
    return {
      rows: [],
      errors: [
        `Kolom wajib tidak ditemukan di sheet "${bestSheet}": ${missingCols.map(f => FIELD_LABEL[f]).join(', ')}. ` +
          `Pastikan baris header memuat: Kode, Nama Akun, Posisi, Kelompok, Sub Kelompok (Class CF opsional).`,
      ],
    }
  }

  const rows: ParsedCoaRow[] = []
  const errors: string[] = []
  const suffixedKode: string[] = []
  const ambiguousKode = new Set<string>()
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
      tipeAkun: pick(row, 'tipeAkun'),
      isKas: pick(row, 'isKas'),
    }

    // Baris kosong total → lewati diam-diam (baris trailing yang wajar).
    // Kolom opsional Fase 2 ikut diperiksa: baris yang HANYA berisi "Tipe Akun"
    // tanpa kode/nama bukan baris data, dan melewatinya lebih baik daripada
    // melaporkannya sebagai lima kolom wajib yang kosong.
    if (
      REQUIRED_FIELDS.every(f => values[f] === '') &&
      values.classCf === '' &&
      values.tipeAkun === '' &&
      values.isKas === ''
    ) {
      continue
    }

    const missing = REQUIRED_FIELDS.filter(f => values[f] === '')
    if (missing.length > 0) {
      if (errors.length < MAX_ERRORS) {
        errors.push(`Baris ${excelRow}: kolom kosong — ${missing.map(f => FIELD_LABEL[f]).join(', ')}.`)
      }
      continue
    }

    // Kode dobel di-suffix otomatis (-2, -3, …) supaya tetap unik terhadap
    // unique(client_id, kode). Template klien kadang mulai ulang nomor di section
    // berbeda (mis. "Pendapatan & Biaya Lain-Lain" pakai ulang 24-xxxx). Nama akun
    // (yang jadi identitas untuk mapping) tetap utuh & tidak disentuh.
    let kode = values.kode
    if (seenKode.has(kode)) {
      let n = 2
      while (seenKode.has(`${values.kode}-${n}`)) n++
      kode = `${values.kode}-${n}`
      suffixedKode.push(`${values.kode} → ${kode}`)
      // Kode dasarnya jadi ambigu: pemegang "aslinya" cuma ditentukan urutan baris.
      ambiguousKode.add(values.kode)
    }
    seenKode.add(kode)

    // Kolom opsional: sel kosong → null (jangan menimpa nilai yang sudah ada),
    // nilai TERISI tapi tidak dikenali → galat yang menyebut barisnya. Salah
    // ketik yang diam-diam dibaca sebagai "tidak diisi" adalah kegagalan yang
    // tidak pernah terlihat sampai laporannya salah.
    const tipeAkun = parseTipeAkunCell(values.tipeAkun)
    if (tipeAkun === undefined) {
      if (errors.length < MAX_ERRORS) {
        errors.push(`Baris ${excelRow}: Tipe Akun "${values.tipeAkun}" tidak dikenali.`)
      }
      continue
    }
    const isKas = parseKasCell(values.isKas)
    if (isKas === undefined) {
      if (errors.length < MAX_ERRORS) {
        errors.push(`Baris ${excelRow}: kolom Kas? "${values.isKas}" tidak dikenali (isi ya/tidak).`)
      }
      continue
    }

    rows.push({
      kode,
      nama: values.nama,
      posisi: normalizePosisi(values.posisi),
      kelompok: values.kelompok,
      subKelompok: values.subKelompok,
      classCf: values.classCf === '' ? null : values.classCf,
      tipeAkun,
      isKas,
    })
  }

  if (rows.length === 0 && errors.length === 0) {
    errors.push('Tidak ada baris data akun yang ditemukan di bawah header.')
  }

  const warnings: string[] = []
  // Kalau workbook multi-sheet, beri tahu sheet mana yang dipakai — supaya admin
  // bisa sadar kalau auto-pick memilih sheet yang salah.
  if (wb.SheetNames.length > 1) {
    warnings.push(`COA dibaca dari sheet "${bestSheet}" (dari ${wb.SheetNames.length} sheet).`)
  }
  if (suffixedKode.length > 0) {
    warnings.push(
      `${suffixedKode.length} kode dobel disesuaikan otomatis agar unik: ${suffixedKode.join(', ')}`
    )
  }

  return { rows, errors, warnings, ambiguousKode: [...ambiguousKode] }
}
