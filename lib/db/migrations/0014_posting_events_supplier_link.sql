CREATE TYPE "public"."audit_entity_type" AS ENUM('journal', 'master_coa', 'period_lock', 'supplier');--> statement-breakpoint
CREATE TABLE "audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"entity_type" "audit_entity_type" NOT NULL,
	"entity_id" uuid,
	"event" text NOT NULL,
	"user_id" uuid,
	"catatan" text,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "audit_events_entity_id_check" CHECK ("audit_events"."entity_type" <> 'journal' OR "audit_events"."entity_id" IS NOT NULL)
);
--> statement-breakpoint
ALTER TABLE "journal_entries" ADD COLUMN "posted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "journal_entries" ADD COLUMN "posted_by" uuid;--> statement-breakpoint
ALTER TABLE "journal_entries" ADD COLUMN "reversal_of_id" uuid;--> statement-breakpoint
ALTER TABLE "journal_lines" ADD COLUMN "supplier_id" uuid;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_events_entity_idx" ON "audit_events" USING btree ("entity_type","entity_id","at");--> statement-breakpoint
CREATE INDEX "audit_events_client_at_idx" ON "audit_events" USING btree ("client_id","at");--> statement-breakpoint
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_posted_by_users_id_fk" FOREIGN KEY ("posted_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_reversal_of_id_fk" FOREIGN KEY ("reversal_of_id") REFERENCES "public"."journal_entries"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_supplier_id_master_supplier_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."master_supplier"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "journal_entries_reversal_of_idx" ON "journal_entries" USING btree ("reversal_of_id");--> statement-breakpoint
CREATE INDEX "journal_lines_supplier_id_idx" ON "journal_lines" USING btree ("supplier_id");