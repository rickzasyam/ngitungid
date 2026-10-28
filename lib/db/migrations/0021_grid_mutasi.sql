CREATE TABLE "cash_mutation_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"pola" text NOT NULL,
	"arah" text DEFAULT 'keduanya' NOT NULL,
	"akun_lawan_id" uuid NOT NULL,
	"akun_kas_id" uuid,
	"prioritas" integer DEFAULT 0 NOT NULL,
	"aktif" boolean DEFAULT true NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cash_mutation_rules_arah_check" CHECK ("cash_mutation_rules"."arah" IN ('masuk', 'keluar', 'keduanya'))
);
--> statement-breakpoint
ALTER TABLE "cash_mutations" ADD COLUMN "urutan" integer;--> statement-breakpoint
ALTER TABLE "cash_mutations" ADD COLUMN "catatan" text;--> statement-breakpoint
ALTER TABLE "client_accounting_settings" ADD COLUMN "akun_pindah_buku_id" uuid;--> statement-breakpoint
ALTER TABLE "cash_mutation_rules" ADD CONSTRAINT "cash_mutation_rules_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_mutation_rules" ADD CONSTRAINT "cash_mutation_rules_akun_lawan_id_master_coa_id_fk" FOREIGN KEY ("akun_lawan_id") REFERENCES "public"."master_coa"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_mutation_rules" ADD CONSTRAINT "cash_mutation_rules_akun_kas_id_master_coa_id_fk" FOREIGN KEY ("akun_kas_id") REFERENCES "public"."master_coa"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_mutation_rules" ADD CONSTRAINT "cash_mutation_rules_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cash_mutation_rules_client_aktif_idx" ON "cash_mutation_rules" USING btree ("client_id","aktif");--> statement-breakpoint
ALTER TABLE "client_accounting_settings" ADD CONSTRAINT "client_accounting_settings_akun_pindah_buku_id_master_coa_id_fk" FOREIGN KEY ("akun_pindah_buku_id") REFERENCES "public"."master_coa"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_mutations" ADD CONSTRAINT "cash_mutations_urutan_check" CHECK ("cash_mutations"."urutan" IS NULL OR "cash_mutations"."urutan" >= 1);