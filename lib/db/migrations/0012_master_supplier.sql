-- 0012 — master_supplier (Phase 5, Fase 1 / MP §4.B)
--
-- Nomornya 0012, bukan 0011 seperti tertulis di master plan: 0011 terpakai
-- untuk melonggarkan no_bukti & keterangan jurnal (2026-09-16). MP §8.14 memang
-- menyatakan nomor berkas mengikuti urutan penerapan nyata.
--
-- ══ PER KLIEN, seperti master_coa ═════════════════════════════════════════
-- Bandingkan tabel `layanan` yang global. Supplier milik satu klien tidak ada
-- hubungannya dengan supplier bernama sama milik klien lain, dan menyatukannya
-- berarti satu klien bisa melihat daftar rekanan klien lain.
--
-- ══ unique(client_id, nama) ═══════════════════════════════════════════════
-- Bukan sekadar kerapian: impor supplier memakai UPSERT BY NAMA, jadi nama
-- adalah kunci pencocokannya. Tanpa batasan ini, dua baris bernama sama membuat
-- impor berikutnya tidak bisa menentukan mana yang harus diperbarui.
--
-- ══ akun_hutang_default_id ON DELETE SET NULL ═════════════════════════════
-- SENGAJA berbeda dari journal_lines.master_coa_id yang RESTRICT. Akun hutang
-- default hanya pengisi awal formulir — kehilangannya tidak mengubah satu angka
-- pun, jadi ganti-massal Master COA boleh memutusnya dan menghitungnya di
-- laporan dampak. Baris jurnal tidak punya kemewahan itu: ia pencatatan yang
-- sudah terjadi, dan karena itu memblokir penggantian.
--
-- termin_pembayaran menyimpan JUMLAH HARI (0-365) sebagai integer, pola yang
-- sama dengan contracts.tanggal_penagihan. Tipe interval mengundang nilai
-- seperti '1 mon 3 days' yang tidak bisa dijumlahkan ke tanggal jatuh tempo
-- tanpa aturan tambahan.
CREATE TABLE "master_supplier" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"nama" text NOT NULL,
	"kontak" text,
	"npwp" text,
	"termin_pembayaran" integer,
	"akun_hutang_default_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "master_supplier_client_nama_unique" UNIQUE("client_id","nama")
);
--> statement-breakpoint
ALTER TABLE "master_supplier" ADD CONSTRAINT "master_supplier_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "master_supplier" ADD CONSTRAINT "master_supplier_akun_hutang_default_id_master_coa_id_fk" FOREIGN KEY ("akun_hutang_default_id") REFERENCES "public"."master_coa"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "master_supplier_client_id_idx" ON "master_supplier" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "master_supplier_akun_hutang_idx" ON "master_supplier" USING btree ("akun_hutang_default_id");
