import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// Test STRUKTURAL atas migrasi 0016 & 0017 — pola sama dengan
// lib/audit-schema.test.ts dan lib/coa/account-type-schema.test.ts.
//
// Dua hal yang dijaga di sini tidak pernah muncul sebagai kegagalan test lain:
//
//   1. **0016 HANYA berisi ADD VALUE.** Nilai enum yang baru ditambah tidak
//      boleh dipakai di transaksi yang sama (P8). Kalau seseorang kelak
//      menggabungkannya dengan DDL yang memakainya, migrasinya gagal DI TENGAH
//      — setelah sebagian objek terlanjur dibuat — dan drizzle tidak punya
//      rollback otomatis untuk itu. Preseden: 0007_role_finance.sql.
//
//   2. **purchase_invoices tidak menumbuhkan kolom total/sisa/status.** Begitu
//      salah satunya ada, ia jadi sumber kebenaran kedua yang kalah diam-diam
//      terhadap baris invoice — persis alasan D11 menolak tabel saldo.

const read = (...p: string[]) => readFileSync(join(process.cwd(), ...p), 'utf8')

const SCHEMA = read('lib', 'db', 'schema.ts')
const M0016 = read('lib', 'db', 'migrations', '0016_enum_values.sql')
const M0017 = read('lib', 'db', 'migrations', '0017_pembelian.sql')
const SNAP = JSON.parse(read('lib', 'db', 'migrations', 'meta', '0017_snapshot.json'))

describe('0016 — berkas ADD VALUE tersendiri (P8)', () => {
  it('SETIAP statement adalah ALTER TYPE … ADD VALUE, tanpa kecuali', () => {
    const statements = M0016.split('--> statement-breakpoint')
      .map(x => x.trim())
      .filter(Boolean)
    expect(statements.length).toBeGreaterThan(0)
    for (const st of statements) {
      expect(st, st.slice(0, 60)).toMatch(/^ALTER TYPE "public"\."[a-z_]+" ADD VALUE '[a-z_]+';?$/)
    }
  })

  it('tidak ada CREATE/ALTER TABLE, tidak ada pemakaian nilainya', () => {
    for (const terlarang of ['CREATE TABLE', 'ALTER TABLE', 'CREATE TYPE', 'INSERT', 'UPDATE']) {
      expect(M0016, terlarang).not.toContain(terlarang)
    }
  })

  it('empat nilai yang dibutuhkan modul pembelian & mutasi kas ada', () => {
    for (const v of ['pembelian', 'mutasi_kas', 'purchase_invoice', 'cash_mutation']) {
      expect(M0016, v).toContain(`ADD VALUE '${v}'`)
    }
  })

  it('0017 TIDAK berisi ADD VALUE — ia yang memakai nilainya', () => {
    expect(M0017).not.toContain('ADD VALUE')
  })
})

describe('0017 non-destruktif', () => {
  it('tidak ada DROP apa pun', () => {
    expect(M0017).not.toContain('DROP ')
  })

  it('setiap ADD COLUMN nullable — tidak menyentuh satu baris pun yang sudah ada', () => {
    const adds = M0017.match(/ALTER TABLE "[a-z_]+" ADD COLUMN[^;]*/g) ?? []
    expect(adds.length).toBeGreaterThan(0)
    for (const a of adds) expect(a, a).not.toContain('NOT NULL')
  })

  it('hanya tiga tabel baru yang dibuat', () => {
    const dibuat = [...M0017.matchAll(/CREATE TABLE "([a-z_]+)"/g)].map(m => m[1]).sort()
    expect(dibuat).toEqual([
      'client_accounting_settings',
      'purchase_invoice_lines',
      'purchase_invoices',
    ])
  })
})

// ══ PENJAGA BERDIRI: TOTAL/SISA/STATUS TIDAK PERNAH DISIMPAN (D27) ═══════
describe('purchase_invoices tidak menyimpan yang bisa diturunkan', () => {
  it('tidak ada kolom total, sisa, terbayar, maupun status', () => {
    const blok = SNAP.tables['public.purchase_invoices'].columns
    for (const terlarang of ['total', 'sisa', 'terbayar', 'status', 'lunas', 'sudah_dibayar']) {
      expect(Object.keys(blok), terlarang).not.toContain(terlarang)
    }
  })

  it('subtotal per BARIS memang disimpan — pengecualian sadar D28', () => {
    // qty boleh pecahan, jadi qty × harga punya pembulatan yang bergantung
    // urutan operasi. Rupiah baris itulah faktanya.
    const cols = SNAP.tables['public.purchase_invoice_lines'].columns
    expect(cols.subtotal.type).toBe('numeric(18, 2)')
    expect(cols.subtotal.notNull).toBe(true)
    expect(cols.qty.type).toBe('numeric(18, 4)')
  })
})

// ══ PENJAGA BERDIRI: AKUN DI-SNAPSHOT KE INVOICE (D30) ═══════════════════
describe('invoice menyimpan akun yang dipakainya', () => {
  it('keempat kolom akun ada di tabelnya', () => {
    const cols = Object.keys(SNAP.tables['public.purchase_invoices'].columns)
    for (const k of ['akun_tujuan_id', 'akun_kas_id', 'akun_hutang_id', 'akun_ppn_masukan_id']) {
      expect(cols, k).toContain(k)
    }
  })

  it('akun_tujuan_id NOT NULL, sisanya nullable menurut cara bayar', () => {
    const cols = SNAP.tables['public.purchase_invoices'].columns
    expect(cols.akun_tujuan_id.notNull).toBe(true)
    expect(cols.akun_hutang_id.notNull).toBe(false)
    expect(cols.akun_kas_id.notNull).toBe(false)
  })

  it('semuanya RESTRICT — akun yang dipakai invoice tidak boleh hilang', () => {
    for (const fk of ['akun_tujuan_id', 'akun_kas_id', 'akun_hutang_id', 'akun_ppn_masukan_id']) {
      const re = new RegExp(`FOREIGN KEY \\("${fk}"\\) REFERENCES "public"\\."master_coa"\\("id"\\) ON DELETE restrict`)
      expect(M0017, fk).toMatch(re)
    }
  })
})

describe('CHECK cara bayar & PPN — jaring terakhir di DB', () => {
  it('kredit wajib punya akun hutang DAN jatuh tempo', () => {
    const v = SNAP.tables['public.purchase_invoices'].checkConstraints[
      'purchase_invoices_cara_bayar_check'
    ].value as string
    expect(v).toContain('akun_hutang_id')
    expect(v).toContain('jatuh_tempo_akhir')
  })

  it('tunai wajib punya akun kas', () => {
    const v = SNAP.tables['public.purchase_invoices'].checkConstraints[
      'purchase_invoices_cara_bayar_check'
    ].value as string
    expect(v).toContain(`<> 'tunai'`)
    expect(v).toContain('akun_kas_id')
  })

  it('PPN > 0 wajib punya akun PPN Masukan, dan PPN tidak boleh negatif', () => {
    const v = SNAP.tables['public.purchase_invoices'].checkConstraints[
      'purchase_invoices_ppn_check'
    ].value as string
    expect(v).toContain('>= 0')
    expect(v).toContain('akun_ppn_masukan_id')
  })
})

describe('no_invoice — pelajaran no_bukti diulang (D29)', () => {
  it('nullable, dan uniknya per (klien, supplier, no_invoice)', () => {
    expect(SNAP.tables['public.purchase_invoices'].columns.no_invoice.notNull).toBe(false)
    expect(M0017).toContain(
      'CONSTRAINT "purchase_invoices_supplier_no_invoice_unique" UNIQUE("client_id","supplier_id","no_invoice")'
    )
  })

  it('schema.ts tidak pernah memberinya default string kosong', () => {
    expect(SCHEMA).toContain("noInvoice: text('no_invoice'),")
    expect(SCHEMA).not.toContain("text('no_invoice').default('')")
  })
})

describe('setelan pembukuan per klien (D42)', () => {
  it('posting_bisa_diedit bawaan FALSE', () => {
    const col = SNAP.tables['public.client_accounting_settings'].columns.posting_bisa_diedit
    expect(col.notNull).toBe(true)
    expect(String(col.default)).toBe('false')
    expect(SCHEMA).toContain("postingBisaDiedit: boolean('posting_bisa_diedit').notNull().default(false)")
  })

  it('client_id SEKALIGUS primary key — satu klien tepat satu baris', () => {
    expect(M0017).toContain('"client_id" uuid PRIMARY KEY NOT NULL')
  })
})

describe('audit_events mendapat nilai_sebelum & nilai_sesudah (D42)', () => {
  it('keduanya jsonb dan nullable', () => {
    const cols = SNAP.tables['public.audit_events'].columns
    for (const k of ['nilai_sebelum', 'nilai_sesudah']) {
      expect(cols[k].type, k).toBe('jsonb')
      expect(cols[k].notNull, k).toBe(false)
    }
  })

  it('bukan menumpang kolom catatan yang berisi prosa', () => {
    expect(SNAP.tables['public.audit_events'].columns.catatan.type).toBe('text')
  })
})

describe('data rekening supplier (D43)', () => {
  it('tiga kolom bank ditambahkan, dan nomor rekeningnya TEXT', () => {
    const cols = SNAP.tables['public.master_supplier'].columns
    // Nomor rekening bisa berawalan nol dan bukan sesuatu yang pernah dihitung.
    expect(cols.bank_rekening.type).toBe('text')
    expect(cols.bank_nama.type).toBe('text')
    expect(cols.bank_atas_nama.type).toBe('text')
  })

  it('termin_pembayaran BELUM dihapus di 0017 — itu tugas 0019', () => {
    // Satu-satunya migrasi non-aditif di seluruh Phase 5 sengaja berdiri
    // sendiri supaya bisa ditinjau, ditunda, atau dibatalkan tanpa menahan
    // 0015–0018. Syarat rilisnya ada di checklist ROADMAP.
    expect(M0017).not.toContain('DROP COLUMN')
    expect(Object.keys(SNAP.tables['public.master_supplier'].columns)).toContain('termin_pembayaran')
  })
})
