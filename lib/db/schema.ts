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
} from 'drizzle-orm/pg-core'

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

export const userRoleEnum = pgEnum('user_role', ['admin', 'user'])

// ── clients ──────────────────────────────────────────────────
export const clients = pgTable('clients', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  type: text('type').notNull(),
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
// clientId null = admin (akses semua klien), terisi = role 'user'
// dipin ke 1 klien — sama persis dengan perilaku MOCK_ROLE saat ini.
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

// ── Relations ────────────────────────────────────────────────

export const clientsRelations = relations(clients, ({ many }) => ({
  masterCoa: many(masterCoa),
  financialReports: many(financialReports),
  coaMappingHistory: many(coaMappingHistory),
  metricVisibility: many(clientMetricVisibility),
  users: many(users),
}))

export const usersRelations = relations(users, ({ one }) => ({
  client: one(clients, { fields: [users.clientId], references: [clients.id] }),
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
