import { and, eq } from 'drizzle-orm'
import type { BatchItem } from 'drizzle-orm/batch'
import { db } from '@/lib/db'
import { auditEvents } from '@/lib/db/schema'
import type { AuditEntityType } from '@/lib/audit'
import type { JournalEvent } from '@/lib/journal'

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
}): BatchItem<'pg'> {
  return recordAuditEvent({
    clientId: v.clientId,
    entityType: 'journal',
    entityId: v.journalId,
    event: v.event,
    userId: v.userId,
    catatan: v.catatan,
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
