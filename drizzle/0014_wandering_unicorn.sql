CREATE TABLE "company_slug_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"company_id" uuid NOT NULL,
	"slug" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "company_slug_history" ADD CONSTRAINT "company_slug_history_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "company_slug_history_key" ON "company_slug_history" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "company_slug_history_company_idx" ON "company_slug_history" USING btree ("company_id");