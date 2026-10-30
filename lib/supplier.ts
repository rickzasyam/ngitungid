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
export const BANK_NAMA_MAX = 80
export const BANK_REKENING_MAX = 40
export const BANK_ATAS_NAMA_MAX = 120

/**
 * Bentuk SIMPAN sebuah nama supplier: spasi ganda dirapikan, ujungnya di-trim.
 * Huruf besar-kecil DIPERTAHANKAN — "PT ABC" tetap tampil "PT ABC".
 */
export function normalizeNamaSupplier(nama: string): string {
  return nama.replace(/\s+/g, ' ').trim()
}

/**
 * Kunci PENCOCOKAN sebuah nama supplier. Dipakai upsert impor, deteksi dobel di
 * dalam berkas, dan pemeriksaan duplikat.
 *
 * "PT ABC", "pt abc ", dan "PT  ABC" adalah supplier YANG SAMA bagi orang yang
 * mengetiknya. Kalau kuncinya cuma perbandingan string apa adanya, impor kedua
 * akan menyisipkan baris baru alih-alih memperbarui, dan daftarnya perlahan
 * terisi kembaran yang tak seorang pun sengaja buat.
 *
 * Basis data ikut menjaga ini lewat indeks unik atas (client_id, lower(nama)) —
 * bagian spasinya sudah diselesaikan di sini sebelum ditulis, jadi nilai yang
 * tersimpan tidak pernah punya spasi ganda dan `lower()` saja sudah cukup.
 */
export function namaSupplierKey(nama: string): string {
  return normalizeNamaSupplier(nama).toLowerCase()
}

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
  bankNama?: unknown
  bankRekening?: unknown
  bankAtasNama?: unknown
  akunHutangDefaultId?: unknown
}

/** Bentuk siap tulis: opsional yang kosong sudah jadi null, bukan ''. */
export type SupplierValue = {
  nama: string
  kontak: string | null
  npwp: string | null
  bankNama: string | null
  /** TEKS, bukan angka — nol di depan nomor rekening harus bertahan (D43). */
  bankRekening: string | null
  bankAtasNama: string | null
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
    // Dinormalkan SEBELUM diukur & disimpan: "PT  ABC " tersimpan "PT ABC",
    // sehingga nilai di DB tidak pernah punya spasi ganda dan indeks unik atas
    // lower(nama) cukup untuk menjaga keunikannya.
    nama = normalizeNamaSupplier(input.nama)
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

  // Data rekening (D43, menggantikan termin — termin kini melekat pada invoice).
  // Semuanya teks bebas; yang dijaga hanya panjangnya. Nomor rekening SENGAJA
  // tidak diubah jadi angka: nol di depan adalah bagian nomornya, dan
  // Number('0123') membuangnya tanpa galat apa pun.
  const bankNama = teksOpsional(input.bankNama)
  const bankRekening = teksOpsional(input.bankRekening)
  const bankAtasNama = teksOpsional(input.bankAtasNama)
  if (bankNama !== null && bankNama.length > BANK_NAMA_MAX) {
    errors.push(`Nama bank maksimal ${BANK_NAMA_MAX} karakter.`)
  }
  if (bankRekening !== null && bankRekening.length > BANK_REKENING_MAX) {
    errors.push(`Nomor rekening maksimal ${BANK_REKENING_MAX} karakter.`)
  }
  if (bankAtasNama !== null && bankAtasNama.length > BANK_ATAS_NAMA_MAX) {
    errors.push(`Nama pemilik rekening maksimal ${BANK_ATAS_NAMA_MAX} karakter.`)
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
      bankNama,
      bankRekening,
      bankAtasNama,
      akunHutangDefaultId,
    },
  }
}

// ══ RIWAYAT SUPPLIER (audit_events, entity_type 'supplier') ══════════════
// Nama peristiwa milik lib entitasnya sendiri, bukan lib/audit.ts (R2 §3.3) —
// pola yang sama dengan JOURNAL_EVENTS. Enum 'supplier' sudah ada sejak 0014;
// tidak ada migrasi.

export const SUPPLIER_EVENTS = ['created', 'updated', 'deleted'] as const
export type SupplierEvent = (typeof SUPPLIER_EVENTS)[number]

/** Kolom DATA supplier yang direkam di nilai_sebelum/nilai_sesudah — tanpa id, klien, dan cap waktu. */
export const KOLOM_DATA_SUPPLIER = [
  'nama',
  'kontak',
  'npwp',
  'bankNama',
  'bankRekening',
  'bankAtasNama',
  'akunHutangDefaultId',
] as const satisfies readonly (keyof SupplierValue)[]

/** Isi supplier untuk riwayat: tepat ketujuh kolom data, apa pun yang ikut terbawa di objeknya. */
export function snapshotSupplier(v: SupplierValue): SupplierValue {
  return {
    nama: v.nama,
    kontak: v.kontak,
    npwp: v.npwp,
    bankNama: v.bankNama,
    bankRekening: v.bankRekening,
    bankAtasNama: v.bankAtasNama,
    akunHutangDefaultId: v.akunHutangDefaultId,
  }
}

/**
 * Ada kolom data yang berubah?
 *
 * Simpan tanpa perubahan (formulir dibuka lalu disimpan, atau berkas impor yang
 * sama diunggah ulang) tidak dicatat: ratusan event "updated" yang identik
 * sebelum-sesudahnya hanya mengubur perubahan yang sungguh terjadi.
 */
export function supplierBerubah(sebelum: SupplierValue, sesudah: SupplierValue): boolean {
  return KOLOM_DATA_SUPPLIER.some(k => sebelum[k] !== sesudah[k])
}
