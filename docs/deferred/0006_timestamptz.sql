-- ============================================================================
-- DITUNDA — JANGAN DIJALANKAN OTOMATIS. File ini SENGAJA di luar
-- lib/db/migrations/ supaya `drizzle-kit migrate` tidak memungutnya, dan
-- SENGAJA tanpa entri di meta/_journal.json.
--
-- Status 2026-08-05: TIDAK ADA BUG AKTIF. Kolom naif hari ini terbaca benar
-- karena (a) Drizzle menormalkan ke UTC saat membaca dan (b) runtime Vercel
-- berjalan TZ=UTC. Keputusan Ricko: hardening untuk perubahan driver yang
-- masih hipotetis tidak sepadan dengan detour-nya.
--
-- WAJIB DITERAPKAN SEBELUM: pindah driver dari neon-http (mis. ke
-- node-postgres, yang memparse timestamp naif sebagai waktu LOKAL proses, bukan
-- UTC), atau sebelum ada kode yang membungkus hasil `db.execute()` mentah
-- dengan new Date().
--
-- Kalau nanti diterapkan: pindahkan ke lib/db/migrations/, tambahkan entri
-- journal, DAN ubah schema.ts ke timestamp(..., { withTimezone: true }) di
-- ke-19 kolomnya — kalau tidak, drizzle-kit akan melaporkan drift.
-- ============================================================================

-- 0006 — timestamp -> timestamptz (19 kolom)
--
-- KENAPA: seluruh 19 kolom waktu bertipe `timestamp without time zone`. Nilainya
-- SUDAH konsisten UTC (DB TimeZone = GMT, default `now()` menulis UTC, dan tulis
-- dari JS lewat Drizzle juga UTC — dibuktikan: baris yang ditulis pukul 10:18
-- WIB tersimpan sebagai 03:18). Tapi tipenya tidak menyatakan itu di mana pun,
-- jadi kebenarannya bergantung pada kebetulan runtime Vercel berjalan TZ=UTC.
-- Begitu ada proses non-UTC (mis. `next dev` di mesin WIB), string naif seperti
-- '2026-08-05 09:30:00' diparse `new Date()` sebagai waktu LOKAL dan meleset 7
-- jam — arah melesetnya membuat lockout login TERLIHAT sudah kedaluwarsa.
--
-- BUKAN memperbaiki bug yang sedang aktif. Diperiksa sebelum menulis migrasi
-- ini: Drizzle SUDAH menormalkan kolom naif ke UTC saat membacanya, jadi jalur
-- query bertipe (mis. db.select().from(loginAttempts)) sekarang benar dan tidak
-- bergantung TZ proses. Buktinya di dev:
--     teks di DB          : 2026-07-18 17:31:07.944
--     Drizzle mengembalikan: 2026-07-18T17:31:07.944Z   ← benar
--     new Date(teks naif) : 2026-07-18T10:31:07.944Z    ← meleset 7 jam
-- Baris ketiga itulah bahayanya: `db.execute()` mentah mengembalikan string
-- naif, dan siapa pun yang membungkusnya dengan new Date() mendapat nilai yang
-- benar hanya kalau prosesnya kebetulan UTC. Migrasi ini memindahkan
-- kebenarannya dari konvensi (normalisasi Drizzle + DB TimeZone=GMT) ke TIPE —
-- termasuk bila suatu saat pindah dari neon-http ke node-postgres, yang memang
-- memparse timestamp naif sebagai waktu lokal.
--
-- AMAN karena nilainya memang UTC: `AT TIME ZONE 'UTC'` MELABELI ulang, bukan
-- menggeser. Nilai instan yang sama, tipe yang akhirnya jujur. Tidak ada baris
-- yang ditulis ulang isinya. Diverifikasi read-only sebelum apply:
--     window_start AT TIME ZONE 'UTC' → 2026-07-18 17:31:07.944+00
-- yaitu instan yang PERSIS sama dengan yang Drizzle kembalikan hari ini.
--
-- period_start / period_end SENGAJA TIDAK ADA DI SINI. Keduanya `date` dan harus
-- tetap `date`: itu periode akuntansi, bukan momen waktu. Sesi lalu sudah pernah
-- kejadian toISOString() di WIB melempar periode Januari ke Desember.

-- ── client_assignments ───────────────────────────────────────
ALTER TABLE "client_assignments" ALTER COLUMN "assigned_at" TYPE timestamptz USING "assigned_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "client_assignments" ALTER COLUMN "assigned_at" SET DEFAULT now();--> statement-breakpoint

-- ── client_metric_visibility ─────────────────────────────────
ALTER TABLE "client_metric_visibility" ALTER COLUMN "created_at" TYPE timestamptz USING "created_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "client_metric_visibility" ALTER COLUMN "created_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "client_metric_visibility" ALTER COLUMN "updated_at" TYPE timestamptz USING "updated_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "client_metric_visibility" ALTER COLUMN "updated_at" SET DEFAULT now();--> statement-breakpoint

-- ── clients ──────────────────────────────────────────────────
ALTER TABLE "clients" ALTER COLUMN "created_at" TYPE timestamptz USING "created_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "clients" ALTER COLUMN "created_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "clients" ALTER COLUMN "updated_at" TYPE timestamptz USING "updated_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "clients" ALTER COLUMN "updated_at" SET DEFAULT now();--> statement-breakpoint

-- ── coa_mapping_history ──────────────────────────────────────
ALTER TABLE "coa_mapping_history" ALTER COLUMN "created_at" TYPE timestamptz USING "created_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "coa_mapping_history" ALTER COLUMN "created_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "coa_mapping_history" ALTER COLUMN "last_confirmed_at" TYPE timestamptz USING "last_confirmed_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "coa_mapping_history" ALTER COLUMN "last_confirmed_at" SET DEFAULT now();--> statement-breakpoint

-- ── financial_reports (period_start/period_end TIDAK disentuh) ─
ALTER TABLE "financial_reports" ALTER COLUMN "created_at" TYPE timestamptz USING "created_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "financial_reports" ALTER COLUMN "created_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "financial_reports" ALTER COLUMN "updated_at" TYPE timestamptz USING "updated_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "financial_reports" ALTER COLUMN "updated_at" SET DEFAULT now();--> statement-breakpoint
-- extracted_at nullable, tanpa default — jangan diberi default baru.
ALTER TABLE "financial_reports" ALTER COLUMN "extracted_at" TYPE timestamptz USING "extracted_at" AT TIME ZONE 'UTC';--> statement-breakpoint

-- ── login_attempts (lihat catatan rate limit di bawah) ───────
ALTER TABLE "login_attempts" ALTER COLUMN "window_start" TYPE timestamptz USING "window_start" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "login_attempts" ALTER COLUMN "window_start" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "login_attempts" ALTER COLUMN "updated_at" TYPE timestamptz USING "updated_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "login_attempts" ALTER COLUMN "updated_at" SET DEFAULT now();--> statement-breakpoint
-- locked_until nullable, tanpa default — NULL berarti "tidak terkunci".
ALTER TABLE "login_attempts" ALTER COLUMN "locked_until" TYPE timestamptz USING "locked_until" AT TIME ZONE 'UTC';--> statement-breakpoint

-- ── master_coa ───────────────────────────────────────────────
ALTER TABLE "master_coa" ALTER COLUMN "created_at" TYPE timestamptz USING "created_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "master_coa" ALTER COLUMN "created_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "master_coa" ALTER COLUMN "updated_at" TYPE timestamptz USING "updated_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "master_coa" ALTER COLUMN "updated_at" SET DEFAULT now();--> statement-breakpoint

-- ── report_line_items ────────────────────────────────────────
ALTER TABLE "report_line_items" ALTER COLUMN "created_at" TYPE timestamptz USING "created_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "report_line_items" ALTER COLUMN "created_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "report_line_items" ALTER COLUMN "updated_at" TYPE timestamptz USING "updated_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "report_line_items" ALTER COLUMN "updated_at" SET DEFAULT now();--> statement-breakpoint

-- ── users ────────────────────────────────────────────────────
ALTER TABLE "users" ALTER COLUMN "created_at" TYPE timestamptz USING "created_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "created_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "updated_at" TYPE timestamptz USING "updated_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "updated_at" SET DEFAULT now();
