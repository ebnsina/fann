CREATE TYPE "public"."document_kind" AS ENUM('resume', 'cover_letter', 'portfolio', 'other');--> statement-breakpoint
CREATE TYPE "public"."profile_visibility" AS ENUM('private', 'anonymous', 'public');--> statement-breakpoint
CREATE TYPE "public"."application_event_type" AS ENUM('submitted', 'viewed', 'status_changed', 'note_added', 'email_sent', 'interview_scheduled', 'withdrawn');--> statement-breakpoint
CREATE TYPE "public"."application_status" AS ENUM('submitted', 'in_review', 'interviewing', 'offered', 'hired', 'rejected', 'withdrawn');--> statement-breakpoint
CREATE TABLE "candidate_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"user_id" uuid NOT NULL,
	"headline" text,
	"summary" text,
	"visibility" "profile_visibility" DEFAULT 'private' NOT NULL,
	"open_to_work" boolean DEFAULT false NOT NULL,
	"location_id" uuid,
	"preferred_work_modes" text[] DEFAULT '{}' NOT NULL,
	"desired_salary_min" integer,
	"desired_salary_currency" varchar(3) DEFAULT 'USD',
	"work_authorization" text,
	"notice_period_days" integer,
	"default_resume_document_id" uuid,
	"website_url" text,
	"linkedin_url" text,
	"github_url" text
);
--> statement-breakpoint
CREATE TABLE "candidate_skills" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"profile_id" uuid NOT NULL,
	"skill_id" uuid NOT NULL,
	"years_of_experience" integer
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" uuid NOT NULL,
	"file_id" uuid NOT NULL,
	"kind" "document_kind" DEFAULT 'resume' NOT NULL,
	"label" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "educations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"profile_id" uuid NOT NULL,
	"institution" text NOT NULL,
	"qualification" text,
	"field_of_study" text,
	"started_on" date,
	"ended_on" date
);
--> statement-breakpoint
CREATE TABLE "work_experiences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"profile_id" uuid NOT NULL,
	"title" text NOT NULL,
	"company_name" text NOT NULL,
	"location_id" uuid,
	"started_on" date NOT NULL,
	"ended_on" date,
	"description" text
);
--> statement-breakpoint
CREATE TABLE "application_answers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"application_id" uuid NOT NULL,
	"question_id" uuid NOT NULL,
	"answer" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "application_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"application_id" uuid NOT NULL,
	"type" "application_event_type" NOT NULL,
	"actor_user_id" uuid,
	"visible_to_candidate" boolean DEFAULT false NOT NULL,
	"payload" jsonb
);
--> statement-breakpoint
CREATE TABLE "applications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"job_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"profile_id" uuid,
	"status" "application_status" DEFAULT 'submitted' NOT NULL,
	"resume_document_id" uuid,
	"cover_letter" text,
	"source" text DEFAULT 'direct' NOT NULL,
	"first_responded_at" timestamp with time zone,
	"rejected_at" timestamp with time zone,
	"rejection_reason" text,
	"withdrawn_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "candidate_profiles" ADD CONSTRAINT "candidate_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidate_profiles" ADD CONSTRAINT "candidate_profiles_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidate_skills" ADD CONSTRAINT "candidate_skills_profile_id_candidate_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."candidate_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidate_skills" ADD CONSTRAINT "candidate_skills_skill_id_skills_id_fk" FOREIGN KEY ("skill_id") REFERENCES "public"."skills"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_file_id_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."files"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "educations" ADD CONSTRAINT "educations_profile_id_candidate_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."candidate_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_experiences" ADD CONSTRAINT "work_experiences_profile_id_candidate_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."candidate_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_experiences" ADD CONSTRAINT "work_experiences_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_answers" ADD CONSTRAINT "application_answers_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_answers" ADD CONSTRAINT "application_answers_question_id_job_screening_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."job_screening_questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_events" ADD CONSTRAINT "application_events_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_events" ADD CONSTRAINT "application_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_profile_id_candidate_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."candidate_profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_resume_document_id_documents_id_fk" FOREIGN KEY ("resume_document_id") REFERENCES "public"."documents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "candidate_profiles_user_key" ON "candidate_profiles" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "candidate_profiles_open_idx" ON "candidate_profiles" USING btree ("open_to_work","visibility");--> statement-breakpoint
CREATE UNIQUE INDEX "candidate_skills_key" ON "candidate_skills" USING btree ("profile_id","skill_id");--> statement-breakpoint
CREATE INDEX "candidate_skills_skill_idx" ON "candidate_skills" USING btree ("skill_id");--> statement-breakpoint
CREATE INDEX "documents_user_kind_idx" ON "documents" USING btree ("user_id","kind");--> statement-breakpoint
CREATE INDEX "educations_profile_idx" ON "educations" USING btree ("profile_id");--> statement-breakpoint
CREATE INDEX "work_experiences_profile_idx" ON "work_experiences" USING btree ("profile_id","started_on");--> statement-breakpoint
CREATE UNIQUE INDEX "application_answers_key" ON "application_answers" USING btree ("application_id","question_id");--> statement-breakpoint
CREATE INDEX "application_events_application_idx" ON "application_events" USING btree ("application_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "applications_job_user_key" ON "applications" USING btree ("job_id","user_id");--> statement-breakpoint
CREATE INDEX "applications_org_status_idx" ON "applications" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "applications_job_idx" ON "applications" USING btree ("job_id","created_at");--> statement-breakpoint
CREATE INDEX "applications_user_idx" ON "applications" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "applications_unanswered_idx" ON "applications" USING btree ("first_responded_at","created_at");--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_uploaded_by_user_id_users_id_fk" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;