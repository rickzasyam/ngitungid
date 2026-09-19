CREATE TYPE "public"."account_type" AS ENUM('asset', 'liability', 'equity', 'revenue', 'expense');--> statement-breakpoint
ALTER TABLE "master_coa" ADD COLUMN "tipe_akun" "account_type";--> statement-breakpoint
ALTER TABLE "master_coa" ADD COLUMN "is_kas" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE INDEX "master_coa_client_is_kas_idx" ON "master_coa" USING btree ("client_id") WHERE "master_coa"."is_kas";