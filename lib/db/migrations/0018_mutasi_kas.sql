CREATE TABLE "cash_mutation_allocations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"mutation_id" uuid NOT NULL,
	"invoice_id" uuid NOT NULL,
	"nominal" numeric(18, 2) NOT NULL,
	"termin_urutan" integer,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cash_mutation_allocations_mutation_invoice_unique" UNIQUE("mutation_id","invoice_id"),
	CONSTRAINT "cash_mutation_allocations_nominal_check" CHECK ("cash_mutation_allocations"."nominal" > 0),
	CONSTRAINT "cash_mutation_allocations_termin_check" CHECK ("cash_mutation_allocations"."termin_urutan" IS NULL OR "cash_mutation_allocations"."termin_urutan" >= 1)
);
--> statement-breakpoint
CREATE TABLE "cash_mutation_imports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"akun_kas_id" uuid NOT NULL,
	"nama_berkas" text NOT NULL,
	"jumlah_baris" integer NOT NULL,
	"diimpor_oleh" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cash_mutations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"akun_kas_id" uuid NOT NULL,
	"tanggal" date NOT NULL,
	"keterangan" text,
	"debit" numeric(18, 2) DEFAULT '0' NOT NULL,
	"kredit" numeric(18, 2) DEFAULT '0' NOT NULL,
	"saldo" numeric(18, 2),
	"fingerprint" text NOT NULL,
	"import_id" uuid,
	"akun_lawan_id" uuid,
	"journal_id" uuid,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cash_mutations_debit_kredit_check" CHECK ("cash_mutations"."debit" >= 0 AND "cash_mutations"."kredit" >= 0 AND (("cash_mutations"."debit" = 0) <> ("cash_mutations"."kredit" = 0)))
);
--> statement-breakpoint
ALTER TABLE "cash_mutation_allocations" ADD CONSTRAINT "cash_mutation_allocations_mutation_id_cash_mutations_id_fk" FOREIGN KEY ("mutation_id") REFERENCES "public"."cash_mutations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_mutation_allocations" ADD CONSTRAINT "cash_mutation_allocations_invoice_id_purchase_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."purchase_invoices"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_mutation_allocations" ADD CONSTRAINT "cash_mutation_allocations_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_mutation_imports" ADD CONSTRAINT "cash_mutation_imports_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_mutation_imports" ADD CONSTRAINT "cash_mutation_imports_akun_kas_id_master_coa_id_fk" FOREIGN KEY ("akun_kas_id") REFERENCES "public"."master_coa"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_mutation_imports" ADD CONSTRAINT "cash_mutation_imports_diimpor_oleh_users_id_fk" FOREIGN KEY ("diimpor_oleh") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_mutations" ADD CONSTRAINT "cash_mutations_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_mutations" ADD CONSTRAINT "cash_mutations_akun_kas_id_master_coa_id_fk" FOREIGN KEY ("akun_kas_id") REFERENCES "public"."master_coa"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_mutations" ADD CONSTRAINT "cash_mutations_import_id_cash_mutation_imports_id_fk" FOREIGN KEY ("import_id") REFERENCES "public"."cash_mutation_imports"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_mutations" ADD CONSTRAINT "cash_mutations_akun_lawan_id_master_coa_id_fk" FOREIGN KEY ("akun_lawan_id") REFERENCES "public"."master_coa"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_mutations" ADD CONSTRAINT "cash_mutations_journal_id_journal_entries_id_fk" FOREIGN KEY ("journal_id") REFERENCES "public"."journal_entries"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_mutations" ADD CONSTRAINT "cash_mutations_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cash_mutation_allocations_invoice_idx" ON "cash_mutation_allocations" USING btree ("invoice_id");--> statement-breakpoint
CREATE INDEX "cash_mutation_allocations_mutation_idx" ON "cash_mutation_allocations" USING btree ("mutation_id");--> statement-breakpoint
CREATE INDEX "cash_mutation_imports_client_idx" ON "cash_mutation_imports" USING btree ("client_id","created_at");--> statement-breakpoint
CREATE INDEX "cash_mutations_client_tanggal_idx" ON "cash_mutations" USING btree ("client_id","tanggal");--> statement-breakpoint
CREATE INDEX "cash_mutations_akun_tanggal_idx" ON "cash_mutations" USING btree ("akun_kas_id","tanggal");--> statement-breakpoint
CREATE INDEX "cash_mutations_fingerprint_idx" ON "cash_mutations" USING btree ("fingerprint");--> statement-breakpoint
CREATE INDEX "cash_mutations_journal_idx" ON "cash_mutations" USING btree ("journal_id");