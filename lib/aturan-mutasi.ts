// Aturan akun lawan otomatis "uraian mengandung X → akun Y" (MP §5.G S4, D57).
// MURNI (tanpa I/O, tanpa React), TANPA RegExp (D22 — dikunci test pemindai
// sumber). Tabelnya `cash_mutation_rules` (0021).
//
// ══ HASILNYA USULAN, BUKAN NILAI SEL ═════════════════════════════════════
// `usulkanAkunLawan` tidak pernah menulis apa pun: usulannya tampil lilac di
// sel akun lawan dan baru masuk nilainya lewat "Terapkan usulan" (D10, D57).
// Aturan yang salah karena itu hanya menghasilkan usulan yang salah — yang
// masih terlihat dan masih bisa ditimpa — bukan ribuan baris yang diam-diam
// terisi akun keliru.
//
// ══ COCOK = includes SESUDAH normalizeKeterangan, BUKAN RegExp ═══════════
// Pola ditulis pengguna. Menjalankannya sebagai RegExp adalah celah ReDoS
// (D22), dan juga membuat "TRF.BCA" berarti hal yang tidak dimaksud siapa pun.
// `normalizeKeterangan` yang sama dengan fingerprint duplikat dipakai di kedua
// sisi: huruf kecil, tanda baca jadi spasi, spasi dirapatkan — "BRI-TRF" cocok
// dengan pola "bri trf".
//
// ══ BANYAK YANG COCOK ════════════════════════════════════════════════════
// Prioritas tertinggi menang, lalu pola TERPANJANG (lebih spesifik). Seri di
// puncak dengan akun BERBEDA → tanpa usulan + tanda "aturan bentrok": menebak
// salah satunya berarti hasilnya bergantung urutan baca dari database. Seri
// yang menunjuk akun yang SAMA bukan bentrok — keduanya mengusulkan hal yang
// sama.

import { normalizeKeterangan } from '@/lib/cash-mutation'

export const ARAH_ATURAN = ['masuk', 'keluar', 'keduanya'] as const
export type ArahAturan = (typeof ARAH_ATURAN)[number]

export const LABEL_ARAH_ATURAN: Record<ArahAturan, string> = {
  masuk: 'Uang masuk',
  keluar: 'Uang keluar',
  keduanya: 'Masuk & keluar',
}

export const POLA_MIN = 2
export const POLA_MAX = 100
export const PRIORITAS_MIN = -1000
export const PRIORITAS_MAX = 1000

const UUID_RE_PANJANG = 36
const isUuid = (v: unknown): v is string => {
  if (typeof v !== 'string' || v.length !== UUID_RE_PANJANG) return false
  for (let i = 0; i < v.length; i++) {
    const ch = v[i]
    if (i === 8 || i === 13 || i === 18 || i === 23) {
      if (ch !== '-') return false
      continue
    }
    const hex = (ch >= '0' && ch <= '9') || (ch >= 'a' && ch <= 'f') || (ch >= 'A' && ch <= 'F')
    if (!hex) return false
  }
  return true
}

export type AturanMutasi = {
  id: string
  pola: string
  arah: ArahAturan
  akunLawanId: string
  /** null = berlaku untuk SEMUA akun kas klien. */
  akunKasId: string | null
  prioritas: number
  aktif: boolean
}

// ── Validasi masukan (route & form memakai yang SAMA) ────────

export type AturanInput = {
  pola?: unknown
  arah?: unknown
  akunLawanId?: unknown
  akunKasId?: unknown
  prioritas?: unknown
  aktif?: unknown
}

export type AturanValue = Omit<AturanMutasi, 'id'>

export type AturanCheck = { ok: true; value: AturanValue } | { ok: false; errors: string[] }

/**
 * Validasi satu aturan. Mengumpulkan seluruh galat. Pola disimpan APA ADANYA
 * (trim saja) — yang dinormalkan hanya saat mencocokkan, supaya yang dibaca
 * akunting di daftar aturan sama dengan yang ia ketik.
 */
export function validateAturanInput(input: AturanInput): AturanCheck {
  const errors: string[] = []

  const pola = typeof input.pola === 'string' ? input.pola.trim() : ''
  if (pola.length < POLA_MIN || pola.length > POLA_MAX) {
    errors.push(`Pola harus ${POLA_MIN}–${POLA_MAX} karakter.`)
  } else if (normalizeKeterangan(pola).length < POLA_MIN) {
    // "--" atau "!!" lolos panjang tapi kosong sesudah dinormalkan — dan pola
    // kosong cocok dengan SEMUA uraian.
    errors.push('Pola harus memuat setidaknya dua huruf atau angka.')
  }

  const arah = input.arah === undefined || input.arah === null || input.arah === '' ? 'keduanya' : input.arah
  if (!ARAH_ATURAN.includes(arah as ArahAturan)) errors.push('Arah harus masuk, keluar, atau keduanya.')

  if (!isUuid(input.akunLawanId)) errors.push('Akun lawan wajib dipilih.')

  let akunKasId: string | null = null
  if (input.akunKasId !== undefined && input.akunKasId !== null && input.akunKasId !== '') {
    if (!isUuid(input.akunKasId)) errors.push('Akun kas tidak valid.')
    else akunKasId = input.akunKasId
  }

  let prioritas = 0
  if (input.prioritas !== undefined && input.prioritas !== null && input.prioritas !== '') {
    const n = typeof input.prioritas === 'number' ? input.prioritas : Number(String(input.prioritas).trim())
    if (!Number.isInteger(n) || n < PRIORITAS_MIN || n > PRIORITAS_MAX) {
      errors.push(`Prioritas harus bilangan bulat ${PRIORITAS_MIN}–${PRIORITAS_MAX}.`)
    } else prioritas = n
  }

  const aktif = input.aktif === undefined ? true : input.aktif === true
  if (input.aktif !== undefined && typeof input.aktif !== 'boolean') errors.push('Aktif harus true/false.')

  if (akunKasId !== null && akunKasId === input.akunLawanId) {
    errors.push('Akun lawan tidak boleh sama dengan akun kasnya.')
  }

  if (errors.length > 0) return { ok: false, errors }
  return {
    ok: true,
    value: {
      pola,
      arah: arah as ArahAturan,
      akunLawanId: input.akunLawanId as string,
      akunKasId,
      prioritas,
      aktif,
    },
  }
}

// ── Pencocok ─────────────────────────────────────────────────

/** Aturan yang sudah dinormalkan & diurutkan — disiapkan SEKALI per daftar aturan. */
export type AturanSiap = AturanMutasi & { polaNormal: string }

/**
 * Normalkan pola, buang yang nonaktif atau polanya kosong sesudah dinormalkan,
 * lalu urutkan: prioritas turun, panjang pola turun, id (stabil). 10.000 baris
 * × 200 aturan hanya terjangkau bila pekerjaan ini tidak diulang per baris.
 */
export function siapkanAturan(aturan: readonly AturanMutasi[]): AturanSiap[] {
  return aturan
    .filter(a => a.aktif)
    .map(a => ({ ...a, polaNormal: normalizeKeterangan(a.pola) }))
    .filter(a => a.polaNormal !== '')
    .sort((x, y) => {
      if (x.prioritas !== y.prioritas) return y.prioritas - x.prioritas
      if (x.polaNormal.length !== y.polaNormal.length) return y.polaNormal.length - x.polaNormal.length
      return x.id < y.id ? -1 : x.id > y.id ? 1 : 0
    })
}

export type UsulanAturan =
  | { jenis: 'usulan'; akunId: string; aturanId: string }
  | { jenis: 'bentrok'; aturanId: string[] }
  | null

/**
 * Usulan akun lawan untuk satu baris.
 *
 * `arah` null (baris tanpa nominal yang terbaca) hanya dicocokkan dengan aturan
 * "keduanya" — aturan khusus masuk/keluar tidak bisa dinilai tanpa arahnya.
 * Aturan berakun kas hanya berlaku untuk akun kas itu.
 *
 * Karena daftarnya sudah terurut, pencarian BERHENTI begitu peringkat turun di
 * bawah kecocokan pertama — sisanya tidak mungkin menang.
 */
export function usulkanAkunLawan(
  baris: { uraian: string; arah: 'masuk' | 'keluar' | null; akunKasId: string },
  aturan: readonly AturanSiap[]
): UsulanAturan {
  const uraian = normalizeKeterangan(baris.uraian)
  if (uraian === '') return null

  let puncak: AturanSiap[] = []
  for (const a of aturan) {
    if (puncak.length > 0) {
      const p = puncak[0]
      if (a.prioritas !== p.prioritas || a.polaNormal.length !== p.polaNormal.length) break
    }
    if (a.arah !== 'keduanya' && a.arah !== baris.arah) continue
    if (a.akunKasId !== null && a.akunKasId !== baris.akunKasId) continue
    if (!uraian.includes(a.polaNormal)) continue
    puncak = [...puncak, a]
  }

  if (puncak.length === 0) return null
  const akun = new Set(puncak.map(a => a.akunLawanId))
  if (akun.size > 1) return { jenis: 'bentrok', aturanId: puncak.map(a => a.id) }
  return { jenis: 'usulan', akunId: puncak[0].akunLawanId, aturanId: puncak[0].id }
}

/** Berapa uraian yang AKAN dikenai satu pola (uji pola di Settings, D57). */
export function hitungKena(
  pola: { pola: string; arah: ArahAturan; akunKasId: string | null },
  mutasi: readonly { keterangan: string | null; arah: 'masuk' | 'keluar'; akunKasId: string }[]
): { jumlah: number; contoh: string[] } {
  const p = normalizeKeterangan(pola.pola)
  if (p === '') return { jumlah: 0, contoh: [] }
  let jumlah = 0
  const contoh: string[] = []
  for (const m of mutasi) {
    if (pola.arah !== 'keduanya' && pola.arah !== m.arah) continue
    if (pola.akunKasId !== null && pola.akunKasId !== m.akunKasId) continue
    if (!normalizeKeterangan(m.keterangan).includes(p)) continue
    jumlah++
    if (contoh.length < 5 && m.keterangan) contoh.push(m.keterangan)
  }
  return { jumlah, contoh }
}
