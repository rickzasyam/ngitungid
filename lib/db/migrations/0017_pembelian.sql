CREATE TYPE "public"."purchase_payment_method" AS ENUM('kredit', 'tunai');--> statement-breakpoint
CREATE TABLE "client_accounting_settings" (
	"client_id" uuid PRIMARY KEY NOT NULL,
	"akun_ppn_masukan_id" uuid,
	"posting_bisa_diedit" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "purchase_invoice_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invoice_id" uuid NOT NULL,
	"nama_barang" text NOT NULL,
	"qty" numeric(18, 4) NOT NULL,
	"satuan" text,
	"harga_satuan" numeric(18, 2) NOT NULL,
	"subtotal" numeric(18, 2) NOT NULL,
	"line_order" integer NOT NULL,
	CONSTRAINT "purchase_invoice_lines_nominal_check" CHECK ("purchase_invoice_lines"."qty" > 0 AND "purchase_invoice_lines"."harga_satuan" >= 0 AND "purchase_invoice_lines"."subtotal" >= 0)
);
--> statement-breakpoint
CREATE TABLE "purchase_invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"supplier_id" uuid NOT NULL,
	"tanggal" date NOT NULL,
	"no_invoice" text,
	"cara_bayar" "purchase_payment_method" NOT NULL,
	"akun_tujuan_id" uuid NOT NULL,
	"akun_kas_id" uuid,
	"akun_hutang_id" uuid,
	"akun_ppn_masukan_id" uuid,
	"ppn" numeric(18, 2) DEFAULT '0' NOT NULL,
	"jumlah_termin" integer DEFAULT 1 NOT NULL,
	"jatuh_tempo_akhir" date,
	"keterangan" text,
	"journal_id" uuid,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "purchase_invoices_supplier_no_invoice_unique" UNIQUE("client_id","supplier_id","no_invoice"),
	CONSTRAINT "purchase_invoices_cara_bayar_check" CHECK (("purchase_invoices"."cara_bayar" <> 'kredit' OR ("purchase_invoices"."akun_hutang_id" IS NOT NULL AND "purchase_invoices"."jatuh_tempo_akhir" IS NOT NULL))
        AND ("purchase_invoices"."cara_bayar" <> 'tunai' OR "purchase_invoices"."akun_kas_id" IS NOT NULL)),
	CONSTRAINT "purchase_invoices_ppn_check" CHECK ("purchase_invoices"."ppn" >= 0 AND ("purchase_invoices"."ppn" = 0 OR "purchase_invoices"."akun_ppn_masukan_id" IS NOT NULL)),
	CONSTRAINT "purchase_invoices_termin_check" CHECK ("purchase_invoices"."jumlah_termin" >= 1)
);
--> statement-breakpoint
ALTER TABLE "audit_events" ADD COLUMN "nilai_sebelum" jsonb;--> statement-breakpoint
ALTER TABLE "audit_events" ADD COLUMN "nilai_sesudah" jsonb;--> statement-breakpoint
ALTER TABLE "master_supplier" ADD COLUMN "bank_nama" text;--> statement-breakpoint
ALTER TABLE "master_supplier" ADD COLUMN "bank_rekening" text;--> statement-breakpoint
ALTER TABLE "master_supplier" ADD COLUMN "bank_atas_nama" text;--> statement-breakpoint
ALTER TABLE "client_accounting_settings" ADD CONSTRAINT "client_accounting_settings_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_accounting_settings" ADD CONSTRAINT "client_accounting_settings_akun_ppn_masukan_id_master_coa_id_fk" FOREIGN KEY ("akun_ppn_masukan_id") REFERENCES "public"."master_coa"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_invoice_lines" ADD CONSTRAINT "purchase_invoice_lines_invoice_id_purchase_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."purchase_invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_invoices" ADD CONSTRAINT "purchase_invoices_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_invoices" ADD CONSTRAINT "purchase_invoices_supplier_id_master_supplier_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."master_supplier"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_invoices" ADD CONSTRAINT "purchase_invoices_akun_tujuan_id_master_coa_id_fk" FOREIGN KEY ("akun_tujuan_id") REFERENCES "public"."master_coa"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_invoices" ADD CONSTRAINT "purchase_invoices_akun_kas_id_master_coa_id_fk" FOREIGN KEY ("akun_kas_id") REFERENCES "public"."master_coa"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_invoices" ADD CONSTRAINT "purchase_invoices_akun_hutang_id_master_coa_id_fk" FOREIGN KEY ("akun_hutang_id") REFERENCES "public"."master_coa"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_invoices" ADD CONSTRAINT "purchase_invoices_akun_ppn_masukan_id_master_coa_id_fk" FOREIGN KEY ("akun_ppn_masukan_id") REFERENCES "public"."master_coa"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_invoices" ADD CONSTRAINT "purchase_invoices_journal_id_journal_entries_id_fk" FOREIGN KEY ("journal_id") REFERENCES "public"."journal_entries"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_invoices" ADD CONSTRAINT "purchase_invoices_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "purchase_invoice_lines_invoice_idx" ON "purchase_invoice_lines" USING btree ("invoice_id");--> statement-breakpoint
CREATE INDEX "purchase_invoices_client_tanggal_idx" ON "purchase_invoices" USING btree ("client_id","tanggal");--> statement-breakpoint
CREATE INDEX "purchase_invoices_supplier_idx" ON "purchase_invoices" USING btree ("supplier_id");--> statement-breakpoint
CREATE INDEX "purchase_invoices_journal_idx" ON "purchase_invoices" USING btree ("journal_id");