// Aturan Master Supplier. MURNI (tanpa I/O, tanpa React) — pola sama dengan
// lib/journal.ts & lib/contracts.ts.
//
// Supplier di Fase 1 adalah MASTER DATA saja: siapa rekanannya, kontaknya, dan
// akun hutang mana yang dipakai kalau kelak ada transaksi ke mereka. Belum ada
// saldo, belum ada rekonsiliasi — itu Fase 2, dan sengaja ditunda karena di
// Fase 1 tidak ada satu pun sumber angka hutang per supplier (butuh posting
// dan `journal_lines.supplier_id` yang belum ada di skema).

import { classifyBs } from '@/lib/financial-agg'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const NAMA_MIN = 2
export const NAMA_MAX = 120
export const TERMIN_MIN = 0
export const TERMIN_MAX = 365

/**
 * Akun ini akun HUTANG?
 *
 * Diturunkan dari `subKelompok` lewat `classifyBs` — mesin klasifikasi yang
 * SAMA yang dipakai Neraca dan rasio. Tidak ada daftar kata kunci kedua di
 * sini: kalau ada, "Hutang Usaha" bisa terhitung hutang di satu layar dan
 * bukan di layar lain, dan tidak akan ada yang menyadarinya sampai angkanya
 * dibandingkan.
 */
export function isHutangAccount(subKelompok: string): boolean {
  return classifyBs(subKelompok) === 'hutang'
}

export type SupplierInput = {
  nama?: unknown
  kontak?: unknown
  npwp?: unknown
  terminPembayaran?: unknown
  akunHutangDefaultId?: unknown
}

/** Bentuk siap tulis: opsional yang kosong sudah jadi null, bukan ''. */
export type SupplierValue = {
  nama: string
  kontak: string | null
  npwp: string | null
  terminPembayaran: number | null
  akunHutangDefaultId: string | null
}

export type SupplierCheck =
  | { ok: true; value: SupplierValue }
  | { ok: false; errors: string[] }

/**
 * Validasi satu supplier.
 *
 * Mengumpulkan SEMUA galat seperti validateJournalInput, bukan berhenti di yang
 * pertama — formulirnya diisi sekaligus.
 *
 * Kosong → NULL untuk setiap field opsional, dengan alasan yang sama seperti
 * `no_bukti` jurnal: '' adalah nilai konkret yang lolos ke DB dan lalu tampil
 * sebagai sel kosong yang tidak bisa dibedakan dari "memang tidak diisi", tapi
 * berperilaku berbeda di perbandingan. Satu bentuk untuk "tidak ada".
 */
export function validateSupplierInput(input: SupplierInput): SupplierCheck {
  const errors: string[] = []

  let nama = ''
  if (typeof input.nama !== 'string' || input.nama.trim() === '') {
    errors.push('Nama supplier wajib diisi.')
  } else {
    nama = input.nama.trim()
    if (nama.length < NAMA_MIN) {
      errors.push(`Nama supplier minimal ${NAMA_MIN} karakter.`)
    } else if (nama.length > NAMA_MAX) {
      errors.push(`Nama supplier maksimal ${NAMA_MAX} karakter.`)
    }
  }

  const teksOpsional = (v: unknown): string | null => {
    if (typeof v !== 'string') return null
    const t = v.trim()
    return t === '' ? null : t
  }

  // Termin: jumlah HARI, bukan tanggal. Kosong = belum ditentukan, dan itu
  // berbeda dari 0 (bayar tunai di muka) — dua-duanya nilai yang sah.
  let terminPembayaran: number | null = null
  const rawTermin = input.terminPembayaran
  if (rawTermin !== null && rawTermin !== undefined && rawTermin !== '') {
    const n = typeof rawTermin === 'number' ? rawTermin : Number(String(rawTermin).trim())
    if (!Number.isInteger(n) || n < TERMIN_MIN || n > TERMIN_MAX) {
      errors.push(`Termin pembayaran harus bilangan bulat ${TERMIN_MIN}–${TERMIN_MAX} hari.`)
    } else {
      terminPembayaran = n
    }
  }

  let akunHutangDefaultId: string | null = null
  const rawAkun = input.akunHutangDefaultId
  if (rawAkun !== null && rawAkun !== undefined && rawAkun !== '') {
    if (typeof rawAkun !== 'string' || !UUID_RE.test(rawAkun)) {
      errors.push('Akun hutang default tidak valid.')
    } else {
      akunHutangDefaultId = rawAkun
    }
  }

  if (errors.length > 0) return { ok: false, errors }
  return {
    ok: true,
    value: {
      nama,
      kontak: teksOpsional(input.kontak),
      npwp: teksOpsional(input.npwp),
      terminPembayaran,
      akunHutangDefaultId,
    },
  }
}
