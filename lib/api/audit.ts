import { and, eq, inArray, sql } from 'drizzle-orm'
import type { BatchItem } from 'drizzle-orm/batch'
import { db } from '@/lib/db'
import { auditEvents } from '@/lib/db/schema'
import type { AuditEntityType } from '@/lib/audit'
import type { JournalEvent } from '@/lib/journal'
import type { CoaEvent, TipeKas } from '@/lib/coa/type-history'

// Penyusun STATEMENT untuk audit_events — bukan penulis.
//
// Setiap fungsi di sini mengembalikan satu BatchItem, tidak pernah menjalankan
// apa pun sendiri. Itu bentuknya karena P10: setiap mutasi adalah SATU db.batch,
// dan eventnya harus ikut di dalam batch yang sama. Kalau modul ini menulis
// sendiri (await db.insert(...)), event akan berada di transaksi yang berbeda
// dari perubahan yang diriwayatkannya — dan salah satu dari keduanya bisa
// berhasil sementara yang lain gagal.

export type AuditEventInput = {
  clientId: string
  entityType: AuditEntityType
  /** null hanya sah untuk entitas yang requiresEntityId()-nya false. */
  entityId: string | null
  event: string
  /** null kalau usernya tidak bisa diresolusi — kolomnya ON DELETE set null. */
  userId: string | null
  catatan?: string | null
  /** Keadaan sebelum/sesudah (D42). jsonb — data, bukan prosa. */
  nilaiSebelum?: unknown
  nilaiSesudah?: unknown
}

/** Satu baris riwayat, siap dimasukkan ke db.batch milik pemanggil. */
export function recordAuditEvent(v: AuditEventInput): BatchItem<'pg'> {
  return db.insert(auditEvents).values({
    clientId: v.clientId,
    entityType: v.entityType,
    entityId: v.entityId,
    event: v.event,
    userId: v.userId,
    catatan: v.catatan ?? null,
    nilaiSebelum: v.nilaiSebelum ?? null,
    nilaiSesudah: v.nilaiSesudah ?? null,
  })
}

/**
 * Riwayat satu jurnal. Pembungkus tipis, tapi yang dibelinya bukan keringkasan:
 * `event` di sini bertipe JournalEvent, jadi nama peristiwa yang tidak ada di
 * daftar resmi ditolak compiler — sementara kolomnya di DB tetap text bebas.
 */
export function recordJournalEvent(v: {
  clientId: string
  journalId: string
  event: JournalEvent
  userId: string | null
  catatan?: string | null
  /** Wajib saat jurnal TERPOSTING diubah lewat sakelar D42. */
  nilaiSebelum?: unknown
  nilaiSesudah?: unknown
}): BatchItem<'pg'> {
  return recordAuditEvent({
    clientId: v.clientId,
    entityType: 'journal',
    entityId: v.journalId,
    event: v.event,
    userId: v.userId,
    catatan: v.catatan,
    nilaiSebelum: v.nilaiSebelum,
    nilaiSesudah: v.nilaiSesudah,
  })
}

/**
 * Hapus seluruh riwayat satu entitas.
 *
 * ══ INI PENGGANTI `ON DELETE CASCADE` ════════════════════════════════════
 * `entity_id` polimorfik tidak bisa punya FK, jadi Postgres tidak akan pernah
 * membersihkan event milik baris yang dihapus. Setiap jalur hapus WAJIB
 * memanggil fungsi ini DI DALAM db.batch yang sama dengan penghapusannya —
 * di luar batch, kegagalan di salah satu sisi meninggalkan riwayat yang
 * menunjuk id hantu (atau baris yang riwayatnya sudah hilang duluan).
 *
 * Ini satu-satunya DELETE yang sah atas tabel append-only ini.
 */
export function purgeAuditEvents(
  entityType: AuditEntityType,
  entityId: string
): BatchItem<'pg'> {
  return db
    .delete(auditEvents)
    .where(and(eq(auditEvents.entityType, entityType), eq(auditEvents.entityId, entityId)))
}

/**
 * Riwayat perubahan tipe akun / penanda kas (E6) — SATU INSERT untuk banyak
 * akun sekaligus. "Isi tipe dari berkas" dan ganti-massal bisa mengubah
 * ratusan akun; satu statement per akun akan membuat batch-nya satu permintaan
 * HTTP raksasa. Kosong → null: pemanggil tidak perlu menyaringnya sendiri.
 */
export function recordCoaTypeEvents(
  v: readonly {
    clientId: string
    coaId: string
    event: CoaEvent
    userId: string | null
    catatan: string
    nilaiSebelum: TipeKas
    nilaiSesudah: TipeKas
  }[]
): BatchItem<'pg'> | null {
  if (v.length === 0) return null
  return db.insert(auditEvents).values(
    v.map(e => ({
      clientId: e.clientId,
      entityType: 'master_coa' as const,
      entityId: e.coaId,
      event: e.event,
      userId: e.userId,
      catatan: e.catatan,
      nilaiSebelum: e.nilaiSebelum,
      nilaiSesudah: e.nilaiSesudah,
    }))
  )
}

/**
 * Pindahkan riwayat dari id lama ke id baru — untuk entitas yang id-nya
 * diganti tanpa identitasnya berubah (ganti-massal Master COA: DELETE-all +
 * INSERT-all, dicocokkan by kode). Satu UPDATE … FROM (VALUES …), pola yang
 * sama dengan relink baris jurnal. Kosong → null.
 */
export function relinkAuditEvents(
  entityType: AuditEntityType,
  pasangan: readonly { idLama: string; idBaru: string }[]
): BatchItem<'pg'> | null {
  if (pasangan.length === 0) return null
  const tuples = sql.join(
    pasangan.map(p => sql`(${p.idLama}::uuid, ${p.idBaru}::uuid)`),
    sql`, `
  )
  return db.execute(sql`
    update ${auditEvents} as ae
    set entity_id = v.id_baru
    from (values ${tuples}) as v(id_lama, id_baru)
    where ae.entity_type = ${entityType}::audit_entity_type and ae.entity_id = v.id_lama
  `)
}

/** purgeAuditEvents untuk banyak entitas sekaligus. Kosong → null. */
export function purgeAuditEventsMany(
  entityType: AuditEntityType,
  entityIds: readonly string[]
): BatchItem<'pg'> | null {
  if (entityIds.length === 0) return null
  return db
    .delete(auditEvents)
    .where(and(eq(auditEvents.entityType, entityType), inArray(auditEvents.entityId, [...entityIds])))
}
