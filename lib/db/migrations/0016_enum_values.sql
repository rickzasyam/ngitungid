ALTER TYPE "public"."audit_entity_type" ADD VALUE 'purchase_invoice';--> statement-breakpoint
ALTER TYPE "public"."audit_entity_type" ADD VALUE 'cash_mutation';--> statement-breakpoint
ALTER TYPE "public"."journal_source" ADD VALUE 'pembelian';--> statement-breakpoint
ALTER TYPE "public"."journal_source" ADD VALUE 'mutasi_kas';