// Riwayat perubahan lintas-entitas. MURNI (tanpa I/O, tanpa React).
//
// ══ SATU TABEL UNTUK SEMUA RIWAYAT (R2, keputusan Ricko 2026-09-18) ═══════
// Master plan §8.5 semula merancang `journal_events` khusus jurnal. Bentuk itu
// sudah bocor di rancangannya sendiri — kolom `journal_id` harus nullable "untuk
// event periode", padahal kunci periode bukan jurnal — dan dua konsumen lain
// sudah tertulis di master plan yang sama: riwayat keterangan akun COA (F03-14)
// dan log buka-kunci periode (F07-8/11).
//
// Yang ditukar: `audit_events.entity_id` tidak bisa punya foreign key, jadi
// "event ini menunjuk baris yang benar-benar ada" dijaga kode, bukan Postgres.
// Kompensasinya ada tiga dan ketiganya nyata, bukan niat baik: entity_type
// berupa ENUM, CHECK yang mewajibkan entity_id untuk entitas 'journal', dan
// kewajiban menghapus event bersama entitasnya di dalam SATU db.batch.
//
// ══ NAMA PERISTIWA TIDAK TINGGAL DI SINI ══════════════════════════════════
// `event` bertipe text di DB (D12) dan daftar resminya milik lib masing-masing
// entitas — JOURNAL_EVENTS di lib/journal.ts, dan seterusnya. Modul ini hanya
// mengurus hal yang berlaku bagi SEMUA entitas.

export const AUDIT_ENTITY_TYPES = [
  'journal',
  'master_coa',
  'period_lock',
  'supplier',
  // Ditambah migrasi 0016 bersama modul pembelian & mutasi kas.
  'purchase_invoice',
  'cash_mutation',
] as const
export type AuditEntityType = (typeof AUDIT_ENTITY_TYPES)[number]

export function isAuditEntityType(v: unknown): v is AuditEntityType {
  return typeof v === 'string' && (AUDIT_ENTITY_TYPES as readonly string[]).includes(v)
}

/**
 * Entitas yang `entity_id`-nya WAJIB terisi.
 *
 * CERMIN dari CHECK `audit_events_entity_id_check` — bukan penggantinya. Yang
 * menolak tetap database; predikat ini ada supaya jalur tulis bisa memberi pesan
 * yang berguna sebelum menabrak constraint, dan supaya perbedaan antara keduanya
 * bisa diuji.
 *
 * Kenapa hanya 'journal': event kunci periode dan event COA yang belum punya
 * baris (mis. "seluruh COA diganti massal") memang tidak menunjuk satu baris pun
 * — memaksakan id di situ berarti mengarang id. Jurnal tidak punya kasus
 * seperti itu: setiap event jurnal lahir dari satu jurnal tertentu.
 */
const ENTITY_ID_REQUIRED: readonly AuditEntityType[] = ['journal']

/**
 * Entitas yang riwayatnya HIDUP LEBIH LAMA dari barisnya.
 *
 * Aturan umum: event dihapus bersama entitasnya, di db.batch yang sama —
 * pengganti FK cascade yang tidak bisa ada untuk kolom polimorfik.
 * `purchase_invoice` adalah PENGECUALIAN yang diminta tersurat oleh brief:
 * penghapusan invoice harus tercatat lengkap dengan isinya sebelum dihapus.
 * Konsekuensinya `entity_id`-nya menunjuk baris yang sudah tidak ada — sah,
 * karena CHECK hanya mewajibkan entity_id untuk entitas 'journal'.
 *
 * `supplier` pengecualian KEDUA (utang teknis audit supplier, 2026-10-28):
 * penghapusan supplier diminta tercatat, dan event `deleted` yang ikut dipurge
 * tidak mencatat apa pun. Alasannya sama dengan invoice, bukan dengan mutasi
 * kas: data rekanan (kontak, NPWP, rekening bank) tidak punya salinan di luar
 * aplikasi — beda dengan mutasi, yang buktinya ada di rekening koran dan bisa
 * diimpor ulang. Supplier hanya bisa dihapus bila tidak dirujuk invoice atau
 * jurnal mana pun, jadi riwayat inilah satu-satunya jejaknya.
 */
const RIWAYAT_ABADI: readonly AuditEntityType[] = ['purchase_invoice', 'supplier']

export function riwayatBertahanSetelahDihapus(entityType: AuditEntityType): boolean {
  return RIWAYAT_ABADI.includes(entityType)
}

export function requiresEntityId(entityType: AuditEntityType): boolean {
  return ENTITY_ID_REQUIRED.includes(entityType)
}

/** Batas catatan (alasan buka kunci, dll) — kolomnya text, batasnya aturan. */
export const CATATAN_MAX = 500
