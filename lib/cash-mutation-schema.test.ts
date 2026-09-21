import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// Test STRUKTURAL atas migrasi 0018 — pola sama dengan lib/purchase-schema.test.ts.
//
// Tiga hal yang dijaga di sini tidak akan pernah muncul sebagai kegagalan test
// lain, dan ketiganya mahal kalau lolos:
//
//   1. **`cash_mutations` tidak menumbuhkan kolom `status` atau `sisa`.** Begitu
//      salah satunya ada, ia jadi sumber kebenaran kedua yang kalah diam-diam
//      terhadap alokasinya — alasan yang sama persis dengan D11 menolak tabel
//      saldo dan D27 menolak total invoice tersimpan.
//
//   2. **`fingerprint` TIDAK unik (D38).** Dua pembayaran identik pada hari yang
//      sama adalah hal yang nyata terjadi. Batasan unik di sini akan MENOLAK
//      transaksi yang benar — dan penolakannya akan terlihat seperti bug data,
//      bukan seperti aturan yang sengaja dipasang.
//
//   3. **CHECK debit/kredit SAMA PERSIS dengan `journal_lines`.** Jurnal mutasi
//      dibangun langsung dari sisi ini; aturan yang berbeda di dua tabel berarti
//      mutasi yang sah bisa menghasilkan jurnal yang ditolak, dan yang gagal
//      adalah tulisan TERAKHIR di batch — sesudah mutasinya tersimpan.

// CRLF dinormalkan: berkas di repo ini berakhiran CRLF, dan pola multi-baris di
// bawah akan diam-diam TIDAK PERNAH cocok kalau carriage return ikut terbawa —
// test yang tidak pernah cocok adalah test yang tidak pernah menjaga apa pun.
const read = (...p: string[]) =>
  readFileSync(join(process.cwd(), ...p), 'utf8').split('\r\n').join('\n')

const SCHEMA = read('lib', 'db', 'schema.ts')
const M0018 = read('lib', 'db', 'migrations', '0018_mutasi_kas.sql')
const JOURNAL = JSON.parse(read('lib', 'db', 'migrations', 'meta', '_journal.json')) as {
  entries: { idx: number; tag: string }[]
}

/** Potongan definisi satu tabel di schema.ts, dari pgTable sampai penutupnya. */
const tabel = (nama: string): string => {
  const mulai = SCHEMA.indexOf(`pgTable(\n  '${nama}',`)
  expect(mulai, `tabel ${nama} ada di schema.ts`).toBeGreaterThan(-1)
  const berikut = SCHEMA.indexOf('pgTable(', mulai + 10)
  return SCHEMA.slice(mulai, berikut > -1 ? berikut : undefined)
}

describe('0018 non-destruktif', () => {
  it('tidak ada satu pun statement yang membuang sesuatu', () => {
    for (const terlarang of ['DROP TABLE', 'DROP COLUMN', 'DROP CONSTRAINT', 'DROP TYPE', 'TRUNCATE', 'DELETE FROM']) {
      expect(M0018, terlarang).not.toContain(terlarang)
    }
  })

  it('hanya CREATE TABLE, ADD CONSTRAINT, dan CREATE INDEX', () => {
    const statements = M0018.split('--> statement-breakpoint')
      .map(x => x.trim())
      .filter(Boolean)
    expect(statements.length).toBeGreaterThan(0)
    for (const st of statements) {
      expect(
        st.startsWith('CREATE TABLE') ||
          st.startsWith('CREATE INDEX') ||
          /^ALTER TABLE "[a-z_]+" ADD CONSTRAINT/.test(st),
        st.slice(0, 70)
      ).toBe(true)
    }
  })

  it('TIDAK memuat ALTER TYPE — nilai enum mutasi_kas sudah lahir di 0016 (P8)', () => {
    expect(M0018).not.toContain('ALTER TYPE')
    expect(read('lib', 'db', 'migrations', '0016_enum_values.sql')).toContain("ADD VALUE 'mutasi_kas'")
  })

  it('terdaftar di _journal.json dengan tag yang sama dengan nama berkasnya', () => {
    const e = JOURNAL.entries.find(x => x.idx === 18)
    expect(e, 'entri idx 18 ada').toBeDefined()
    expect(e!.tag).toBe('0018_mutasi_kas')
  })

  it('ketiga tabel benar-benar dibuat', () => {
    for (const t of ['cash_mutations', 'cash_mutation_imports', 'cash_mutation_allocations']) {
      expect(M0018, t).toContain(`CREATE TABLE "${t}"`)
    }
  })
})

describe('cash_mutations tidak menyimpan yang bisa diturunkan (D37, P3)', () => {
  const T = tabel('cash_mutations')

  it('tidak ada kolom status, sisa, maupun terbayar', () => {
    for (const kolom of ["'status'", "'sisa'", "'terbayar'", "'sudah_dijurnal'"]) {
      expect(T, kolom).not.toContain(kolom)
    }
  })

  it('juga tidak ada di SQL migrasinya', () => {
    const blok = M0018.slice(
      M0018.indexOf('CREATE TABLE "cash_mutations"'),
      M0018.indexOf('ALTER TABLE "cash_mutation_allocations"')
    )
    for (const kolom of ['"status"', '"sisa"', '"terbayar"']) {
      expect(blok, kolom).not.toContain(kolom)
    }
  })

  it('saldo ADA tapi nullable — ia angka dari rekening koran, bukan hasil hitung', () => {
    expect(T).toContain("saldo: numeric('saldo'")
    // Kalau ia pernah jadi notNull, seseorang sedang memakainya sebagai saldo
    // yang berlaku — dan saldo yang berlaku datang dari buku besar.
    expect(T).not.toMatch(/saldo: numeric\('saldo'[^\n]*\)\.notNull\(\)/)
  })
})

describe('fingerprint = peringatan, bukan penolakan (D38)', () => {
  const T = tabel('cash_mutations')

  it('punya indeks fingerprint supaya pencarian duplikatnya murah', () => {
    expect(T).toContain("index('cash_mutations_fingerprint_idx')")
    expect(M0018).toContain('CREATE INDEX "cash_mutations_fingerprint_idx"')
  })

  it('TIDAK unik — dua pembayaran identik pada hari yang sama itu nyata', () => {
    expect(T).not.toContain("unique('cash_mutations_fingerprint")
    // Tidak ada UNIQUE apa pun di tabel ini selain primary key.
    const blok = M0018.slice(
      M0018.indexOf('CREATE TABLE "cash_mutations"'),
      M0018.indexOf('CREATE TABLE "cash_mutations"') + 2000
    )
    expect(blok).not.toContain('UNIQUE("fingerprint")')
  })
})

describe('CHECK debit/kredit — cermin journal_lines (D36)', () => {
  it('bentuknya sama persis: dua sisi tak negatif, tepat satu terisi', () => {
    const mutasi = tabel('cash_mutations')
    const lines = tabel('journal_lines')
    const pola = /\$\{table\.debit\} >= 0 AND \$\{table\.kredit\} >= 0 AND \(\(\$\{table\.debit\} = 0\) <> \(\$\{table\.kredit\} = 0\)\)/
    expect(mutasi, 'cash_mutations').toMatch(pola)
    expect(lines, 'journal_lines').toMatch(pola)
  })

  it('CHECK-nya benar-benar sampai ke SQL, bukan cuma di schema.ts', () => {
    expect(M0018).toContain('CONSTRAINT "cash_mutations_debit_kredit_check" CHECK')
  })
})

describe('alokasi — termin_urutan (D40) dan batas yang TIDAK bisa jadi CHECK', () => {
  const T = tabel('cash_mutation_allocations')

  it('termin_urutan NULLABLE — bawaannya FIFO, nol input', () => {
    expect(T).toContain("terminUrutan: integer('termin_urutan')")
    // notNull di kolom ini akan memaksa akunting memilih cicilan setiap kali,
    // dan FIFO berhenti jadi bawaan.
    expect(T).not.toContain("integer('termin_urutan').notNull()")
  })

  it('CHECK-nya membolehkan NULL dan menolak nol/negatif', () => {
    expect(T).toContain('IS NULL OR')
    expect(T).toContain('>= 1')
    expect(M0018).toContain('CONSTRAINT "cash_mutation_allocations_termin_check"')
  })

  it('nominal > 0 — alokasi nol bukan alokasi, ia baris yang menipu laporan', () => {
    expect(M0018).toContain('CONSTRAINT "cash_mutation_allocations_nominal_check" CHECK')
    expect(T).toContain('${table.nominal} > 0')
  })

  it('unique(mutation_id, invoice_id) — satu pasangan paling banyak sekali', () => {
    expect(M0018).toContain('UNIQUE("mutation_id","invoice_id")')
  })

  it('invoice RESTRICT, mutasi CASCADE — bukti pembayaran tidak ikut terhapus', () => {
    // Menghapus invoice yang sudah dibayar harus BERHENTI di sini. Menghapus
    // mutasinya memang menghapus alokasinya: alokasi tanpa mutasi tidak punya
    // arti apa pun.
    expect(M0018).toMatch(
      /cash_mutation_allocations_invoice_id_purchase_invoices_id_fk[\s\S]{0,160}ON DELETE restrict/
    )
    expect(M0018).toMatch(
      /cash_mutation_allocations_mutation_id_cash_mutations_id_fk[\s\S]{0,160}ON DELETE cascade/
    )
  })

  it('tiga batas lintas-baris DICATAT sebagai tugas route, bukan dianggap dijaga DB', () => {
    // Komentar ini yang mencegah orang berikutnya menyangka CHECK di atas sudah
    // menjaga Σ alokasi. Ketiganya lintas-baris/lintas-tabel dan tidak bisa
    // jadi CHECK.
    // Dicari di SCHEMA, bukan di potongan tabelnya: catatan ini hidup di
    // komentar DI ATAS definisi tabel, tempat orang membacanya lebih dulu.
    expect(SCHEMA).toContain('Σ alokasi ≤ nominal mutasi')
    expect(SCHEMA).toContain('Σ alokasi ≤ sisa invoice')
  })
})

describe('akun kas & jurnal — sambungan yang harus bertahan', () => {
  it('akun_kas_id NOT NULL dan RESTRICT di mutasi maupun catatan impornya', () => {
    for (const t of ['cash_mutations', 'cash_mutation_imports'] as const) {
      const T = tabel(t)
      expect(T, t).toMatch(/akunKasId: uuid\('akun_kas_id'\)\s*\n\s*\.notNull\(\)/)
      expect(T, t).toContain("onDelete: 'restrict'")
    }
  })

  it('journal_id punya indeksnya sendiri — pencarian MUNDUR untuk D32 (N6)', () => {
    // Arah tautannya terbalik dari arah FK, persis seperti purchase_invoices.
    // Tanpa indeks ini, tombol "Koreksi di Mutasi Kas" jadi pemindaian tabel.
    expect(M0018).toContain('CREATE INDEX "cash_mutations_journal_idx"')
  })

  it('akun_lawan_id nullable — mutasi boleh ada sebelum diputuskan lawannya', () => {
    const T = tabel('cash_mutations')
    expect(T).toContain("akunLawanId: uuid('akun_lawan_id')")
    expect(T).not.toContain("uuid('akun_lawan_id')\n      .notNull()")
  })

  it('import_id SET NULL — menghapus catatan impor tidak menghapus mutasinya', () => {
    expect(M0018).toMatch(
      /cash_mutations_import_id_cash_mutation_imports_id_fk[\s\S]{0,160}ON DELETE set null/
    )
  })
})
