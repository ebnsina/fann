CREATE TYPE "public"."interview_mode" AS ENUM('video', 'phone', 'onsite');--> statement-breakpoint
CREATE TYPE "public"."offer_status" AS ENUM('draft', 'sent', 'accepted', 'declined', 'withdrawn', 'expired');--> statement-breakpoint
CREATE TABLE "application_tags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"application_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "interview_participants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"interview_id" uuid NOT NULL,
	"user_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "interviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"application_id" uuid NOT NULL,
	"title" text NOT NULL,
	"mode" "interview_mode" DEFAULT 'video' NOT NULL,
	"location" text,
	"starts_at" timestamp with time zone NOT NULL,
	"duration_minutes" integer DEFAULT 45 NOT NULL,
	"notes" text,
	"created_by_user_id" uuid,
	"cancelled_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "offers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"application_id" uuid NOT NULL,
	"salary_amount" integer NOT NULL,
	"salary_currency" varchar(3) DEFAULT 'USD' NOT NULL,
	"salary_period" text DEFAULT 'year' NOT NULL,
	"extras" text,
	"start_date" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"status" "offer_status" DEFAULT 'draft' NOT NULL,
	"sent_at" timestamp with time zone,
	"decided_at" timestamp with time zone,
	"created_by_user_id" uuid
);
--> statement-breakpoint
CREATE TABLE "tags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "application_tags" ADD CONSTRAINT "application_tags_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_tags" ADD CONSTRAINT "application_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interview_participants" ADD CONSTRAINT "interview_participants_interview_id_interviews_id_fk" FOREIGN KEY ("interview_id") REFERENCES "public"."interviews"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interview_participants" ADD CONSTRAINT "interview_participants_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interviews" ADD CONSTRAINT "interviews_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interviews" ADD CONSTRAINT "interviews_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offers" ADD CONSTRAINT "offers_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offers" ADD CONSTRAINT "offers_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tags" ADD CONSTRAINT "tags_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "application_tags_key" ON "application_tags" USING btree ("application_id","tag_id");--> statement-breakpoint
CREATE INDEX "application_tags_tag_idx" ON "application_tags" USING btree ("tag_id");--> statement-breakpoint
CREATE UNIQUE INDEX "interview_participants_key" ON "interview_participants" USING btree ("interview_id","user_id");--> statement-breakpoint
CREATE INDEX "interviews_application_idx" ON "interviews" USING btree ("application_id","starts_at");--> statement-breakpoint
CREATE INDEX "offers_application_idx" ON "offers" USING btree ("application_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "tags_org_name_key" ON "tags" USING btree ("organization_id","name");