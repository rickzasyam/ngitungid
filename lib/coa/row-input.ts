// Validasi + normalisasi satu baris Master COA (create & edit manual).
// Murni, tanpa I/O, supaya bisa diuji tanpa DB dan dipakai kedua route.

import { isAccountType, type AccountType } from './account-type'

export interface CoaRowInput {
  kode: string
  nama: string
  posisi: string
  kelompok: string
  subKelompok: string
  classCf: string | null
  /** Fase 2 (E3). null = biarkan diturunkan; bukan "tidak punya tipe". */
  tipeAkun: AccountType | null
  isKas: boolean
}

const REQUIRED: (keyof Omit<CoaRowInput, 'classCf'>)[] = [
  'kode',
  'nama',
  'posisi',
  'kelompok',
  'subKelompok',
]

const LABEL: Record<string, string> = {
  kode: 'Kode',
  nama: 'Nama Akun',
  posisi: 'Posisi',
  kelompok: 'Kelompok',
  subKelompok: 'Sub Kelompok',
}

/** 'debit'/'DEBET'/… → 'Debit' | 'Kredit'; selain itu dikembalikan apa adanya
 *  (setelah trim) supaya validator di bawah yang menolaknya dengan pesan jelas. */
function normalizePosisi(v: string): string {
  const s = v.trim().toLowerCase()
  if (s === 'debit' || s === 'debet' || s === 'd') return 'Debit'
  if (s === 'kredit' || s === 'credit' || s === 'k' || s === 'c') return 'Kredit'
  return v.trim()
}

export type ParseResult =
  | { ok: true; value: CoaRowInput }
  | { ok: false; errors: string[] }

/**
 * Body JSON → baris COA tervalidasi.
 *
 * Semua teks di-trim SEBELUM disimpan. Form-nya memang sudah memakai dropdown,
 * tapi trim di sini tetap murah dan menutup jalur lain (klien API, tempel dari
 * spreadsheet): satu spasi di ujung "Operating " sudah cukup membuat nilainya
 * tampak sama di layar padahal beda di DB, dan itu memecah pengelompokan
 * dropdown untuk baris berikutnya.
 */
export function parseCoaRowInput(body: unknown): ParseResult {
  if (typeof body !== 'object' || body === null) {
    return { ok: false, errors: ['Body harus berupa objek JSON.'] }
  }
  const b = body as Record<string, unknown>
  const errors: string[] = []

  const text = (k: string): string => (typeof b[k] === 'string' ? (b[k] as string).trim() : '')

  const value: CoaRowInput = {
    kode: text('kode'),
    nama: text('nama'),
    posisi: normalizePosisi(text('posisi')),
    kelompok: text('kelompok'),
    subKelompok: text('subKelompok'),
    // classCf opsional: string kosong dianggap "tidak diisi" (null), sejalan
    // dengan parser Excel dan kolomnya yang nullable.
    classCf: text('classCf') === '' ? null : text('classCf'),
    // tipeAkun opsional: kosong/absen → null, artinya "ikut turunan".
    // Nilai TERISI yang tidak dikenali ditolak di bawah, tidak diam-diam
    // dijadikan null — salah ketik yang lolos sebagai "tidak diisi" tidak
    // pernah terlihat oleh siapa pun.
    tipeAkun: isAccountType(b.tipeAkun) ? b.tipeAkun : null,
    // isKas hanya menerima boolean sejati. Kolomnya NOT NULL, jadi tidak ada
    // keadaan "belum diisi" yang perlu diwakili.
    isKas: b.isKas === true,
  }

  for (const f of REQUIRED) {
    // Sudah di-trim, jadi ini sekaligus menolak input yang isinya spasi saja.
    if (value[f] === '') errors.push(`${LABEL[f]} wajib diisi.`)
  }

  if (value.posisi !== '' && value.posisi !== 'Debit' && value.posisi !== 'Kredit') {
    errors.push('Posisi harus "Debit" atau "Kredit".')
  }

  // Terisi tapi bukan tipe yang sah → galat, bukan diam-diam null.
  if (b.tipeAkun !== undefined && b.tipeAkun !== null && b.tipeAkun !== '' && !isAccountType(b.tipeAkun)) {
    errors.push('Tipe Akun tidak dikenali.')
  }
  if (b.isKas !== undefined && typeof b.isKas !== 'boolean') {
    errors.push('Kolom Kas harus true atau false.')
  }

  return errors.length > 0 ? { ok: false, errors } : { ok: true, value }
}
