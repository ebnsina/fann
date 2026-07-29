CREATE TYPE "public"."email_status" AS ENUM('sent', 'failed');--> statement-breakpoint
CREATE TABLE "email_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" uuid,
	"to_email" text NOT NULL,
	"tag" text NOT NULL,
	"subject" text NOT NULL,
	"status" "email_status" NOT NULL,
	"provider_message_id" text,
	"error" text,
	"entity_type" text,
	"entity_id" uuid
);
--> statement-breakpoint
ALTER TABLE "email_log" ADD CONSTRAINT "email_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "email_log_user_idx" ON "email_log" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "email_log_tag_idx" ON "email_log" USING btree ("tag","created_at");--> statement-breakpoint
CREATE INDEX "email_log_status_idx" ON "email_log" USING btree ("status","created_at");