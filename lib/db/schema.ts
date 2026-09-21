import { relations, sql } from 'drizzle-orm'
import {
  pgTable,
  pgEnum,
  uuid,
  text,
  numeric,
  integer,
  boolean,
  date,
  timestamp,
  jsonb,
  unique,
  uniqueIndex,
  index,
  primaryKey,
  foreignKey,
  check,
  customType,
} from 'drizzle-orm/pg-core'

// Postgres bytea — drizzle pg-core tidak punya helper bawaan; simpan Buffer
// (byte PDF asli untuk preview split-screen di extraction-review).
const bytea = customType<{ data: Buffer; default: false }>({
  dataType() {
    return 'bytea'
  },
})

// ── Enums ────────────────────────────────────────────────────
// Nilai stabil, dipakai di banyak tempat kode (UI state machine,
// filter tabs) — perubahan value = perubahan kode juga.

export const reportTypeEnum = pgEnum('report_type', ['laba_rugi', 'neraca', 'arus_kas'])

export const reportStatusEnum = pgEnum('report_status', [
  'uploaded',
  'extracting',
  'review',
  'mapped',
  'confirmed',
])

export const lineItemStatusEnum = pgEnum('line_item_status', [
  'matched',
  'unmatched',
  'edited',
  'rejected',
])

// Urutan nilai SENGAJA mengikuti urutan fisik enum di Postgres setelah migrasi
// 0003: 'admin' di-RENAME jadi 'akunting' (tetap di posisi lama), lalu 'owner'
// di-ADD (masuk paling belakang). Jangan diurut ulang — drizzle-kit akan
// menganggapnya perubahan tipe.
//
// owner    : tingkat tertinggi — bisa buat akun & assign akunting ke klien,
//            PLUS semua kemampuan akunting.
// akunting : upload, review, mapping, kelola klien, lihat semua klien.
//            (dulu bernama 'admin' — fungsinya sama).
// user     : klien, read-only Dashboard + Analytics. TIDAK berubah.
// 'finance' ditambahkan 2026-08-06 lewat migrasi 0007 (ALTER TYPE ... ADD VALUE).
// Urutan di sini HARUS sama dengan urutan nilai di Postgres.
export const userRoleEnum = pgEnum('user_role', ['akunting', 'user', 'owner', 'finance'])

// Bahasa antarmuka per-user. Daftarnya memang tertutup, jadi enum tepat di sini.
// CATATAN: kolomnya SUDAH tersimpan & bertahan, tapi BELUM punya efek
// penerjemahan apa pun — i18n adalah Task 4.
export const userLanguageEnum = pgEnum('user_language', ['id', 'en'])

// Jenis kontrak — daftar TERTUTUP dari brief, jadi enum tepat di sini.
// reguler : berulang/retainer, ditagih tiap bulan pada tanggalPenagihan
// project : sekali jalan, berbatas tanggalMulai–tanggalAkhir
export const jenisKontrakEnum = pgEnum('jenis_kontrak', ['reguler', 'project'])

// ── Enum jurnal (Phase 5 — Mesin Akuntansi) ──────────────────
// journal_status: KEPUTUSAN manusia, bukan turunan. Ini pengecualian sadar dari
// pola "status diturunkan" (contracts.status tidak disimpan karena ia fungsi
// dari tanggal): tidak ada tanggal atau data apa pun yang bisa memberitahu
// apakah seorang akunting sudah memutuskan jurnal ini final. 'draft' boleh
// diubah & dihapus, 'posted' tidak boleh dua-duanya — hanya dibalik (Fase 2).
//
// KEDUA nilai ada sejak migrasi pertama meski Fase 1 hanya memakai 'draft':
// menambah 'posted' nanti berarti ALTER TYPE ... ADD VALUE, dan nilai enum yang
// baru di-ADD tidak boleh dipakai di transaksi yang sama (lihat 0007) — mahal
// tanpa alasan untuk nilai yang sudah pasti datang.
export const journalStatusEnum = pgEnum('journal_status', ['draft', 'posted'])

// journal_source: dari mana jurnal lahir. 'manual' sejak 0010; 'pembelian' &
// 'mutasi_kas' ditambah 0016. Nilai berikutnya ('marketplace', 'kas_kecil',
// 'opening_balance') menyusul per fase lewat ALTER TYPE ... ADD VALUE —
// preseden 0003/0007.
//
// ══ ADD VALUE SELALU BERKAS MIGRASI TERSENDIRI (P8) ══════════════════════
// Nilai enum yang baru di-ADD TIDAK BOLEH dipakai di transaksi yang sama.
// Menggabungkannya dengan DDL yang memakainya membuat migrasi gagal DI TENGAH,
// setelah sebagian objek terlanjur dibuat — dan drizzle tidak punya rollback
// otomatis untuk itu. Karena itu 0016 berisi ADD VALUE saja, dan 0017 yang
// memakainya menyusul terpisah.
//
// JANGAN pula biarkan drizzle-kit me-recreate enum ini: untuk perubahan enum ia
// membuat kolom jadi text → DROP TYPE → CREATE TYPE → cast balik, yang pasti
// gagal di database yang sudah ada isinya. Hasil 0016 sudah diperiksa: ia
// benar-benar memancarkan empat ALTER TYPE ... ADD VALUE, bukan recreate.
export const journalSourceEnum = pgEnum('journal_source', ['manual', 'pembelian', 'mutasi_kas'])

// audit_entity_type: entitas mana yang diriwayatkan sebuah baris audit_events.
//
// ENUM, bukan text — dan itu SENGAJA berbeda dari kolom `event` di tabel yang
// sama. Dua kolom itu berbeda sifat: daftar `event` tumbuh tiap fase (D12), jadi
// enum di sana berarti migrasi berulang; daftar ENTITAS tertutup dan sudah
// diketahui seluruhnya. Perbedaan yang dibayar enum di sini adalah salah ketik:
// 'jurnal' alih-alih 'journal' pada kolom text akan tersimpan diam-diam, dan
// riwayatnya lenyap dari layar tanpa satu pun galat — persis kegagalan yang
// tidak punya FK untuk menangkapnya (lihat catatan entity_id di audit_events).
export const auditEntityTypeEnum = pgEnum('audit_entity_type', [
  'journal',
  'master_coa',
  'period_lock',
  'supplier',
  // Ditambah migrasi 0016 (ADD VALUE tulis tangan, berkas tersendiri — P8).
  'purchase_invoice',
  'cash_mutation',
])

// account_type: golongan akun dalam persamaan akuntansi (D14).
//
// ══ HANYA SATU KOLOM BARU, BUKAN TIGA ═════════════════════════════════════
// PRD "Master COA Bertipe" menyiratkan tiga kolom baru: tipe akun, normal
// balance, dan klasifikasi arus kas. DUA di antaranya SUDAH ADA di master_coa
// sejak migrasi pertama: `posisi` (Debit/Kredit) adalah normal balance, dan
// `class_cf` (Operating/Investing/Funding) adalah klasifikasi arus kas.
// Menambahkannya lagi berarti dua kolom untuk satu fakta — dan begitu keduanya
// bisa berbeda, tidak ada aturan yang bisa memutuskan mana yang benar.
//
// Nilainya lima dan tertutup: persamaan akuntansi tidak bertambah golongan.
// Karena itu enum, bukan text — beda dari `audit_events.event` yang daftarnya
// memang tumbuh tiap fase.
export const accountTypeEnum = pgEnum('account_type', [
  'asset',
  'liability',
  'equity',
  'revenue',
  'expense',
])

// purchase_payment_method: cara bayar invoice pembelian (D27).
// CREATE TYPE baru — boleh dipakai di migrasi yang sama dengan tabelnya, beda
// dari ADD VALUE ke enum yang sudah ada (P8).
export const purchasePaymentMethodEnum = pgEnum('purchase_payment_method', ['kredit', 'tunai'])

// ── clients ──────────────────────────────────────────────────
// logo disimpan sebagai bytea DI DALAM DB, sama seperti financial_reports
// .source_pdf. Alasannya sama: file-nya kecil (logo klien lazimnya < 200KB,
// dibatasi MAX_LOGO_BYTES di route) sehingga TOAST aman, dan kita tidak perlu
// menambah akun/kredensial object storage baru. logoMime disimpan supaya
// endpoint GET bisa mengirim Content-Type yang benar (png/jpeg/svg/webp) —
// tanpa itu browser harus menebak.
export const clients = pgTable('clients', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  type: text('type').notNull(),
  logo: bytea('logo'),
  logoMime: text('logo_mime'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

// ── master_coa ───────────────────────────────────────────────
// posisi/kelompok/subKelompok/classCf tetap text: data di-import dari
// Excel klien dan masih berpotensi berubah per-klien (butuh
// normalize-on-write, enum Postgres terlalu kaku untuk ini).
export const masterCoa = pgTable(
  'master_coa',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    clientId: uuid('client_id')
      .notNull()
      .references(() => clients.id, { onDelete: 'cascade' }),
    kode: text('kode').notNull(),
    nama: text('nama').notNull(),
    posisi: text('posisi').notNull(), // 'Debit' | 'Kredit'
    kelompok: text('kelompok').notNull(), // 'Laba Rugi' | 'Neraca'
    subKelompok: text('sub_kelompok').notNull(), // 'Aktiva Lancar', 'Fixed Cost', dst
    classCf: text('class_cf'), // 'Operating' | 'Investing' | 'Funding', nullable
    // ── Fase 2, migrasi 0015 (D14) ─────────────────────────────
    // NULLABLE dengan sengaja: null berarti "belum diisi manusia", dan tipenya
    // DITURUNKAN dari kelompok/sub kelompok (lib/coa/account-type.ts). Kalau
    // kolom ini NOT NULL dengan default, seluruh COA yang sudah ada akan
    // mengaku punya tipe eksplisit yang tidak pernah dipilih siapa pun — dan
    // perbedaan antara "dipilih akunting" dan "ditebak sistem" hilang selamanya.
    // Itu perbedaan yang justru ingin ditampilkan di layar (E4: eksplisit tebal,
    // turunan redup) dan diperingatkan bila keduanya bertentangan.
    tipeAkun: accountTypeEnum('tipe_akun'),
    // Akun kas/bank. NOT NULL default false — beda dari tipeAkun, karena ini
    // pertanyaan ya/tidak yang jawabannya "tidak" untuk hampir semua akun, dan
    // turunannya (aktiva lancar + nama memuat kas/bank) sudah cukup baik
    // sebagai isian awal. Dipakai impor mutasi kas (§5.E) dan arus kas metode
    // langsung (§7.C) untuk mengenali akun kas tanpa menebak dari namanya.
    isKas: boolean('is_kas').notNull().default(false),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    unique('master_coa_client_kode_unique').on(table.clientId, table.kode),
    index('master_coa_client_id_idx').on(table.clientId),
    // Daftar akun kas ditanya per klien tiap kali halaman mutasi kas dibuka.
    // Parsial: yang dicari selalu `is_kas = true`, dan akun kas segelintir dari
    // ratusan baris COA — index penuh akan memuat mayoritas baris yang tidak
    // pernah ikut dalam jawabannya.
    index('master_coa_client_is_kas_idx')
      .on(table.clientId)
      .where(sql`${table.isKas}`),
  ]
)

// ── financial_reports ────────────────────────────────────────
// unique(client, report_type, period) mencegah upload duplikat periode
// yang sama — sesuai UX Upload page (client + periode + tipe laporan).
export const financialReports = pgTable(
  'financial_reports',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    clientId: uuid('client_id')
      .notNull()
      .references(() => clients.id, { onDelete: 'cascade' }),
    reportType: reportTypeEnum('report_type').notNull(),
    periodStart: date('period_start').notNull(),
    periodEnd: date('period_end').notNull(),
    sourceFileName: text('source_file_name').notNull(),
    // Byte PDF asli (nullable) — dipakai preview kiri di extraction-review.
    // Null untuk sumber non-PDF (mis. CSV/Excel nanti).
    sourcePdf: bytea('source_pdf'),
    status: reportStatusEnum('status').notNull().default('uploaded'),
    extractedAt: timestamp('extracted_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    unique('financial_reports_client_type_period_unique').on(
      table.clientId,
      table.reportType,
      table.periodStart,
      table.periodEnd
    ),
    index('financial_reports_client_type_period_idx').on(
      table.clientId,
      table.reportType,
      table.periodStart
    ),
  ]
)

// ── report_line_items ────────────────────────────────────────
export const reportLineItems = pgTable(
  'report_line_items',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    reportId: uuid('report_id')
      .notNull()
      .references(() => financialReports.id, { onDelete: 'cascade' }),
    rawName: text('raw_name').notNull(),
    suggestedCoaId: uuid('suggested_coa_id').references(() => masterCoa.id, {
      onDelete: 'set null',
    }),
    masterCoaId: uuid('master_coa_id').references(() => masterCoa.id, {
      onDelete: 'restrict',
    }),
    amount: numeric('amount', { precision: 18, scale: 2 }).notNull(),
    isSubtotal: boolean('is_subtotal').notNull().default(false),
    confidence: integer('confidence'), // 0-100, nullable
    status: lineItemStatusEnum('status').notNull().default('unmatched'),
    editedName: text('edited_name'),
    lineOrder: integer('line_order').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    index('report_line_items_report_id_idx').on(table.reportId),
    index('report_line_items_master_coa_id_idx').on(table.masterCoaId),
  ]
)

// ── coa_mapping_history ──────────────────────────────────────
// Fondasi fuzzy-match-with-history-boost (Phase 2.5) — upsert on
// repeat confirmation, unique constraint jadi target atomic upsert.
export const coaMappingHistory = pgTable(
  'coa_mapping_history',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    clientId: uuid('client_id')
      .notNull()
      .references(() => clients.id, { onDelete: 'cascade' }),
    rawName: text('raw_name').notNull(),
    masterCoaId: uuid('master_coa_id')
      .notNull()
      .references(() => masterCoa.id, { onDelete: 'cascade' }),
    confirmedCount: integer('confirmed_count').notNull().default(1),
    lastConfirmedAt: timestamp('last_confirmed_at').defaultNow().notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    unique('coa_mapping_history_client_raw_name_unique').on(table.clientId, table.rawName),
  ]
)

// ── client_metric_visibility ─────────────────────────────────
// metricId cocok dengan id di METRIC_CATEGORIES (app/settings/page.tsx)
// — mis. 'cr', 'qr', 'roe'. Struktur kategori tetap di frontend.
export const clientMetricVisibility = pgTable(
  'client_metric_visibility',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    clientId: uuid('client_id')
      .notNull()
      .references(() => clients.id, { onDelete: 'cascade' }),
    metricId: text('metric_id').notNull(),
    isVisible: boolean('is_visible').notNull().default(true),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    unique('client_metric_visibility_client_metric_unique').on(table.clientId, table.metricId),
  ]
)

// ── users ────────────────────────────────────────────────────
// clientId null = staf internal (owner/akunting, akses semua klien), terisi =
// role 'user' dipin ke 1 klien.
// onDelete restrict: klien tidak boleh terhapus diam-diam selama masih
// ada user yang terikat ke situ.
export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  name: text('name').notNull(),
  role: userRoleEnum('role').notNull().default('user'),
  clientId: uuid('client_id').references(() => clients.id, { onDelete: 'restrict' }),
  // ── Preferensi tampilan per-user (migrasi 0006) ──
  // Per-USER, bukan per-klien/global: bahasa itu preferensi pribadi, dan akan
  // ada 4 akunting + akun klien yang boleh berbeda. Konsistensi laporan yang
  // dilihat klien dijaga di titik EKSPOR, bukan dengan menyeragamkan layar.
  language: userLanguageEnum('language').notNull().default('id'),
  // `text`, bukan enum — kalau keduanya enum dan sama-sama default 'id', nilai
  // 'id' berarti dua hal berbeda di satu baris. 'idr' terbaca tanpa ambiguitas.
  // Nilai divalidasi di PUT /api/account/preferences (lib/api/preferences.ts).
  // FORMAT TAMPILAN saja: 'idr' → Rp 1.234.567, 'intl' → IDR 1,234,567.
  // Tidak pernah konversi mata uang — semua nilai di sistem ini Rupiah.
  currencyFormat: text('currency_format').notNull().default('idr'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

// ── layanan ──────────────────────────────────────────────────
// Master jasa yang dijual — GLOBAL, bukan per-klien: layanan yang sama dijual
// lintas klien. (Bandingkan master_coa yang memang per-klien.)
//
// TIDAK PERNAH DIHAPUS. Kontrak mencatat layanan apa yang dijual; menghapus
// sebuah layanan akan melubangi setiap kontrak lama yang memuatnya. Hanya ada
// penanda `aktif`: false menyembunyikannya dari picker kontrak BARU, sementara
// kontrak yang sudah memakainya tetap menampilkannya normal.
// Tidak ada endpoint DELETE — jangan dibuat.
export const layanan = pgTable('layanan', {
  id: uuid('id').defaultRandom().primaryKey(),
  nama: text('nama').notNull().unique('layanan_nama_unique'),
  deskripsi: text('deskripsi'),
  aktif: boolean('aktif').notNull().default(true),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

// ── contracts ────────────────────────────────────────────────
// Kontrak klien + dokumen PDF-nya.
//
// dokumen disimpan bytea DI DALAM DB, sama seperti financial_reports.source_pdf
// (keputusan 2026-08-06): kontrak 1-2 per klien per tahun vs 12 laporan, jadi
// volumenya strictly lebih kecil daripada yang sudah dibawa mekanisme sekarang.
// KOLOM INI TIDAK BOLEH IKUT DI QUERY DAFTAR — selalu pilih kolom eksplisit,
// jangan pernah select *. Satu daftar kontrak yang tak sengaja menarik blob
// akan menyeret puluhan MB lewat serverless function.
//
// STATUS TIDAK DISIMPAN. Aktif/akan datang/berakhir DITURUNKAN dari
// tanggalMulai–tanggalAkhir terhadap hari ini (lib/contracts.ts). Kolom status
// akan langsung basi begitu tanggal lewat tanpa ada yang menulis ulang.
//
// noKontrak unik PER KLIEN, bukan global: dua klien berbeda boleh saja memakai
// penomoran yang kebetulan sama, dan memaksakan unik global akan menolak
// kontrak yang sah.
export const contracts = pgTable(
  'contracts',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    clientId: uuid('client_id')
      .notNull()
      .references(() => clients.id, { onDelete: 'cascade' }),
    noKontrak: text('no_kontrak').notNull(),
    jenis: jenisKontrakEnum('jenis').notNull(),
    // `date`, PERSIS seperti period_start/period_end. Sampai ke UI sebagai
    // string 'YYYY-MM-DD' dan HARUS diperlakukan sebagai string sampai akhir —
    // jangan pernah new Date()/Intl/toISOString di atasnya. Lihat lib/contracts.ts.
    tanggalMulai: date('tanggal_mulai').notNull(),
    tanggalAkhir: date('tanggal_akhir').notNull(),
    // Hari dalam bulan (1-31) untuk penagihan. Integer, bukan date: ini pola
    // berulang, bukan satu tanggal tertentu.
    tanggalPenagihan: integer('tanggal_penagihan').notNull(),
    // numeric(18,2) — SAMA dengan report_line_items.amount. Driver
    // mengembalikannya sebagai STRING, jadi nilainya tidak pernah lewat float
    // JS; konversi ke number dilakukan eksplisit di titik pakai.
    nominal: numeric('nominal', { precision: 18, scale: 2 }).notNull(),
    dokumen: bytea('dokumen').notNull(),
    namaDokumen: text('nama_dokumen').notNull(),
    ukuranDokumen: integer('ukuran_dokumen').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    unique('contracts_client_no_kontrak_unique').on(table.clientId, table.noKontrak),
    index('contracts_client_id_idx').on(table.clientId),
  ]
)

// ── contract_layanan ─────────────────────────────────────────
// Satu kontrak memuat banyak layanan.
//
// onDelete BERBEDA di dua sisi, dan itu disengaja:
//   contractId → CASCADE  : hapus kontrak, baris penghubungnya ikut hilang.
//   layananId  → RESTRICT : PERTAHANAN TERAKHIR aturan "layanan tidak pernah
//                           dihapus". Tidak ada endpoint DELETE untuk layanan,
//                           tapi kalau suatu hari ada yang menambahkannya,
//                           Postgres yang akan menolak selama masih ada kontrak
//                           yang memakainya. JANGAN diubah jadi CASCADE.
export const contractLayanan = pgTable(
  'contract_layanan',
  {
    contractId: uuid('contract_id')
      .notNull()
      .references(() => contracts.id, { onDelete: 'cascade' }),
    layananId: uuid('layanan_id')
      .notNull()
      .references(() => layanan.id, { onDelete: 'restrict' }),
  },
  (table) => [
    primaryKey({ columns: [table.contractId, table.layananId] }),
    index('contract_layanan_layanan_id_idx').on(table.layananId),
  ]
)

// ── client_assignments ───────────────────────────────────────
// Catatan "siapa pegang klien apa" — MURNI TRACKING/organisasi. Tabel ini
// TIDAK dipakai untuk membatasi akses: semua akunting tetap boleh membuka &
// mengedit semua klien (keputusan Ricko). Kalau suatu saat dipakai sebagai
// filter akses, guard-nya harus ditulis eksplisit — jangan diam-diam.
//
// onDelete cascade di KEDUA sisi: baris ini cuma penanda, tidak menyimpan nilai
// sendiri. Klien dihapus → penugasannya ikut hilang; akun akunting dihapus →
// penugasannya ikut hilang. Tidak ada 'restrict' di sini supaya assignment tidak
// pernah menghalangi penghapusan (beda dengan users.clientId yang memang sengaja
// menghalangi).
export const clientAssignments = pgTable(
  'client_assignments',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    clientId: uuid('client_id')
      .notNull()
      .references(() => clients.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    assignedAt: timestamp('assigned_at').defaultNow().notNull(),
  },
  (table) => [
    // Satu akunting hanya boleh tercatat sekali per klien.
    unique('client_assignments_client_user_unique').on(table.clientId, table.userId),
    index('client_assignments_client_id_idx').on(table.clientId),
    index('client_assignments_user_id_idx').on(table.userId),
  ]
)

// ── login_attempts ───────────────────────────────────────────
// Rate limiting percobaan login: SATU baris per email (dinormalisasi lowercase).
// DB-backed, BUKAN in-memory — target deploy Vercel serverless (cold start /
// multi-instance) membuat counter in-memory tidak reliable. email adalah signal
// utama (tool internal, sedikit akun → fokus proteksi per-akun). Sengaja TIDAK
// ada FK ke users: kegagalan untuk email yang tidak terdaftar pun dihitung,
// supaya lockout tidak membocorkan email mana yang benar-benar ada (anti account
// enumeration). lastIp cuma informatif untuk investigasi di log/Sentry, tidak
// pernah dipakai sebagai kunci lockout. Baris dihapus begitu login email tsb
// berhasil (lihat clearLoginAttempts di lib/login-rate-limit-store.ts).
export const loginAttempts = pgTable(
  'login_attempts',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    email: text('email').notNull().unique(),
    failedCount: integer('failed_count').notNull().default(0),
    // Awal window penghitungan berjalan. Kalau window kedaluwarsa tanpa mencapai
    // ambang, hitungan reset dari nol (lihat registerFailure).
    windowStart: timestamp('window_start').defaultNow().notNull(),
    // Terisi saat ambang tercapai; login untuk email ini ditolak sampai lewat.
    lockedUntil: timestamp('locked_until'),
    lastIp: text('last_ip'),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  // Index untuk membantu prune baris lock yang sudah kedaluwarsa (opsional,
  // kalau nanti dibuat job pembersih). Lookup panas by-email sudah dilayani
  // unique constraint di kolom email.
  (table) => [index('login_attempts_locked_until_idx').on(table.lockedUntil)]
)

// ── journal_entries ──────────────────────────────────────────
// Header jurnal umum. Satu entri = satu transaksi pembukuan; barisnya ada di
// journal_lines. Aturan Σ debit = Σ kredit DITEGAKKAN DI lib/journal.ts, bukan
// di DB: ia lintas-baris (butuh semua baris sekaligus) dan pesan galatnya harus
// menyebut selisihnya dalam rupiah supaya bisa ditindak manusia.
//
// ══ tanggal: `date`, diperlakukan sebagai STRING ═══════════════════════════
// Sama seperti contracts.tanggal_mulai dan financial_reports.period_start.
// Aturan yang sama berlaku penuh: jangan pernah new Date() di atasnya, jangan
// lewat Intl, jangan toISOString. Perbandingan sebagai string 'YYYY-MM-DD'
// (lib/ymd.ts) — format itu urut secara leksikografis.
//
// ══ no_bukti unik PER KLIEN ═══════════════════════════════════════════════
// Persis pola contracts.no_kontrak: dua klien berbeda boleh memakai penomoran
// yang kebetulan sama. Penomoran otomatis SENGAJA belum dibuat — pola nomor
// bukti klien nyata belum terlihat, dan skema penomoran yang salah lebih mahal
// daripada input manual.
//
// ══ created_by RESTRICT ═══════════════════════════════════════════════════
// Siapa yang membuat sebuah jurnal adalah bagian dari nilai buktinya, bukan
// metadata yang boleh hilang. Akun yang pernah membuat jurnal tidak bisa
// dihapus selama jurnalnya masih ada — Postgres yang menolak, bukan kode.
// Diisi lewat lookup users by email sesi: sesi NextAuth di aplikasi ini tidak
// membawa user.id, dan lib/auth.ts tidak disentuh.
//
// ══ timestamptz — HANYA di tabel baru ═════════════════════════════════════
// Tabel lama masih `timestamp` tanpa zona (utang yang dicatat di
// docs/deferred/0006_timestamptz.sql). Tabel baru memakai withTimezone sejak
// awal supaya utang itu tidak bertambah setiap kali ada tabel baru.
export const journalEntries = pgTable(
  'journal_entries',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    clientId: uuid('client_id')
      .notNull()
      .references(() => clients.id, { onDelete: 'cascade' }),
    tanggal: date('tanggal').notNull(),
    // OPSIONAL sejak migrasi 0011 (keputusan Ricko 2026-09-16). Kosong disimpan
    // sebagai NULL, bukan '' — kolomnya unique per klien dan '' adalah satu nilai
    // konkret, jadi jurnal kedua tanpa nomor bukti akan bentrok. NULL tidak pernah
    // bentrok dengan NULL di Postgres. Normalisasinya di validateJournalInput.
    noBukti: text('no_bukti'),
    keterangan: text('keterangan'),
    sumber: journalSourceEnum('sumber').notNull().default('manual'),
    status: journalStatusEnum('status').notNull().default('draft'),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    // ── Fase 2 (migrasi 0014) ──────────────────────────────────
    // posted_at/posted_by NULL selama masih draf. Keduanya nullable dan tidak
    // punya default: "kapan diposting" hanya ada artinya kalau posting memang
    // sudah terjadi, dan default now() akan membuat setiap draf berbohong.
    postedAt: timestamp('posted_at', { withTimezone: true }),
    postedBy: uuid('posted_by').references(() => users.id, { onDelete: 'restrict' }),
    // Self-FK RESTRICT: jurnal yang sudah dibalik tidak boleh lenyap sementara
    // pembaliknya tinggal menunjuk id hantu. RESTRICT, bukan cascade — menghapus
    // jurnal asli TIDAK boleh diam-diam ikut menghapus pembaliknya, karena
    // pembalik adalah entri tersendiri yang bisa saja sudah terposting.
    reversalOfId: uuid('reversal_of_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique('journal_entries_client_no_bukti_unique').on(table.clientId, table.noBukti),
    index('journal_entries_client_tanggal_idx').on(table.clientId, table.tanggal),
    index('journal_entries_client_status_idx').on(table.clientId, table.status),
    index('journal_entries_reversal_of_idx').on(table.reversalOfId),
    // FK self-referensial dideklarasikan di sini, bukan inline di kolomnya:
    // `references(() => journalEntries.id)` inline akan merujuk tabel yang belum
    // selesai didefinisikan. Bentuk ini pola resmi drizzle untuk self-FK.
    foreignKey({
      name: 'journal_entries_reversal_of_id_fk',
      columns: [table.reversalOfId],
      foreignColumns: [table.id],
    }).onDelete('restrict'),
  ]
)

// ── journal_lines ────────────────────────────────────────────
// Baris debit/kredit sebuah jurnal. line_order disimpan eksplisit: tanpa itu
// urutan tampil jadi urusan kebetulan planner Postgres, dan urutan baris jurnal
// itu bermakna bagi yang membacanya.
//
// ══ master_coa_id RESTRICT — dan kewajiban yang lahir darinya ═════════════
// Akun yang sudah dipakai jurnal tidak boleh hilang diam-diam. Konsekuensinya
// LANGSUNG: ganti-massal & hapus-baris Master COA harus SADAR tabel ini —
// buildReplacePlan menyambung ulang baris jurnal by KODE akun, dan menolak
// (409) bila ada baris jurnal yang kodenya hilang atau ambigu. Tanpa itu, impor
// COA berikutnya akan memutus FK atau memindahkan angka ke akun yang salah.
// Setiap tabel BARU yang merujuk master_coa memikul kewajiban yang sama.
//
// ══ debit/kredit numeric(18,2) ════════════════════════════════════════════
// Sama dengan contracts.nominal & report_line_items.amount. Driver
// mengembalikan numeric sebagai STRING, jadi nilainya tidak pernah melewati
// float JS. Penjumlahan dilakukan dalam SEN BULAT di lib/journal.ts — bukan
// Number() beruntun, karena 0.1 + 0.2 yang meleset di sebuah neraca berarti
// selisih hantu yang tidak bisa dijelaskan ke klien.
//
// ══ CHECK tepat satu sisi terisi, dan tidak pernah negatif ═══════════════
// Satu baris jurnal adalah debit ATAU kredit — tidak pernah dua-duanya, tidak
// pernah kosong, dan tidak pernah bertanda minus. Jaring terakhir untuk jalur
// tulis mana pun yang kelak lupa memanggil validateJournalInput.
//
// Syarat ">= 0" BUKAN hiasan. Tanpa itu, ekspresinya hanya menanyakan sisi mana
// yang nol dan tidak pernah melihat tandanya, sehingga baris debit -100 / kredit 0
// lolos begitu saja — dan sepasang baris bernilai negatif masih bisa "seimbang"
// sehingga tidak ada satu pun pemeriksaan hilir yang akan menangkapnya.
export const journalLines = pgTable(
  'journal_lines',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    journalId: uuid('journal_id')
      .notNull()
      .references(() => journalEntries.id, { onDelete: 'cascade' }),
    masterCoaId: uuid('master_coa_id')
      .notNull()
      .references(() => masterCoa.id, { onDelete: 'restrict' }),
    // ── Fase 2 (migrasi 0014) ──────────────────────────────────
    // Supplier yang dimaksud baris hutang ini. NULL untuk baris yang bukan akun
    // hutang — dan juga untuk baris hutang yang memang belum diurai per
    // supplier, yang justru menjadi penjelas selisih di rekonsiliasi (§5.C F2).
    // RESTRICT: supplier yang sudah dipakai jurnal tidak boleh hilang, alasan
    // yang sama persis dengan master_coa_id di atas.
    //
    // Kolomnya lahir di migrasi 0014 bersama posting; yang MEMAKAINYA adalah
    // §5.C F1. Dibundel karena nomor migrasi Fase 2 sudah ditetapkan (0014/0015)
    // dan ADD COLUMN nullable tidak menyentuh satu baris pun yang sudah ada.
    supplierId: uuid('supplier_id').references(() => masterSupplier.id, { onDelete: 'restrict' }),
    debit: numeric('debit', { precision: 18, scale: 2 }).notNull().default('0'),
    kredit: numeric('kredit', { precision: 18, scale: 2 }).notNull().default('0'),
    keterangan: text('keterangan'),
    lineOrder: integer('line_order').notNull(),
  },
  (table) => [
    index('journal_lines_journal_id_idx').on(table.journalId),
    index('journal_lines_master_coa_id_idx').on(table.masterCoaId),
    index('journal_lines_supplier_id_idx').on(table.supplierId),
    check(
      'journal_lines_satu_sisi_check',
      sql`${table.debit} >= 0 AND ${table.kredit} >= 0 AND ((${table.debit} = 0) <> (${table.kredit} = 0))`
    ),
  ]
)


// ── master_supplier ──────────────────────────────────────────
// Master supplier PER KLIEN, sama seperti master_coa — bandingkan `layanan`
// yang global. Supplier "Toko Bangunan Jaya" milik satu klien tidak ada
// hubungannya dengan supplier bernama sama milik klien lain, dan menyatukannya
// berarti satu klien bisa melihat daftar rekanan klien lain.
//
// ══ nama unik per klien ═══════════════════════════════════════════════════
// Bukan sekadar kerapian: impor supplier memakai UPSERT BY NAMA (D8), jadi nama
// adalah kunci pencocokannya. Tanpa batasan ini, dua baris bernama sama membuat
// impor berikutnya tidak bisa menentukan mana yang harus diperbarui.
//
// ══ akun_hutang_default_id SET NULL, bukan restrict ═══════════════════════
// Beda sengaja dari journal_lines.master_coa_id yang restrict. Akun hutang
// default cuma pengisi awal formulir — kehilangannya tidak mengubah satu angka
// pun, jadi ganti-massal Master COA boleh memutusnya (dan buildReplacePlan
// menghitungnya sebagai supplierUnlinkedCount). Baris jurnal tidak punya
// kemewahan itu: ia pencatatan yang sudah terjadi.
//
// ══ termin_pembayaran integer, bukan interval ═════════════════════════════
// Isinya JUMLAH HARI (0–365), pola yang sama dengan contracts.tanggalPenagihan
// yang menyimpan hari-dalam-bulan sebagai integer. Tipe interval Postgres
// mengundang nilai seperti '1 mon 3 days' yang tidak bisa dijumlahkan ke tanggal
// jatuh tempo tanpa aturan tambahan.
export const masterSupplier = pgTable(
  'master_supplier',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    clientId: uuid('client_id')
      .notNull()
      .references(() => clients.id, { onDelete: 'cascade' }),
    nama: text('nama').notNull(),
    kontak: text('kontak'),
    npwp: text('npwp'),
    // ⚠️ DIHAPUS di migrasi 0019 (D43) — termin melekat pada INVOICE, bukan pada
    // rekanan: supplier yang sama bisa memberi 3× untuk satu invoice dan tunai
    // untuk yang lain. Dipertahankan di sini sampai 0019 diterapkan, dan sudah
    // TIDAK DIPAKAI jalur mana pun sejak modul pembelian ada.
    terminPembayaran: integer('termin_pembayaran'),
    // ── Data rekening, migrasi 0017 (D43) ──────────────────────
    // `bank_rekening` TEXT, bukan angka: nomor rekening bisa berawalan nol dan
    // bukan sesuatu yang pernah dihitung. Menyimpannya sebagai angka membuang
    // nol depan secara permanen, dan baru ketahuan saat transfer gagal.
    bankNama: text('bank_nama'),
    bankRekening: text('bank_rekening'),
    bankAtasNama: text('bank_atas_nama'),
    akunHutangDefaultId: uuid('akun_hutang_default_id').references(() => masterCoa.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    // Unik per klien, TIDAK PEDULI BESAR-KECIL HURUF. Batasan biasa atas
    // kolomnya saja tidak cukup: "PT ABC" dan "pt abc" adalah dua string
    // berbeda bagi Postgres, jadi keduanya akan lolos — padahal aplikasi
    // memperlakukannya sebagai supplier yang sama saat upsert impor, dan
    // daftarnya perlahan terisi kembaran yang tak seorang pun sengaja buat.
    //
    // Bagian spasi ganda sudah diselesaikan normalizeNamaSupplier sebelum
    // ditulis, jadi nilai tersimpan tidak pernah punya spasi ganda dan lower()
    // saja sudah cukup di sini.
    uniqueIndex('master_supplier_client_nama_lower_unique').on(
      table.clientId,
      sql`lower(${table.nama})`
    ),
    index('master_supplier_client_id_idx').on(table.clientId),
    index('master_supplier_akun_hutang_idx').on(table.akunHutangDefaultId),
  ]
)

// ── audit_events (0014) ──────────────────────────────────────
// Riwayat "kapan, oleh siapa, apa" untuk SEMUA entitas yang perlu diriwayatkan,
// bukan hanya jurnal. Keputusan Ricko 2026-09-18 (R2), menggantikan
// `journal_events` di MP §8.5.
//
// ══ KENAPA GENERIK SEJAK AWAL ═════════════════════════════════════════════
// Bentuk khusus-jurnal sudah bocor di rancangan aslinya sendiri: §8.5 harus
// membuat `journal_id` nullable "untuk event periode", padahal kunci periode
// bukan jurnal dan tidak akan pernah punya id jurnal. Selain itu konsumen kedua
// dan ketiga sudah TERTULIS di master plan yang sama — riwayat keterangan akun
// COA (F03-14) dan log buka-kunci periode (F07-8/11) — jadi ini bukan
// generalisasi atas pemakai yang baru diduga-duga.
//
// ══ HARGA YANG DIBAYAR: TIDAK ADA FK UNTUK entity_id ══════════════════════
// Kolom polimorfik tidak bisa punya foreign key, jadi jaminan "event ini
// menunjuk baris yang benar-benar ada" pindah dari Postgres ke kode — selamanya.
// Tiga hal membayar kembali sebagian:
//   1. entity_type ENUM (bukan text) — salah ketik entitas ditolak database.
//   2. CHECK di bawah — event ber-entitas 'journal' WAJIB punya entity_id.
//   3. Penghapusan jurnal WAJIB menghapus event-nya DI DALAM db.batch yang sama
//      (lihat DELETE /api/journals/[id] dan penjaga strukturalnya). Ini yang
//      menggantikan `ON DELETE CASCADE` yang dulu dikerjakan FK.
// Yang TIDAK bisa dibeli kembali: tidak ada yang mencegah event menunjuk id yang
// sudah tidak ada kalau kelak ada jalur hapus baru yang lupa nomor 3. Karena itu
// penjaganya struktural, bukan sekadar konvensi.
//
// ══ APPEND-ONLY ═══════════════════════════════════════════════════════════
// Tidak ada UPDATE. Satu-satunya DELETE yang sah adalah pembersihan bersamaan
// dengan entitasnya (nomor 3 di atas) — riwayat yang bisa disunting bukan
// riwayat.
export const auditEvents = pgTable(
  'audit_events',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    clientId: uuid('client_id')
      .notNull()
      .references(() => clients.id, { onDelete: 'cascade' }),
    entityType: auditEntityTypeEnum('entity_type').notNull(),
    /** Id baris yang diriwayatkan. TANPA FK — lihat catatan di atas. */
    entityId: uuid('entity_id'),
    /** Daftar resminya konstanta di lib (JOURNAL_EVENTS dst), text bukan enum (D12). */
    event: text('event').notNull(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    catatan: text('catatan'),
    // ── Migrasi 0017 (D42) ─────────────────────────────────────
    // Keadaan SEBELUM dan SESUDAH sebuah perubahan, sebagai jsonb.
    //
    // Bukan menumpang `catatan`: itu prosa untuk dibaca manusia, sementara ini
    // DATA — ia dibandingkan, ditampilkan sebagai diff, dan kelak dicari.
    // Menaruh JSON di kolom prosa memaksa setiap pembaca menebak mana yang
    // prosa dan mana yang bukan.
    //
    // Wajib terisi saat jurnal TERPOSTING diubah (sakelar "posting bisa
    // diedit"), karena di situlah riwayat menjadi satu-satunya bukti bahwa
    // angka yang sudah dilaporkan pernah berbeda.
    nilaiSebelum: jsonb('nilai_sebelum'),
    nilaiSesudah: jsonb('nilai_sesudah'),
    at: timestamp('at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    // Query riwayat SELALU "entitas ini, terbaru dulu" — ketiganya satu index.
    index('audit_events_entity_idx').on(table.entityType, table.entityId, table.at),
    index('audit_events_client_at_idx').on(table.clientId, table.at),
    check(
      'audit_events_entity_id_check',
      sql`${table.entityType} <> 'journal' OR ${table.entityId} IS NOT NULL`
    ),
  ]
)

// ── client_accounting_settings (0017) ────────────────────────
// Setelan pembukuan PER KLIEN. Baris dibuat LAZILY — mayoritas klien tidak akan
// pernah punya barisnya.
//
// ══ KETIADAAN BARIS BERARTI NILAI BAWAAN, DAN ITU HARUS SAMA PERSIS ═══════
// Karena barisnya lazy, "belum pernah disetel" adalah keadaan yang PALING
// SERING dibaca — bukan kasus pinggiran. Predikat pembacanya wajib berbentuk
// `settings?.postingBisaDiedit === true`; bentuk `?? true` akan membalik
// keputusan D42 untuk hampir semua klien sekaligus, dan tidak ada yang akan
// menyadarinya sampai ada jurnal terposting yang berubah. Dikunci test
// tiga-keadaan di lib/accounting-settings.test.ts.
export const clientAccountingSettings = pgTable('client_accounting_settings', {
  // client_id SEKALIGUS primary key: satu klien tepat satu baris setelan.
  // Tanpa itu, dua baris untuk klien yang sama bisa hidup bersamaan dan yang
  // dibaca jadi urusan urutan.
  clientId: uuid('client_id')
    .primaryKey()
    .references(() => clients.id, { onDelete: 'cascade' }),
  // Akun PPN Masukan (D33). SET NULL, bukan restrict: ia pengisi awal formulir,
  // dan invoice sudah men-snapshot akun yang benar-benar dipakainya (D30).
  akunPpnMasukanId: uuid('akun_ppn_masukan_id').references(() => masterCoa.id, {
    onDelete: 'set null',
  }),
  // D42, bawaan FALSE — keputusan Ricko 2026-09-20: angka yang sudah diserahkan
  // ke klien tidak boleh berubah diam-diam. Dinyalakan per klien bila memang
  // dibutuhkan, dan kunci periode tetap mengalahkannya.
  postingBisaDiedit: boolean('posting_bisa_diedit').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

// ── purchase_invoices (0017) ─────────────────────────────────
// Invoice pembelian dari supplier — pintu masuk hutang usaha (D27).
//
// ══ TIDAK ADA KOLOM total, sisa, MAUPUN status ═══════════════════════════
// Ketiganya diturunkan: total = Σ subtotal baris + ppn, sisa = total − Σ
// alokasi pembayaran, status = fungsi dari keduanya. Total tersimpan adalah
// sumber kebenaran kedua yang kalah begitu ada satu jalur tulis yang lupa
// memperbaruinya — alasan yang sama persis dengan D11 menolak tabel saldo.
//
// ══ AKUN DI-SNAPSHOT, BUKAN DIBACA ULANG (D30) ═══════════════════════════
// akun_hutang_id / akun_ppn_masukan_id / akun_tujuan_id / akun_kas_id direkam
// saat invoice DIBUAT. Kalau supplier mengganti akun hutang defaultnya setelah
// ada invoice, jurnal pembayaran akan men-DEBIT akun yang berbeda dari yang
// di-KREDIT invoice — selisihnya mengendap permanen di dua akun dan tidak
// pernah melempar galat. Ini yang paling mahal kalau salah.
export const purchaseInvoices = pgTable(
  'purchase_invoices',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    clientId: uuid('client_id')
      .notNull()
      .references(() => clients.id, { onDelete: 'cascade' }),
    supplierId: uuid('supplier_id')
      .notNull()
      .references(() => masterSupplier.id, { onDelete: 'restrict' }),
    tanggal: date('tanggal').notNull(),
    // NULLABLE, dan kosong disimpan sebagai NULL — bukan '' (D29). Pelajaran
    // `no_bukti` Fase 1 diulang persis: '' adalah satu nilai konkret, jadi
    // invoice KEDUA tanpa nomor akan bentrok dengan yang pertama di batasan
    // unik. NULL tidak pernah bentrok dengan NULL di Postgres.
    noInvoice: text('no_invoice'),
    caraBayar: purchasePaymentMethodEnum('cara_bayar').notNull(),
    // SATU akun tujuan per invoice, BEBAS akun apa pun — persediaan bahan baku,
    // persediaan barang jadi, beban jasa. Sengaja tidak dibatasi ke akun
    // persediaan: yang dibeli UMKM tidak selalu barang.
    akunTujuanId: uuid('akun_tujuan_id')
      .notNull()
      .references(() => masterCoa.id, { onDelete: 'restrict' }),
    akunKasId: uuid('akun_kas_id').references(() => masterCoa.id, { onDelete: 'restrict' }),
    akunHutangId: uuid('akun_hutang_id').references(() => masterCoa.id, { onDelete: 'restrict' }),
    akunPpnMasukanId: uuid('akun_ppn_masukan_id').references(() => masterCoa.id, {
      onDelete: 'restrict',
    }),
    ppn: numeric('ppn', { precision: 18, scale: 2 }).notNull().default('0'),
    jumlahTermin: integer('jumlah_termin').notNull().default(1),
    jatuhTempoAkhir: date('jatuh_tempo_akhir'),
    keterangan: text('keterangan'),
    // Jurnal draf otomatis (D31). SET NULL supaya menghapus jurnalnya lewat
    // jalur lain tidak ikut menghapus invoicenya — tapi jalur yang sah memang
    // menghapus keduanya bersamaan, di db.batch yang sama.
    journalId: uuid('journal_id').references(() => journalEntries.id, { onDelete: 'set null' }),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    // Unik HANYA bila no_invoice terisi — NULL tidak pernah bentrok (D29).
    unique('purchase_invoices_supplier_no_invoice_unique').on(
      table.clientId,
      table.supplierId,
      table.noInvoice
    ),
    index('purchase_invoices_client_tanggal_idx').on(table.clientId, table.tanggal),
    index('purchase_invoices_supplier_idx').on(table.supplierId),
    // Untuk pencarian MUNDUR dari jurnal ke invoicenya (D32, tombol "Koreksi di
    // Pembelian"). Arah tautannya memang terbalik dari arah FK, dan index ini
    // yang membuatnya murah — bukan kolom balik di journal_entries, yang akan
    // jadi kolom polimorfik kedua tanpa FK.
    index('purchase_invoices_journal_idx').on(table.journalId),
    // Jaring terakhir di DB, cermin validatePurchaseInvoice. Kredit wajib punya
    // akun hutang & jatuh tempo; tunai wajib punya akun kas; PPN > 0 wajib
    // punya akun PPN Masukan (D33 — menolak lebih baik daripada menebak, karena
    // akun PPN yang salah baru ketahuan saat SPT).
    check(
      'purchase_invoices_cara_bayar_check',
      sql`(${table.caraBayar} <> 'kredit' OR (${table.akunHutangId} IS NOT NULL AND ${table.jatuhTempoAkhir} IS NOT NULL))
        AND (${table.caraBayar} <> 'tunai' OR ${table.akunKasId} IS NOT NULL)`
    ),
    check(
      'purchase_invoices_ppn_check',
      sql`${table.ppn} >= 0 AND (${table.ppn} = 0 OR ${table.akunPpnMasukanId} IS NOT NULL)`
    ),
    check('purchase_invoices_termin_check', sql`${table.jumlahTermin} >= 1`),
  ]
)

// ── purchase_invoice_lines (0017) ────────────────────────────
// Baris barang. TEKS BEBAS — tidak ada master barang, dan menambahkannya
// diam-diam berarti membangun modul inventori setengah jadi (§12).
//
// ══ subtotal DISIMPAN, dan itu pengecualian sadar (D28) ══════════════════
// Alasannya aritmetika: qty boleh pecahan (2,5 kg), jadi `qty × harga_satuan`
// punya pembulatan yang hasilnya bergantung urutan operasi. RUPIAH BARIS itulah
// faktanya; qty dan harga adalah keterangan. Jurnal dibangun dari `subtotal`,
// tidak pernah dari perkalian ulang.
export const purchaseInvoiceLines = pgTable(
  'purchase_invoice_lines',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    invoiceId: uuid('invoice_id')
      .notNull()
      .references(() => purchaseInvoices.id, { onDelete: 'cascade' }),
    namaBarang: text('nama_barang').notNull(),
    qty: numeric('qty', { precision: 18, scale: 4 }).notNull(),
    satuan: text('satuan'),
    hargaSatuan: numeric('harga_satuan', { precision: 18, scale: 2 }).notNull(),
    subtotal: numeric('subtotal', { precision: 18, scale: 2 }).notNull(),
    lineOrder: integer('line_order').notNull(),
  },
  (table) => [
    index('purchase_invoice_lines_invoice_idx').on(table.invoiceId),
    check(
      'purchase_invoice_lines_nominal_check',
      sql`${table.qty} > 0 AND ${table.hargaSatuan} >= 0 AND ${table.subtotal} >= 0`
    ),
  ]
)


// ── cash_mutation_imports (0018) ─────────────────────────────
// Satu baris per BERKAS rekening koran yang diimpor. Gunanya bukan audit
// belaka: tanpa induk impor, satu berkas yang salah kolom hanya bisa dibereskan
// baris demi baris, dan tidak ada cara menjawab "baris ini datang dari mana".
export const cashMutationImports = pgTable(
  'cash_mutation_imports',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    clientId: uuid('client_id')
      .notNull()
      .references(() => clients.id, { onDelete: 'cascade' }),
    // RESTRICT: berkas impor mencatat rekening mana yang dibaca. Kalau akunnya
    // boleh hilang, asal-usul mutasinya ikut hilang.
    akunKasId: uuid('akun_kas_id')
      .notNull()
      .references(() => masterCoa.id, { onDelete: 'restrict' }),
    namaBerkas: text('nama_berkas').notNull(),
    jumlahBaris: integer('jumlah_baris').notNull(),
    diimporOleh: uuid('diimpor_oleh')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('cash_mutation_imports_client_idx').on(table.clientId, table.createdAt)]
)

// ── cash_mutations (0018) ────────────────────────────────────
// Satu baris rekening koran / satu mutasi kas.
//
// ══ TIDAK ADA KOLOM status MAUPUN sisa ═══════════════════════════════════
// Keduanya DITURUNKAN dari alokasinya (D37, P3): "belum dijurnal" berarti
// belum ada alokasi dan belum ada akun lawan, "sebagian" berarti Σ alokasi
// kurang dari nominalnya. Status tersimpan adalah sumber kebenaran kedua yang
// kalah begitu ada satu jalur tulis yang lupa memperbaruinya — dan yang tampil
// di layar itulah yang akan dipercaya.
//
// ══ debit = UANG MASUK, untuk akun kas (D36) ═════════════════════════════
// CHECK-nya SAMA PERSIS dengan journal_lines: tepat satu sisi terisi, keduanya
// tidak negatif. Bentuk yang sama di dua tabel bukan kebetulan — jurnal mutasi
// dibangun langsung dari sisi ini, dan aturan yang berbeda akan membuat mutasi
// yang sah menghasilkan jurnal yang ditolak.
//
// ══ fingerprint TIDAK UNIK, dan itu keputusan (D38) ══════════════════════
// Dua pembayaran identik pada hari yang sama adalah hal nyata. Batasan unik di
// sini akan MENOLAK transaksi yang benar-benar terjadi; yang dibutuhkan adalah
// peringatan yang bisa diabaikan akunting, bukan penolakan.
export const cashMutations = pgTable(
  'cash_mutations',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    clientId: uuid('client_id')
      .notNull()
      .references(() => clients.id, { onDelete: 'cascade' }),
    akunKasId: uuid('akun_kas_id')
      .notNull()
      .references(() => masterCoa.id, { onDelete: 'restrict' }),
    tanggal: date('tanggal').notNull(),
    keterangan: text('keterangan'),
    debit: numeric('debit', { precision: 18, scale: 2 }).notNull().default('0'),
    kredit: numeric('kredit', { precision: 18, scale: 2 }).notNull().default('0'),
    // Saldo berjalan dari rekening koran. INFORMATIF — tidak pernah dipakai
    // menghitung apa pun; saldo yang berlaku tetap datang dari buku besar.
    saldo: numeric('saldo', { precision: 18, scale: 2 }),
    fingerprint: text('fingerprint').notNull(),
    // Baris manual = NULL. SET NULL supaya menghapus catatan impor tidak ikut
    // menghapus mutasi yang sudah dijurnal.
    importId: uuid('import_id').references(() => cashMutationImports.id, { onDelete: 'set null' }),
    akunLawanId: uuid('akun_lawan_id').references(() => masterCoa.id, { onDelete: 'set null' }),
    journalId: uuid('journal_id').references(() => journalEntries.id, { onDelete: 'set null' }),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('cash_mutations_client_tanggal_idx').on(table.clientId, table.tanggal),
    index('cash_mutations_akun_tanggal_idx').on(table.akunKasId, table.tanggal),
    // Untuk mencari dugaan duplikat saat impor — bukan untuk menolaknya.
    index('cash_mutations_fingerprint_idx').on(table.fingerprint),
    // Pencarian MUNDUR dari jurnal ke mutasinya (D32, tombol "Koreksi di Mutasi
    // Kas"), pola yang sama dengan purchase_invoices_journal_idx.
    index('cash_mutations_journal_idx').on(table.journalId),
    check(
      'cash_mutations_debit_kredit_check',
      sql`${table.debit} >= 0 AND ${table.kredit} >= 0 AND ((${table.debit} = 0) <> (${table.kredit} = 0))`
    ),
  ]
)

// ── cash_mutation_allocations (0018) ─────────────────────────
// Berapa dari satu mutasi yang dipakai membayar invoice mana. Satu mutasi boleh
// menunjuk beberapa invoice, dan alokasi sebagian boleh (D37).
//
// ══ termin_urutan: NULL = FIFO, terisi = DIPAKU (D40) ════════════════════
// Nullable dengan sengaja, sehingga kasus lazimnya tetap NOL INPUT dan
// penimpaan manual jadi pengecualian yang TERCATAT — bukan bentuk baku yang
// harus diisi setiap kali. Aturan penerapannya (berpaku dulu, luberan FIFO,
// paku yatim jatuh ke FIFO dan ditandai) hidup di lib/hutang.ts (U1), bukan di
// sini: ia aturan yang bisa diuji, bukan batasan kolom.
//
// ══ TIGA BATAS YANG TIDAK BISA JADI CHECK ════════════════════════════════
// "Σ alokasi ≤ nominal mutasi", "Σ alokasi ≤ sisa invoice", dan "termin_urutan
// ≤ jumlah_termin invoice" ketiganya lintas-baris atau lintas-tabel. Ditegakkan
// di route dan dikunci test baca-sumber (P15) — dicatat di sini supaya tidak
// ada yang menyangka CHECK di bawah sudah menjaga semuanya.
export const cashMutationAllocations = pgTable(
  'cash_mutation_allocations',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    mutationId: uuid('mutation_id')
      .notNull()
      .references(() => cashMutations.id, { onDelete: 'cascade' }),
    // RESTRICT, bukan cascade: menghapus invoice yang sudah dibayar harus
    // berhenti di sini, bukan diam-diam menghapus bukti pembayarannya.
    invoiceId: uuid('invoice_id')
      .notNull()
      .references(() => purchaseInvoices.id, { onDelete: 'restrict' }),
    nominal: numeric('nominal', { precision: 18, scale: 2 }).notNull(),
    terminUrutan: integer('termin_urutan'),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    // Satu mutasi menunjuk satu invoice PALING BANYAK sekali. Dua baris untuk
    // pasangan yang sama akan membuat "sisa invoice" bergantung urutan baca.
    unique('cash_mutation_allocations_mutation_invoice_unique').on(
      table.mutationId,
      table.invoiceId
    ),
    index('cash_mutation_allocations_invoice_idx').on(table.invoiceId),
    index('cash_mutation_allocations_mutation_idx').on(table.mutationId),
    check('cash_mutation_allocations_nominal_check', sql`${table.nominal} > 0`),
    check(
      'cash_mutation_allocations_termin_check',
      sql`${table.terminUrutan} IS NULL OR ${table.terminUrutan} >= 1`
    ),
  ]
)

// ── Relations ────────────────────────────────────────────────

export const clientsRelations = relations(clients, ({ many }) => ({
  masterCoa: many(masterCoa),
  financialReports: many(financialReports),
  coaMappingHistory: many(coaMappingHistory),
  metricVisibility: many(clientMetricVisibility),
  users: many(users),
  assignments: many(clientAssignments),
}))

export const usersRelations = relations(users, ({ one, many }) => ({
  client: one(clients, { fields: [users.clientId], references: [clients.id] }),
  assignments: many(clientAssignments),
}))

export const clientAssignmentsRelations = relations(clientAssignments, ({ one }) => ({
  client: one(clients, { fields: [clientAssignments.clientId], references: [clients.id] }),
  user: one(users, { fields: [clientAssignments.userId], references: [users.id] }),
}))

export const masterCoaRelations = relations(masterCoa, ({ one, many }) => ({
  client: one(clients, { fields: [masterCoa.clientId], references: [clients.id] }),
  suggestedForLineItems: many(reportLineItems, { relationName: 'suggestedCoa' }),
  mappedForLineItems: many(reportLineItems, { relationName: 'masterCoa' }),
}))

export const financialReportsRelations = relations(financialReports, ({ one, many }) => ({
  client: one(clients, { fields: [financialReports.clientId], references: [clients.id] }),
  lineItems: many(reportLineItems),
}))

export const reportLineItemsRelations = relations(reportLineItems, ({ one }) => ({
  report: one(financialReports, {
    fields: [reportLineItems.reportId],
    references: [financialReports.id],
  }),
  suggestedCoa: one(masterCoa, {
    fields: [reportLineItems.suggestedCoaId],
    references: [masterCoa.id],
    relationName: 'suggestedCoa',
  }),
  masterCoa: one(masterCoa, {
    fields: [reportLineItems.masterCoaId],
    references: [masterCoa.id],
    relationName: 'masterCoa',
  }),
}))

export const coaMappingHistoryRelations = relations(coaMappingHistory, ({ one }) => ({
  client: one(clients, { fields: [coaMappingHistory.clientId], references: [clients.id] }),
  masterCoa: one(masterCoa, {
    fields: [coaMappingHistory.masterCoaId],
    references: [masterCoa.id],
  }),
}))

export const clientMetricVisibilityRelations = relations(clientMetricVisibility, ({ one }) => ({
  client: one(clients, { fields: [clientMetricVisibility.clientId], references: [clients.id] }),
}))

export const journalEntriesRelations = relations(journalEntries, ({ one, many }) => ({
  client: one(clients, { fields: [journalEntries.clientId], references: [clients.id] }),
  // Dua relasi ke `users` dari tabel yang sama → relationName wajib, kalau tidak
  // drizzle tidak bisa memutuskan yang mana yang dimaksud (pola yang sama sudah
  // dipakai masterCoaRelations terhadap reportLineItems).
  createdByUser: one(users, {
    fields: [journalEntries.createdBy],
    references: [users.id],
    relationName: 'journalCreatedBy',
  }),
  postedByUser: one(users, {
    fields: [journalEntries.postedBy],
    references: [users.id],
    relationName: 'journalPostedBy',
  }),
  // Jurnal asli ↔ pembaliknya. Satu arah `one` (aku membalik siapa) dan satu
  // arah `many` (siapa saja yang membalikku) — `many`, bukan `one`, karena yang
  // menjamin "cuma sekali" adalah predikat canReverse, bukan batasan kolom:
  // pembalik yang masih DRAF tidak menghitung, jadi kolom unik akan salah.
  reversalOf: one(journalEntries, {
    fields: [journalEntries.reversalOfId],
    references: [journalEntries.id],
    relationName: 'journalReversal',
  }),
  reversals: many(journalEntries, { relationName: 'journalReversal' }),
  lines: many(journalLines),
}))

export const journalLinesRelations = relations(journalLines, ({ one }) => ({
  journal: one(journalEntries, {
    fields: [journalLines.journalId],
    references: [journalEntries.id],
  }),
  masterCoa: one(masterCoa, {
    fields: [journalLines.masterCoaId],
    references: [masterCoa.id],
  }),
  supplier: one(masterSupplier, {
    fields: [journalLines.supplierId],
    references: [masterSupplier.id],
  }),
}))

// audit_events hanya punya relasi ke client & user. entity_id SENGAJA tidak
// punya relasi: ia polimorfik, dan relasi drizzle butuh satu tabel tujuan yang
// pasti — tidak ada yang bisa ditulis di sini tanpa berbohong.
export const clientAccountingSettingsRelations = relations(
  clientAccountingSettings,
  ({ one }) => ({
    client: one(clients, {
      fields: [clientAccountingSettings.clientId],
      references: [clients.id],
    }),
    akunPpnMasukan: one(masterCoa, {
      fields: [clientAccountingSettings.akunPpnMasukanId],
      references: [masterCoa.id],
    }),
  })
)

export const cashMutationImportsRelations = relations(cashMutationImports, ({ one, many }) => ({
  client: one(clients, { fields: [cashMutationImports.clientId], references: [clients.id] }),
  akunKas: one(masterCoa, {
    fields: [cashMutationImports.akunKasId],
    references: [masterCoa.id],
  }),
  mutations: many(cashMutations),
}))

export const cashMutationsRelations = relations(cashMutations, ({ one, many }) => ({
  client: one(clients, { fields: [cashMutations.clientId], references: [clients.id] }),
  akunKas: one(masterCoa, {
    fields: [cashMutations.akunKasId],
    references: [masterCoa.id],
    relationName: 'mutasiAkunKas',
  }),
  akunLawan: one(masterCoa, {
    fields: [cashMutations.akunLawanId],
    references: [masterCoa.id],
    relationName: 'mutasiAkunLawan',
  }),
  import: one(cashMutationImports, {
    fields: [cashMutations.importId],
    references: [cashMutationImports.id],
  }),
  journal: one(journalEntries, {
    fields: [cashMutations.journalId],
    references: [journalEntries.id],
  }),
  allocations: many(cashMutationAllocations),
}))

export const cashMutationAllocationsRelations = relations(cashMutationAllocations, ({ one }) => ({
  mutation: one(cashMutations, {
    fields: [cashMutationAllocations.mutationId],
    references: [cashMutations.id],
  }),
  invoice: one(purchaseInvoices, {
    fields: [cashMutationAllocations.invoiceId],
    references: [purchaseInvoices.id],
  }),
}))

export const purchaseInvoicesRelations = relations(purchaseInvoices, ({ one, many }) => ({
  client: one(clients, { fields: [purchaseInvoices.clientId], references: [clients.id] }),
  supplier: one(masterSupplier, {
    fields: [purchaseInvoices.supplierId],
    references: [masterSupplier.id],
  }),
  // Empat relasi ke master_coa dari tabel yang sama → relationName wajib,
  // kalau tidak drizzle tidak bisa memutuskan yang mana yang dimaksud.
  akunTujuan: one(masterCoa, {
    fields: [purchaseInvoices.akunTujuanId],
    references: [masterCoa.id],
    relationName: 'invoiceAkunTujuan',
  }),
  akunKas: one(masterCoa, {
    fields: [purchaseInvoices.akunKasId],
    references: [masterCoa.id],
    relationName: 'invoiceAkunKas',
  }),
  akunHutang: one(masterCoa, {
    fields: [purchaseInvoices.akunHutangId],
    references: [masterCoa.id],
    relationName: 'invoiceAkunHutang',
  }),
  akunPpnMasukan: one(masterCoa, {
    fields: [purchaseInvoices.akunPpnMasukanId],
    references: [masterCoa.id],
    relationName: 'invoiceAkunPpn',
  }),
  journal: one(journalEntries, {
    fields: [purchaseInvoices.journalId],
    references: [journalEntries.id],
  }),
  createdByUser: one(users, {
    fields: [purchaseInvoices.createdBy],
    references: [users.id],
    relationName: 'invoiceCreatedBy',
  }),
  lines: many(purchaseInvoiceLines),
}))

export const purchaseInvoiceLinesRelations = relations(purchaseInvoiceLines, ({ one }) => ({
  invoice: one(purchaseInvoices, {
    fields: [purchaseInvoiceLines.invoiceId],
    references: [purchaseInvoices.id],
  }),
}))

export const auditEventsRelations = relations(auditEvents, ({ one }) => ({
  client: one(clients, { fields: [auditEvents.clientId], references: [clients.id] }),
  user: one(users, { fields: [auditEvents.userId], references: [users.id] }),
}))

export const masterSupplierRelations = relations(masterSupplier, ({ one }) => ({
  client: one(clients, { fields: [masterSupplier.clientId], references: [clients.id] }),
  akunHutangDefault: one(masterCoa, {
    fields: [masterSupplier.akunHutangDefaultId],
    references: [masterCoa.id],
  }),
}))
