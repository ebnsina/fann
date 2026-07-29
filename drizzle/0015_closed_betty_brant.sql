ALTER TABLE "organizations" ADD COLUMN "domain_token" text;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "domain_checked_at" timestamp with time zone;