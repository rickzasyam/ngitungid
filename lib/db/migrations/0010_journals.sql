-- 0010 — jurnal umum: journal_entries + journal_lines (Phase 5, Fase 1 / MP §4.A)
--
-- ══ SQL INI DIPANGKAS TANGAN — BACA SEBELUM MENGUBAH ══════════════════════
-- `drizzle-kit generate` mengeluarkan JAUH lebih banyak dari ini: ia juga
-- membuat ulang enum jenis_kontrak & user_language, tabel contracts,
-- contract_layanan, layanan, kolom users.language/currency_format, bahkan
-- ALTER TYPE user_role ADD VALUE 'finance'. Semua itu SUDAH ADA di database —
-- dan statement pertamanya (CREATE TYPE "jenis_kontrak") pasti gagal.
--
-- Sebabnya: migrasi 0006–0009 ditulis tangan dan terdaftar di meta/_journal.json,
-- tapi TIDAK disertai berkas snapshot-nya (meta/ hanya punya 0000–0005). Karena
-- drizzle-kit membandingkan schema.ts dengan snapshot TERAKHIR yang ada, ia
-- membandingkannya dengan keadaan 0005 dan menganggap seluruh isi 0006–0009
-- belum pernah dibuat.
--
-- meta/0010_snapshot.json yang ikut ter-generate BENAR dan SENGAJA DIPERTAHANKAN:
-- snapshot drizzle berisi keadaan penuh (14 tabel, 8 enum), bukan delta. Dengan
-- ia hadir, rantai snapshot pulih — `db:generate` untuk 0011 (master_supplier)
-- akan membandingkan terhadap 0010 dan hanya mengeluarkan objek supplier.
-- Verifikasi terhadap branch dev sebelum pemangkasan: 12 tabel, 10 migrasi
-- terpakai (0000–0009), journal_entries/journal_lines belum ada.
--
-- ══ URUTAN ════════════════════════════════════════════════════════════════
-- CREATE TYPE lalu memakainya di CREATE TABLE dalam satu transaksi AMAN —
-- pembatasan Postgres yang dicatat di 0007 hanya berlaku untuk nilai yang
-- ditambahkan lewat ALTER TYPE ... ADD VALUE ke tipe yang sudah ada.
--
-- ══ journal_status punya 'posted' sejak sekarang ══════════════════════════
-- Fase 1 hanya menulis 'draft'. 'posted' tetap dibuat di sini supaya Fase 2
-- tidak perlu ALTER TYPE ... ADD VALUE — yang nilainya tidak boleh dipakai di
-- transaksi yang sama, jadi posting harus dipecah dua migrasi tanpa alasan.
--
-- ══ CHECK journal_lines_satu_sisi_check ═══════════════════════════════════
-- Satu baris jurnal adalah debit ATAU kredit, dan tidak pernah bertanda minus.
-- Aturan penuhnya (≥2 baris, Σ debit = Σ kredit dalam sen bulat) ada di
-- lib/journal.ts; CHECK ini jaring terakhir untuk jalur tulis yang kelak lupa
-- memanggilnya.
--
-- Syarat ">= 0" ditambahkan setelah matriks uji menunjukkan bentuk pertama
-- (hanya "sisi mana yang nol") MELOLOSKAN debit -100 / kredit 0: ekspresinya tidak
-- pernah melihat tanda. Dua baris negatif pun masih bisa saling menyeimbangkan,
-- jadi tidak ada pemeriksaan hilir yang akan menangkapnya.
CREATE TYPE "public"."journal_source" AS ENUM('manual');--> statement-breakpoint
CREATE TYPE "public"."journal_status" AS ENUM('draft', 'posted');--> statement-breakpoint
CREATE TABLE "journal_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"tanggal" date NOT NULL,
	"no_bukti" text NOT NULL,
	"keterangan" text NOT NULL,
	"sumber" "journal_source" DEFAULT 'manual' NOT NULL,
	"status" "journal_status" DEFAULT 'draft' NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "journal_entries_client_no_bukti_unique" UNIQUE("client_id","no_bukti")
);
--> statement-breakpoint
CREATE TABLE "journal_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"journal_id" uuid NOT NULL,
	"master_coa_id" uuid NOT NULL,
	"debit" numeric(18, 2) DEFAULT '0' NOT NULL,
	"kredit" numeric(18, 2) DEFAULT '0' NOT NULL,
	"keterangan" text,
	"line_order" integer NOT NULL,
	CONSTRAINT "journal_lines_satu_sisi_check" CHECK ("journal_lines"."debit" >= 0 AND "journal_lines"."kredit" >= 0 AND (("journal_lines"."debit" = 0) <> ("journal_lines"."kredit" = 0)))
);
--> statement-breakpoint
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- RESTRICT, BUKAN cascade & bukan set null. Siapa yang membuat sebuah jurnal
-- adalah bagian dari nilai buktinya. Akun yang pernah membuat jurnal tidak bisa
-- dihapus selama jurnalnya masih ada — Postgres yang menolak, bukan kode.
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_journal_id_journal_entries_id_fk" FOREIGN KEY ("journal_id") REFERENCES "public"."journal_entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- RESTRICT: akun yang sudah dipakai jurnal tidak boleh hilang diam-diam.
-- Konsekuensinya ganti-massal/hapus-baris Master COA WAJIB sadar tabel ini —
-- lihat buildReplacePlan (lib/coa/replace-plan.ts).
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_master_coa_id_master_coa_id_fk" FOREIGN KEY ("master_coa_id") REFERENCES "public"."master_coa"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "journal_entries_client_tanggal_idx" ON "journal_entries" USING btree ("client_id","tanggal");--> statement-breakpoint
CREATE INDEX "journal_entries_client_status_idx" ON "journal_entries" USING btree ("client_id","status");--> statement-breakpoint
CREATE INDEX "journal_lines_journal_id_idx" ON "journal_lines" USING btree ("journal_id");--> statement-breakpoint
CREATE INDEX "journal_lines_master_coa_id_idx" ON "journal_lines" USING btree ("master_coa_id");
