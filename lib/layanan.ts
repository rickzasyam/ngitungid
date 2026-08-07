// Aturan master Layanan. MURNI (tanpa I/O, tanpa React) — pola sama dengan
// lib/settings-tabs.ts & lib/analytics/metric-visibility.ts.
//
// ══ TIDAK ADA PENGHAPUSAN, SELAMANYA ═══════════════════════════════════════
// Kontrak mencatat layanan APA yang dijual. Menghapus "Setup SCM" tiga tahun
// lagi akan melubangi setiap kontrak 2026 yang memuatnya — riwayat rusak oleh
// perubahan master data. Pelajaran yang sama dengan `kode` di Master COA.
//
// Karena itu `aktif` BUKAN "soft delete". Bedanya penting dan sering keliru:
//   soft delete → baris dianggap tidak ada lagi di mana pun
//   aktif=false → baris berhenti DITAWARKAN, tapi tetap ADA sepenuhnya
//
// Konsekuensinya dua fungsi di bawah sengaja berbeda perlakuan, dan itulah
// seluruh isi modul ini:
//   selectableLayanan() → untuk PICKER kontrak baru/edit: hanya yang aktif
//   resolveLayanan()    → untuk MENAMPILKAN kontrak yang sudah ada: semuanya,
//                         aktif atau tidak, tanpa penanda apa pun
//
// Yang tidak aktif TIDAK BOLEH dirender sebagai error, dicoret, atau diberi
// label "(dihapus)". Bagi pembaca kontrak lama, layanan itu memang benar-benar
// dijual saat itu — statusnya hari ini bukan urusan dokumen tersebut.

export interface LayananRow {
  id: string
  nama: string
  deskripsi: string | null
  aktif: boolean
}

/**
 * Daftar untuk PICKER saat membuat / mengubah kontrak: hanya yang aktif.
 * Urutan dipertahankan seperti yang diberikan pemanggil (query sudah urut nama).
 */
export function selectableLayanan(all: readonly LayananRow[]): LayananRow[] {
  return all.filter(l => l.aktif)
}

/**
 * Resolusi id → baris untuk MENAMPILKAN kontrak yang sudah ada.
 *
 * Mengembalikan baris apa adanya tanpa memandang `aktif`. Id yang benar-benar
 * tidak ditemukan dikembalikan sebagai `null` pada posisinya — itu kasus yang
 * BERBEDA (data rusak / id asing) dan pemanggil boleh menanganinya sendiri.
 * Karena baris layanan tidak pernah dihapus, kasus itu seharusnya tidak pernah
 * terjadi lewat jalur normal.
 */
export function resolveLayanan(
  all: readonly LayananRow[],
  ids: readonly string[]
): (LayananRow | null)[] {
  const byId = new Map(all.map(l => [l.id, l]))
  return ids.map(id => byId.get(id) ?? null)
}

/** Nama untuk ditampilkan. Sengaja TIDAK menambah "(nonaktif)" atau coretan —
 *  lihat catatan di kepala file. */
export function layananDisplayName(l: LayananRow): string {
  return l.nama
}

// ── Validasi input tulis ─────────────────────────────────────
export const NAMA_MIN = 2
export const NAMA_MAX = 120
export const DESKRIPSI_MAX = 500

export type LayananInput = { nama?: unknown; deskripsi?: unknown; aktif?: unknown }
export type LayananCheck =
  | { ok: true; nama: string; deskripsi: string | null; aktif: boolean }
  | { ok: false; error: string }

/**
 * Validasi body POST/PATCH.
 * `nama` di-trim (spasi ujung membuat unique(nama) gagal menangkap duplikat
 * yang bagi manusia jelas sama). `deskripsi` kosong → null, bukan string kosong,
 * supaya "tidak diisi" cuma punya satu representasi di DB.
 */
export function validateLayanan(input: LayananInput, { partial = false } = {}): LayananCheck {
  const hasNama = input.nama !== undefined
  if (!partial || hasNama) {
    if (typeof input.nama !== 'string') return { ok: false, error: 'Nama layanan wajib diisi.' }
  }
  const nama = typeof input.nama === 'string' ? input.nama.trim() : ''
  if ((!partial || hasNama)) {
    if (nama.length < NAMA_MIN) return { ok: false, error: `Nama layanan minimal ${NAMA_MIN} karakter.` }
    if (nama.length > NAMA_MAX) return { ok: false, error: `Nama layanan maksimal ${NAMA_MAX} karakter.` }
  }

  let deskripsi: string | null = null
  if (input.deskripsi !== undefined && input.deskripsi !== null) {
    if (typeof input.deskripsi !== 'string') return { ok: false, error: 'Deskripsi harus teks.' }
    const d = input.deskripsi.trim()
    if (d.length > DESKRIPSI_MAX) return { ok: false, error: `Deskripsi maksimal ${DESKRIPSI_MAX} karakter.` }
    deskripsi = d === '' ? null : d
  }

  if (input.aktif !== undefined && typeof input.aktif !== 'boolean') {
    return { ok: false, error: 'Status aktif harus boolean.' }
  }
  const aktif = input.aktif === undefined ? true : input.aktif

  return { ok: true, nama, deskripsi, aktif }
}
