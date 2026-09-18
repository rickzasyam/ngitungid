import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { AUDIT_ENTITY_TYPES } from './audit'

// Test STRUKTURAL atas `audit_events` — pola sama dengan lib/journal-schema.test.ts.
//
// ══ KENAPA TABEL INI BUTUH PENJAGA LEBIH KERAS DARI TABEL LAIN ═══════════
// `entity_id` POLIMORFIK, jadi ia tidak punya foreign key. Setiap jaminan yang
// biasanya dikerjakan Postgres — "menunjuk baris yang ada", "ikut terhapus
// bersama induknya" — di sini dikerjakan oleh kode dan hanya oleh kode. Yang
// tersisa untuk database cuma dua: enum entity_type dan CHECK entity_id. Kalau
// salah satunya luruh, tidak ada satu pun test perilaku yang akan merah, karena
// tidak ada perilaku yang berubah sampai datanya sudah telanjur rusak.

const read = (...p: string[]) => readFileSync(join(process.cwd(), ...p), 'utf8')

const SCHEMA = read('lib', 'db', 'schema.ts')
const MIGRASI = read('lib', 'db', 'migrations', '0014_posting_events_supplier_link.sql')
const SNAPSHOT = read('lib', 'db', 'migrations', 'meta', '0014_snapshot.json')

describe('entity_type adalah ENUM, bukan text', () => {
  it('schema.ts mendeklarasikan pgEnum audit_entity_type', () => {
    expect(SCHEMA).toContain("pgEnum('audit_entity_type'")
    expect(SCHEMA).toContain("entityType: auditEntityTypeEnum('entity_type').notNull()")
  })

  it('nilai enum di DB sama persis dengan AUDIT_ENTITY_TYPES di lib', () => {
    // Dua daftar untuk satu himpunan: yang di lib dipakai TypeScript, yang di DB
    // dipakai Postgres. Kalau salah satu bertambah sendirian, jalur tulisnya
    // gagal pada runtime — di jalan yang hanya dilewati fitur baru.
    const m = MIGRASI.match(/CREATE TYPE "public"\."audit_entity_type" AS ENUM\(([^)]*)\)/)
    expect(m, 'CREATE TYPE audit_entity_type ada di migrasi').not.toBeNull()
    const nilai = m![1].split(',').map(s => s.trim().replace(/^'|'$/g, ''))
    expect(nilai).toEqual([...AUDIT_ENTITY_TYPES])
  })
})

describe('CHECK entity_id wajib untuk entitas journal', () => {
  it('schema.ts memuat constraint-nya', () => {
    expect(SCHEMA).toContain('audit_events_entity_id_check')
    expect(SCHEMA).toContain("${table.entityType} <> 'journal' OR ${table.entityId} IS NOT NULL")
  })

  it('migrasi 0014 benar-benar membuatnya', () => {
    expect(MIGRASI).toContain('CONSTRAINT "audit_events_entity_id_check" CHECK')
    expect(MIGRASI).toContain(`"audit_events"."entity_type" <> 'journal'`)
    expect(MIGRASI).toContain('"audit_events"."entity_id" IS NOT NULL')
  })

  it('snapshot drizzle sepakat dengan migrasinya', () => {
    const snap = JSON.parse(SNAPSHOT)
    const value = snap.tables['public.audit_events'].checkConstraints[
      'audit_events_entity_id_check'
    ].value as string
    expect(value).toContain(`<> 'journal'`)
    expect(value).toContain('IS NOT NULL')
  })
})

describe('index riwayat per entitas', () => {
  it('(entity_type, entity_id, at) — urutan kolomnya bermakna', () => {
    // Query riwayat SELALU "entitas ini, terbaru dulu". Index yang dimulai dari
    // `at` tidak akan terpakai untuk itu.
    expect(MIGRASI).toContain(
      'CREATE INDEX "audit_events_entity_idx" ON "audit_events" USING btree ("entity_type","entity_id","at")'
    )
  })
})

describe('kolom Fase 2 di journal_entries & journal_lines', () => {
  it('ADD COLUMN nullable semua — tidak menyentuh satu baris pun yang sudah ada', () => {
    for (const kolom of ['posted_at', 'posted_by', 'reversal_of_id']) {
      const re = new RegExp(`ALTER TABLE "journal_entries" ADD COLUMN "${kolom}"[^;]*`)
      const m = MIGRASI.match(re)
      expect(m, kolom).not.toBeNull()
      expect(m![0], kolom).not.toContain('NOT NULL')
    }
    const supplier = MIGRASI.match(/ALTER TABLE "journal_lines" ADD COLUMN "supplier_id"[^;]*/)
    expect(supplier).not.toBeNull()
    expect(supplier![0]).not.toContain('NOT NULL')
  })

  it('reversal_of_id RESTRICT, bukan cascade', () => {
    // Cascade akan membuat penghapusan jurnal asli ikut menghapus pembaliknya —
    // entri tersendiri yang bisa saja sudah terposting dan sudah masuk buku.
    expect(MIGRASI).toContain(
      'ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_reversal_of_id_fk" FOREIGN KEY ("reversal_of_id") REFERENCES "public"."journal_entries"("id") ON DELETE restrict'
    )
  })

  it('supplier_id RESTRICT — supplier yang dipakai jurnal tidak boleh hilang', () => {
    expect(MIGRASI).toContain(
      'FOREIGN KEY ("supplier_id") REFERENCES "public"."master_supplier"("id") ON DELETE restrict'
    )
  })
})

describe('migrasi 0014 tidak membuat ulang objek yang sudah ada', () => {
  it('tidak ada CREATE TABLE selain audit_events', () => {
    // Gotcha #8 CLAUDE.md: snapshot 0006–0009 hilang, dan hasil db:generate
    // pernah memuat pembuatan ulang tabel yang sudah jalan. Statement pertama
    // seperti itu pasti gagal di database mana pun yang sudah berisi.
    const dibuat = [...MIGRASI.matchAll(/CREATE TABLE "([a-z_]+)"/g)].map(m => m[1])
    expect(dibuat).toEqual(['audit_events'])
  })

  it('tidak ada DROP apa pun', () => {
    expect(MIGRASI).not.toContain('DROP ')
  })
})
