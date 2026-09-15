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
  unique,
  index,
  primaryKey,
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

// journal_source: dari mana jurnal lahir. Fase 1 cuma 'manual'. Nilai berikutnya
// ('import_bank', 'marketplace', 'kas_kecil', 'opening_balance') ditambahkan
// per fase lewat ALTER TYPE ... ADD VALUE TULIS TANGAN — preseden 0003/0007.
// JANGAN biarkan drizzle-kit me-recreate enum ini: untuk perubahan enum ia
// membuat kolom jadi text → DROP TYPE → CREATE TYPE → cast balik, yang pasti
// gagal di database yang sudah ada isinya.
export const journalSourceEnum = pgEnum('journal_source', ['manual'])

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
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    unique('master_coa_client_kode_unique').on(table.clientId, table.kode),
    index('master_coa_client_id_idx').on(table.clientId),
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
    noBukti: text('no_bukti').notNull(),
    keterangan: text('keterangan').notNull(),
    sumber: journalSourceEnum('sumber').notNull().default('manual'),
    status: journalStatusEnum('status').notNull().default('draft'),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique('journal_entries_client_no_bukti_unique').on(table.clientId, table.noBukti),
    index('journal_entries_client_tanggal_idx').on(table.clientId, table.tanggal),
    index('journal_entries_client_status_idx').on(table.clientId, table.status),
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
    debit: numeric('debit', { precision: 18, scale: 2 }).notNull().default('0'),
    kredit: numeric('kredit', { precision: 18, scale: 2 }).notNull().default('0'),
    keterangan: text('keterangan'),
    lineOrder: integer('line_order').notNull(),
  },
  (table) => [
    index('journal_lines_journal_id_idx').on(table.journalId),
    index('journal_lines_master_coa_id_idx').on(table.masterCoaId),
    check(
      'journal_lines_satu_sisi_check',
      sql`${table.debit} >= 0 AND ${table.kredit} >= 0 AND ((${table.debit} = 0) <> (${table.kredit} = 0))`
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
  createdByUser: one(users, { fields: [journalEntries.createdBy], references: [users.id] }),
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
}))
