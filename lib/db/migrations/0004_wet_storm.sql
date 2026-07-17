CREATE TABLE "client_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"assigned_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "client_assignments_client_user_unique" UNIQUE("client_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "logo" "bytea";--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "logo_mime" text;--> statement-breakpoint
ALTER TABLE "client_assignments" ADD CONSTRAINT "client_assignments_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_assignments" ADD CONSTRAINT "client_assignments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "client_assignments_client_id_idx" ON "client_assignments" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "client_assignments_user_id_idx" ON "client_assignments" USING btree ("user_id");