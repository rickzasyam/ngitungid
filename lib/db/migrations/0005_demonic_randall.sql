CREATE TABLE "login_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"failed_count" integer DEFAULT 0 NOT NULL,
	"window_start" timestamp DEFAULT now() NOT NULL,
	"locked_until" timestamp,
	"last_ip" text,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "login_attempts_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE INDEX "login_attempts_locked_until_idx" ON "login_attempts" USING btree ("locked_until");