import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// Test STRUKTURAL atas definisi skema jurnal — pola sama dengan
// lib/contracts-api.test.ts, dipisah dari lib/journal.test.ts yang murni unit.
//
// Yang dijaga: jaring terakhir di DATABASE tetap sekuat aturan di lib. Ketiga
// berkas di bawah harus sepakat, dan kalau salah satunya berubah sendirian,
// perbedaannya tidak akan terlihat di test mana pun yang lain — validateJournalInput
// tetap hijau walau constraint-nya melemah, karena ia memang tidak menyentuh DB.
//
// Kejadian nyata yang melahirkannya (2026-09-15): bentuk pertama CHECK hanya
// menanyakan SISI MANA yang nol dan tidak pernah melihat tanda, sehingga baris
// debit -100 / kredit 0 lolos. Dua baris negatif pun masih bisa saling
// menyeimbangkan, jadi tidak ada pemeriksaan hilir yang akan menangkapnya.

const read = (...p: string[]) => readFileSync(join(process.cwd(), ...p), 'utf8')

const SCHEMA = read('lib', 'db', 'schema.ts')
const MIGRASI = read('lib', 'db', 'migrations', '0010_journals.sql')
const SNAPSHOT = read('lib', 'db', 'migrations', 'meta', '0010_snapshot.json')

describe('CHECK journal_lines menolak nominal negatif', () => {
  it('schema.ts menuntut kedua sisi >= 0', () => {
    expect(SCHEMA).toContain('${table.debit} >= 0 AND ${table.kredit} >= 0')
  })

  it('schema.ts tetap menuntut TEPAT satu sisi terisi', () => {
    expect(SCHEMA).toContain('((${table.debit} = 0) <> (${table.kredit} = 0))')
  })

  it('migrasi 0010 memuat syarat >= 0 untuk kedua kolom', () => {
    expect(MIGRASI).toContain('"journal_lines"."debit" >= 0')
    expect(MIGRASI).toContain('"journal_lines"."kredit" >= 0')
  })

  it('snapshot drizzle sepakat dengan migrasinya', () => {
    const snap = JSON.parse(SNAPSHOT)
    const value = snap.tables['public.journal_lines'].checkConstraints[
      'journal_lines_satu_sisi_check'
    ].value as string
    expect(value).toContain('"journal_lines"."debit" >= 0')
    expect(value).toContain('"journal_lines"."kredit" >= 0')
    expect(value).toContain('<>')
  })

  it('bentuk lama yang meloloskan negatif tidak boleh kembali', () => {
    // Bentuk lama persis: hanya perbandingan nol di kedua sisi, tanpa >= 0.
    const lama = 'CHECK (("journal_lines"."debit" = 0) <> ("journal_lines"."kredit" = 0))'
    expect(MIGRASI).not.toContain(lama)
  })
})

describe('kolom jurnal yang dipakai jalur ganti Master COA', () => {
  it('master_coa.kode bertipe text — muat nama sementara "~" + uuid (37 karakter)', () => {
    // Jalur rename sementara di POST /api/clients/[id]/coa bergantung pada ini.
    // Kalau kode pernah diubah jadi varchar berbatas, penggantian Master COA
    // pada klien yang punya jurnal akan gagal di tengah batch.
    expect(SCHEMA).toContain("kode: text('kode').notNull()")
  })

  it('journal_lines.master_coa_id NOT NULL dengan restrict — dasar kebijakan blokir', () => {
    expect(SCHEMA).toContain("masterCoaId: uuid('master_coa_id')")
    expect(SCHEMA).toContain("references(() => masterCoa.id, { onDelete: 'restrict' })")
  })
})

// Nomor bukti & keterangan jadi OPSIONAL lewat migrasi 0011 (keputusan Ricko
// 2026-09-16). Yang dikunci di sini bukan cuma "boleh null", tapi juga bahwa
// batasan UNIK-nya TIDAK ikut dilonggarkan: nomor bukti yang terisi tetap wajib
// unik per klien, dan yang kosong disimpan NULL sehingga tidak saling bentrok.
describe('no_bukti & keterangan opsional (migrasi 0011)', () => {
  const MIGRASI_0011 = read('lib', 'db', 'migrations', '0011_journal_no_bukti_opsional.sql')

  it('skema tidak lagi menandai keduanya notNull', () => {
    expect(SCHEMA).toContain("noBukti: text('no_bukti'),")
    expect(SCHEMA).toContain("keterangan: text('keterangan'),")
    expect(SCHEMA).not.toContain("noBukti: text('no_bukti').notNull()")
  })

  it('migrasi 0011 hanya melepas NOT NULL, tidak menyentuh yang lain', () => {
    expect(MIGRASI_0011).toContain('ALTER COLUMN "no_bukti" DROP NOT NULL')
    expect(MIGRASI_0011).toContain('ALTER COLUMN "keterangan" DROP NOT NULL')
    expect(MIGRASI_0011).not.toContain('DROP CONSTRAINT')
    expect(MIGRASI_0011).not.toContain('CREATE TABLE')
  })

  it('batasan unik nomor bukti per klien TETAP ADA di skema', () => {
    // Inilah yang membuat normalisasi ke NULL (bukan '') jadi penting.
    expect(SCHEMA).toContain("unique('journal_entries_client_no_bukti_unique')")
  })
})
