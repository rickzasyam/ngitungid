-- 0009 — kontrak klien + penghubung ke master Layanan
--
-- ══ NOMINAL: numeric(18,2), BUKAN float, BUKAN bigint minor unit ═══════════
-- Sama persis dengan report_line_items.amount yang sudah ada. Alasannya:
--   * Driver mengembalikan numeric sebagai STRING, jadi nilainya tidak pernah
--     melewati float JS. Konversi ke number dilakukan eksplisit di titik pakai
--     (`Number(row.nominal)`), pola yang sudah dipakai seluruh jalur laporan.
--   * 18 digit menampung sampai ~10^16 rupiah — jauh di atas nilai kontrak
--     ratusan juta, tanpa risiko overflow.
--   * bigint minor unit juga akurat, TAPI: menyimpang dari satu-satunya
--     representasi uang yang sudah ada di basis kode ini, dan rupiah tidak
--     punya sen dalam praktik sehingga perkalian 100 murni upacara. Dua
--     representasi uang di satu database berarti dua aturan konversi dan satu
--     kesempatan lagi untuk salah.
--
-- ══ TANGGAL: `date`, diperlakukan sebagai STRING ═══════════════════════════
-- tanggal_mulai / tanggal_akhir bertipe `date`, PERSIS seperti period_start /
-- period_end. Aturan yang sama berlaku penuh: jangan pernah membangun Date dari
-- keduanya, jangan lewat Intl, jangan toISOString. Perbandingan tanggal
-- dilakukan sebagai string 'YYYY-MM-DD' (lihat lib/contracts.ts) — format itu
-- memang urut secara leksikografis, jadi tidak butuh objek Date sama sekali.
--
-- ══ STATUS TIDAK DISIMPAN ══════════════════════════════════════════════════
-- Aktif / akan datang / berakhir DITURUNKAN dari rentang tanggal terhadap hari
-- ini. Kolom status akan basi begitu tanggal lewat tanpa ada proses yang
-- menulis ulang — dan tidak ada proses seperti itu.
--
-- ══ dokumen bytea ══════════════════════════════════════════════════════════
-- Sama seperti financial_reports.source_pdf (keputusan 2026-08-06). Kolom ini
-- TIDAK BOLEH ikut di query daftar — selalu pilih kolom eksplisit.
--
-- unique(client_id, no_kontrak): nomor kontrak unik PER KLIEN, bukan global.
-- Dua klien berbeda boleh memakai penomoran yang kebetulan sama.
CREATE TYPE "public"."jenis_kontrak" AS ENUM('reguler', 'project');--> statement-breakpoint
CREATE TABLE "contracts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"no_kontrak" text NOT NULL,
	"jenis" "jenis_kontrak" NOT NULL,
	"tanggal_mulai" date NOT NULL,
	"tanggal_akhir" date NOT NULL,
	"tanggal_penagihan" integer NOT NULL,
	"nominal" numeric(18, 2) NOT NULL,
	"dokumen" "bytea" NOT NULL,
	"nama_dokumen" text NOT NULL,
	"ukuran_dokumen" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "contracts_client_no_kontrak_unique" UNIQUE("client_id","no_kontrak")
);
--> statement-breakpoint
CREATE TABLE "contract_layanan" (
	"contract_id" uuid NOT NULL,
	"layanan_id" uuid NOT NULL,
	CONSTRAINT "contract_layanan_contract_id_layanan_id_pk" PRIMARY KEY("contract_id","layanan_id")
);
--> statement-breakpoint
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_layanan" ADD CONSTRAINT "contract_layanan_contract_id_contracts_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."contracts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- RESTRICT, BUKAN cascade. Ini pertahanan terakhir aturan "layanan tidak pernah
-- dihapus": tidak ada endpoint DELETE untuk layanan, tapi kalau suatu hari ada
-- yang menambahkannya, Postgres yang akan menolak selama masih ada kontrak yang
-- memakainya. JANGAN diubah jadi cascade.
ALTER TABLE "contract_layanan" ADD CONSTRAINT "contract_layanan_layanan_id_layanan_id_fk" FOREIGN KEY ("layanan_id") REFERENCES "public"."layanan"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "contracts_client_id_idx" ON "contracts" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "contract_layanan_layanan_id_idx" ON "contract_layanan" USING btree ("layanan_id");
