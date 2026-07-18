import { relations } from 'drizzle-orm'
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
export const userRoleEnum = pgEnum('user_role', ['akunting', 'user', 'owner'])

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
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

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
