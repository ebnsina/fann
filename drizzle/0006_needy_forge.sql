CREATE TYPE "public"."stage_kind" AS ENUM('applied', 'screening', 'interview', 'offer', 'hired', 'rejected');--> statement-breakpoint
CREATE TABLE "job_stages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"job_id" uuid NOT NULL,
	"name" text NOT NULL,
	"kind" "stage_kind" DEFAULT 'interview' NOT NULL,
	"position" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pipeline_template_stages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"template_id" uuid NOT NULL,
	"name" text NOT NULL,
	"kind" "stage_kind" DEFAULT 'interview' NOT NULL,
	"position" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pipeline_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stage_transitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"application_id" uuid NOT NULL,
	"from_stage_id" uuid,
	"to_stage_id" uuid,
	"actor_user_id" uuid,
	"note" text
);
--> statement-breakpoint
ALTER TABLE "applications" ADD COLUMN "current_stage_id" uuid;--> statement-breakpoint
ALTER TABLE "job_stages" ADD CONSTRAINT "job_stages_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pipeline_template_stages" ADD CONSTRAINT "pipeline_template_stages_template_id_pipeline_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."pipeline_templates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pipeline_templates" ADD CONSTRAINT "pipeline_templates_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stage_transitions" ADD CONSTRAINT "stage_transitions_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stage_transitions" ADD CONSTRAINT "stage_transitions_from_stage_id_job_stages_id_fk" FOREIGN KEY ("from_stage_id") REFERENCES "public"."job_stages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stage_transitions" ADD CONSTRAINT "stage_transitions_to_stage_id_job_stages_id_fk" FOREIGN KEY ("to_stage_id") REFERENCES "public"."job_stages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stage_transitions" ADD CONSTRAINT "stage_transitions_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "job_stages_job_idx" ON "job_stages" USING btree ("job_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "job_stages_order" ON "job_stages" USING btree ("job_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "pipeline_template_stages_order" ON "pipeline_template_stages" USING btree ("template_id","position");--> statement-breakpoint
CREATE INDEX "pipeline_templates_org_idx" ON "pipeline_templates" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "pipeline_templates_one_default_per_org" ON "pipeline_templates" USING btree ("organization_id") WHERE "pipeline_templates"."is_default";--> statement-breakpoint
CREATE INDEX "stage_transitions_application_idx" ON "stage_transitions" USING btree ("application_id","created_at");--> statement-breakpoint
CREATE INDEX "stage_transitions_stage_idx" ON "stage_transitions" USING btree ("to_stage_id","created_at");
--> statement-breakpoint
-- Hand-added. `applications.current_stage_id` is declared without a `references()`
-- in the schema, because doing so would make `application.ts` and `ats.ts` import
-- each other. The constraint is still wanted: deleting a stage must empty the
-- column rather than leave every card on that column pointing at nothing.
ALTER TABLE "applications" ADD CONSTRAINT "applications_current_stage_id_job_stages_id_fk" FOREIGN KEY ("current_stage_id") REFERENCES "public"."job_stages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
-- The board's one query: every application on a job, grouped by column.
CREATE INDEX "applications_job_stage_idx" ON "applications" USING btree ("job_id","current_stage_id");
