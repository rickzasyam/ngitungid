CREATE TYPE "public"."line_item_status" AS ENUM('matched', 'unmatched', 'edited', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."report_status" AS ENUM('uploaded', 'extracting', 'review', 'mapped', 'confirmed');--> statement-breakpoint
CREATE TYPE "public"."report_type" AS ENUM('laba_rugi', 'neraca', 'arus_kas');--> statement-breakpoint
CREATE TABLE "client_metric_visibility" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"metric_id" text NOT NULL,
	"is_visible" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "client_metric_visibility_client_metric_unique" UNIQUE("client_id","metric_id")
);
--> statement-breakpoint
CREATE TABLE "clients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "coa_mapping_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"raw_name" text NOT NULL,
	"master_coa_id" uuid NOT NULL,
	"confirmed_count" integer DEFAULT 1 NOT NULL,
	"last_confirmed_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "coa_mapping_history_client_raw_name_unique" UNIQUE("client_id","raw_name")
);
--> statement-breakpoint
CREATE TABLE "financial_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"report_type" "report_type" NOT NULL,
	"period_start" date NOT NULL,
	"period_end" date NOT NULL,
	"source_file_name" text NOT NULL,
	"status" "report_status" DEFAULT 'uploaded' NOT NULL,
	"extracted_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "financial_reports_client_type_period_unique" UNIQUE("client_id","report_type","period_start","period_end")
);
--> statement-breakpoint
CREATE TABLE "master_coa" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"kode" text NOT NULL,
	"nama" text NOT NULL,
	"posisi" text NOT NULL,
	"kelompok" text NOT NULL,
	"sub_kelompok" text NOT NULL,
	"class_cf" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "master_coa_client_kode_unique" UNIQUE("client_id","kode")
);
--> statement-breakpoint
CREATE TABLE "report_line_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"report_id" uuid NOT NULL,
	"raw_name" text NOT NULL,
	"suggested_coa_id" uuid,
	"master_coa_id" uuid,
	"amount" numeric(18, 2) NOT NULL,
	"is_subtotal" boolean DEFAULT false NOT NULL,
	"confidence" integer,
	"status" "line_item_status" DEFAULT 'unmatched' NOT NULL,
	"edited_name" text,
	"line_order" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "client_metric_visibility" ADD CONSTRAINT "client_metric_visibility_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coa_mapping_history" ADD CONSTRAINT "coa_mapping_history_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coa_mapping_history" ADD CONSTRAINT "coa_mapping_history_master_coa_id_master_coa_id_fk" FOREIGN KEY ("master_coa_id") REFERENCES "public"."master_coa"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_reports" ADD CONSTRAINT "financial_reports_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "master_coa" ADD CONSTRAINT "master_coa_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_line_items" ADD CONSTRAINT "report_line_items_report_id_financial_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."financial_reports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_line_items" ADD CONSTRAINT "report_line_items_suggested_coa_id_master_coa_id_fk" FOREIGN KEY ("suggested_coa_id") REFERENCES "public"."master_coa"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_line_items" ADD CONSTRAINT "report_line_items_master_coa_id_master_coa_id_fk" FOREIGN KEY ("master_coa_id") REFERENCES "public"."master_coa"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "financial_reports_client_type_period_idx" ON "financial_reports" USING btree ("client_id","report_type","period_start");--> statement-breakpoint
CREATE INDEX "master_coa_client_id_idx" ON "master_coa" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "report_line_items_report_id_idx" ON "report_line_items" USING btree ("report_id");--> statement-breakpoint
CREATE INDEX "report_line_items_master_coa_id_idx" ON "report_line_items" USING btree ("master_coa_id");