import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ACCOUNT_TYPES } from './account-type'

// Test STRUKTURAL atas migrasi 0015 — pola sama dengan lib/audit-schema.test.ts.
//
// Yang dijaga di sini tidak muncul di nilai kembalian mana pun:
//   1. `tipe_akun` tetap NULLABLE. Begitu ia NOT NULL dengan default, seluruh
//      COA yang sudah ada mengaku punya tipe eksplisit yang tidak pernah
//      dipilih siapa pun — dan perbedaan antara "dipilih akunting" dan
//      "ditebak sistem" hilang selamanya, termasuk dari explicitVsDerivedDiff.
//   2. TIDAK ADA kolom normal balance / arus kas baru (D14). `posisi` dan
//      `class_cf` sudah menyimpan keduanya; kolom kedua untuk fakta yang sama
//      adalah dua jawaban yang bisa berbeda tanpa aturan yang memutuskan.

const read = (...p: string[]) => readFileSync(join(process.cwd(), ...p), 'utf8')

const SCHEMA = read('lib', 'db', 'schema.ts')
const MIGRASI = read('lib', 'db', 'migrations', '0015_coa_account_type.sql')
const SNAPSHOT = read('lib', 'db', 'migrations', 'meta', '0015_snapshot.json')

describe('enum account_type', () => {
  it('nilai di DB sama persis dengan ACCOUNT_TYPES di lib', () => {
    const m = MIGRASI.match(/CREATE TYPE "public"\."account_type" AS ENUM\(([^)]*)\)/)
    expect(m, 'CREATE TYPE account_type ada').not.toBeNull()
    const nilai = m![1].split(',').map(s => s.trim().replace(/^'|'$/g, ''))
    expect(nilai).toEqual([...ACCOUNT_TYPES])
  })

  it('CREATE TYPE, bukan ADD VALUE — enum baru boleh dipakai di migrasi yang sama', () => {
    expect(MIGRASI).toContain('CREATE TYPE "public"."account_type"')
    expect(MIGRASI).not.toContain('ALTER TYPE "public"."account_type"')
  })
})

describe('tipe_akun NULLABLE, is_kas NOT NULL default false', () => {
  it('migrasi menambah tipe_akun tanpa NOT NULL dan tanpa DEFAULT', () => {
    const m = MIGRASI.match(/ALTER TABLE "master_coa" ADD COLUMN "tipe_akun"[^;]*/)
    expect(m).not.toBeNull()
    expect(m![0]).not.toContain('NOT NULL')
    expect(m![0]).not.toContain('DEFAULT')
  })

  it('is_kas NOT NULL DEFAULT false — pertanyaan ya/tidak, bukan "belum diisi"', () => {
    expect(MIGRASI).toContain('ADD COLUMN "is_kas" boolean DEFAULT false NOT NULL')
  })

  it('schema.ts sepakat', () => {
    expect(SCHEMA).toContain("tipeAkun: accountTypeEnum('tipe_akun')")
    expect(SCHEMA).toContain("isKas: boolean('is_kas').notNull().default(false)")
    // Bentuk yang dilarang: tipe_akun yang tidak boleh kosong.
    expect(SCHEMA).not.toContain("accountTypeEnum('tipe_akun').notNull()")
  })

  it('snapshot drizzle sepakat dengan migrasinya', () => {
    const snap = JSON.parse(SNAPSHOT)
    const cols = snap.tables['public.master_coa'].columns
    expect(cols.tipe_akun.notNull).toBe(false)
    expect(cols.is_kas.notNull).toBe(true)
    expect(String(cols.is_kas.default)).toBe('false')
  })
})

// ══ PENJAGA BERDIRI: D14 — SATU KOLOM BARU, BUKAN TIGA ═══════════════════
describe('tidak ada kolom normal balance / arus kas baru', () => {
  it('master_coa tidak menumbuhkan kolom yang menduplikasi posisi atau class_cf', () => {
    for (const terlarang of ['normal_balance', 'saldo_normal', 'cashflow_class', 'class_cf_baru']) {
      expect(MIGRASI, terlarang).not.toContain(terlarang)
      expect(SCHEMA, terlarang).not.toContain(terlarang)
    }
  })

  it('migrasi 0015 hanya menyentuh master_coa, dan tanpa DROP', () => {
    const tabel = [...MIGRASI.matchAll(/ALTER TABLE "([a-z_]+)"/g)].map(m => m[1])
    expect([...new Set(tabel)]).toEqual(['master_coa'])
    expect(MIGRASI).not.toContain('CREATE TABLE')
    expect(MIGRASI).not.toContain('DROP ')
  })
})

describe('index daftar akun kas', () => {
  it('parsial — hanya baris is_kas, bukan seluruh COA klien', () => {
    // Akun kas segelintir dari ratusan baris COA; index penuh akan memuat
    // mayoritas baris yang tidak pernah ikut dalam jawabannya.
    expect(MIGRASI).toContain(
      'CREATE INDEX "master_coa_client_is_kas_idx" ON "master_coa" USING btree ("client_id") WHERE "master_coa"."is_kas"'
    )
  })
})
