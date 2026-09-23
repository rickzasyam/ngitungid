// Riwayat perubahan tipe akun & penanda kas (E6, F03-14). MURNI — tanpa I/O.
//
// ══ KENAPA TIPE AKUN PERLU RIWAYAT ════════════════════════════════════════
// `tipe_akun` dan `is_kas` menentukan di bagian mana sebuah akun muncul —
// Rekonsiliasi, Mutasi Kas, pemilih supplier di jurnal — dan keduanya bisa
// berubah lewat TIGA jalan: form baris, "Isi tipe dari berkas", dan ganti-massal
// Master COA yang membawa nilai lama by kode. Tanpa riwayat, "kenapa akun ini
// tiba-tiba tidak muncul di Mutasi Kas" tidak punya jawaban.
//
// ══ RIWAYAT MENGIKUTI KODE, BUKAN ID ══════════════════════════════════════
// Ganti-massal memberi SETIAP akun id baru (DELETE-all + INSERT-all). Riwayat
// dikunci ke `entity_id`, jadi tanpa penyambungan ulang ia lenyap dari form
// setiap kali COA diimpor ulang — padahal itu dilakukan rutin. Penyambungannya
// by kode, identitas yang sama yang dipakai buildReplacePlan untuk jurnal dan
// laporan. Akun yang kodenya hilang ikut kehilangan riwayatnya: aturan umum
// lib/audit.ts, riwayat dihapus bersama barisnya.

import { ACCOUNT_TYPE_LABEL, type AccountType } from '@/lib/coa/account-type'

/** Daftar resmi peristiwa entitas `master_coa` — pola JOURNAL_EVENTS. */
export const COA_EVENTS = ['tipe_diubah'] as const
export type CoaEvent = (typeof COA_EVENTS)[number]

export type TipeKas = { tipeAkun: AccountType | null; isKas: boolean }

/** Jalan yang mengubah tipe — disimpan sebagai `catatan` (prosa untuk manusia). */
export const SUMBER_PERUBAHAN_TIPE = {
  form: 'Diubah lewat form akun',
  berkas: 'Diubah lewat "Isi tipe dari berkas"',
  ganti_massal: 'Diubah saat Master COA diganti',
} as const
export type SumberPerubahanTipe = keyof typeof SUMBER_PERUBAHAN_TIPE

/** Bentuk baku yang disimpan di nilai_sebelum/nilai_sesudah — dua kunci, selalu. */
export function snapshotTipeKas(v: TipeKas): TipeKas {
  return { tipeAkun: v.tipeAkun ?? null, isKas: v.isKas === true }
}

export function tipeKasBerubah(sebelum: TipeKas, sesudah: TipeKas): boolean {
  const a = snapshotTipeKas(sebelum)
  const b = snapshotTipeKas(sesudah)
  return a.tipeAkun !== b.tipeAkun || a.isKas !== b.isKas
}

/**
 * Akun yang tipe/kas-nya BERUBAH saat ganti-massal, dicocokkan by kode.
 *
 * Kode baru (belum pernah ada) bukan perubahan — ia pembuatan, dan riwayatnya
 * mulai dari nol. Kode yang hilang juga bukan perubahan — barisnya hilang.
 * `entityId` adalah id BARU, karena baris lama sudah tidak ada saat riwayat
 * dibaca.
 */
export function perubahanTipeGantiMassal(
  lama: readonly ({ kode: string } & TipeKas)[],
  baru: readonly ({ id: string; kode: string } & TipeKas)[]
): { entityId: string; kode: string; sebelum: TipeKas; sesudah: TipeKas }[] {
  const byKode = new Map(lama.map(r => [r.kode, r]))
  return baru.flatMap(r => {
    const old = byKode.get(r.kode)
    if (!old || !tipeKasBerubah(old, r)) return []
    return [{ entityId: r.id, kode: r.kode, sebelum: snapshotTipeKas(old), sesudah: snapshotTipeKas(r) }]
  })
}

/**
 * Nasib riwayat akun LAMA saat ganti-massal: yang kodenya bertahan disambung
 * ke id barunya, yang kodenya hilang dihapus.
 */
export function rencanaRiwayatGantiMassal(
  lama: readonly { id: string; kode: string }[],
  kodeKeIdBaru: ReadonlyMap<string, string>
): { sambung: { idLama: string; idBaru: string }[]; hapus: string[] } {
  const sambung: { idLama: string; idBaru: string }[] = []
  const hapus: string[] = []
  for (const a of lama) {
    const idBaru = kodeKeIdBaru.get(a.kode)
    if (idBaru === undefined) hapus.push(a.id)
    else if (idBaru !== a.id) sambung.push({ idLama: a.id, idBaru })
  }
  return { sambung, hapus }
}

const labelTipe = (t: AccountType | null) => (t === null ? 'otomatis (turunan)' : ACCOUNT_TYPE_LABEL[t])
const labelKas = (k: boolean) => (k ? 'ya' : 'tidak')

/**
 * Kalimat per kolom yang berubah, untuk ditampilkan di form akun:
 * ["Tipe: otomatis (turunan) → Liabilitas", "Akun kas: tidak → ya"].
 *
 * Membaca dari jsonb, jadi masukannya `unknown` dan bentuk yang tidak dikenal
 * menghasilkan daftar kosong — riwayat yang rusak tidak boleh meruntuhkan form.
 */
export function ringkasPerubahanTipe(sebelum: unknown, sesudah: unknown): string[] {
  const baca = (v: unknown): TipeKas | null => {
    if (typeof v !== 'object' || v === null) return null
    const o = v as Record<string, unknown>
    const t = o.tipeAkun
    const tipeAkun = t === null || t === undefined ? null : (t as AccountType)
    if (tipeAkun !== null && !(tipeAkun in ACCOUNT_TYPE_LABEL)) return null
    return { tipeAkun, isKas: o.isKas === true }
  }
  const a = baca(sebelum)
  const b = baca(sesudah)
  if (!a || !b) return []
  const hasil: string[] = []
  if (a.tipeAkun !== b.tipeAkun) hasil.push(`Tipe: ${labelTipe(a.tipeAkun)} → ${labelTipe(b.tipeAkun)}`)
  if (a.isKas !== b.isKas) hasil.push(`Akun kas: ${labelKas(a.isKas)} → ${labelKas(b.isKas)}`)
  return hasil
}
