CREATE TYPE "public"."company_size" AS ENUM('1-10', '11-50', '51-200', '201-500', '501-1000', '1001-5000', '5000+');--> statement-breakpoint
CREATE TYPE "public"."employment_type" AS ENUM('full_time', 'part_time', 'contract', 'temporary', 'internship');--> statement-breakpoint
CREATE TYPE "public"."experience_level" AS ENUM('internship', 'entry', 'mid', 'senior', 'staff', 'principal', 'executive');--> statement-breakpoint
CREATE TYPE "public"."job_status" AS ENUM('draft', 'pending_review', 'published', 'paused', 'closed', 'archived');--> statement-breakpoint
CREATE TYPE "public"."salary_period" AS ENUM('hour', 'day', 'month', 'year');--> statement-breakpoint
CREATE TYPE "public"."screening_question_type" AS ENUM('text', 'boolean', 'single_choice', 'multi_choice', 'number');--> statement-breakpoint
CREATE TYPE "public"."work_mode" AS ENUM('onsite', 'hybrid', 'remote');--> statement-breakpoint
CREATE TABLE "industries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "locations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"city" text,
	"region" text,
	"country" text NOT NULL,
	"country_code" varchar(2) NOT NULL,
	"slug" text NOT NULL,
	"latitude" double precision,
	"longitude" double precision,
	"timezone" text
);
--> statement-breakpoint
CREATE TABLE "occupations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"category" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "skills" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"aliases" text[] DEFAULT '{}' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "companies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"tagline" text,
	"about" text,
	"website_url" text,
	"logo_file_id" uuid,
	"size" "company_size",
	"founded_year" integer,
	"industry_id" uuid,
	"headquarters_location_id" uuid
);
--> statement-breakpoint
CREATE TABLE "company_benefits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"company_id" uuid NOT NULL,
	"label" text NOT NULL,
	"description" text,
	"position" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "company_locations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"company_id" uuid NOT NULL,
	"location_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "job_locations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"job_id" uuid NOT NULL,
	"location_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "job_screening_questions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"job_id" uuid NOT NULL,
	"question" text NOT NULL,
	"type" "screening_question_type" DEFAULT 'text' NOT NULL,
	"options" text[] DEFAULT '{}' NOT NULL,
	"required" boolean DEFAULT false NOT NULL,
	"knockout" boolean DEFAULT false NOT NULL,
	"expected_answer" text,
	"position" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "job_skills" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"job_id" uuid NOT NULL,
	"skill_id" uuid NOT NULL,
	"required" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"organization_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"title" text NOT NULL,
	"slug" text NOT NULL,
	"description" text NOT NULL,
	"employment_type" "employment_type" DEFAULT 'full_time' NOT NULL,
	"work_mode" "work_mode" DEFAULT 'onsite' NOT NULL,
	"experience_level" "experience_level" DEFAULT 'mid' NOT NULL,
	"occupation_id" uuid,
	"salary_min" integer NOT NULL,
	"salary_max" integer NOT NULL,
	"salary_currency" varchar(3) DEFAULT 'USD' NOT NULL,
	"salary_period" "salary_period" DEFAULT 'year' NOT NULL,
	"equity_range" text,
	"status" "job_status" DEFAULT 'draft' NOT NULL,
	"published_at" timestamp with time zone,
	"closes_at" timestamp with time zone,
	"created_by_user_id" uuid,
	"response_sla_days" integer,
	"applicant_count" integer DEFAULT 0 NOT NULL,
	"view_count" integer DEFAULT 0 NOT NULL,
	"search_vector" "tsvector" GENERATED ALWAYS AS (setweight(to_tsvector('english', coalesce(title, '')), 'A') || setweight(to_tsvector('english', coalesce(description, '')), 'D')) STORED
);
--> statement-breakpoint
CREATE TABLE "saved_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"job_id" uuid NOT NULL,
	"user_id" uuid NOT NULL
);
--> statement-breakpoint
ALTER TABLE "companies" ADD CONSTRAINT "companies_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "companies" ADD CONSTRAINT "companies_industry_id_industries_id_fk" FOREIGN KEY ("industry_id") REFERENCES "public"."industries"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "companies" ADD CONSTRAINT "companies_headquarters_location_id_locations_id_fk" FOREIGN KEY ("headquarters_location_id") REFERENCES "public"."locations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_benefits" ADD CONSTRAINT "company_benefits_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_locations" ADD CONSTRAINT "company_locations_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_locations" ADD CONSTRAINT "company_locations_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_locations" ADD CONSTRAINT "job_locations_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_locations" ADD CONSTRAINT "job_locations_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_screening_questions" ADD CONSTRAINT "job_screening_questions_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_skills" ADD CONSTRAINT "job_skills_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_skills" ADD CONSTRAINT "job_skills_skill_id_skills_id_fk" FOREIGN KEY ("skill_id") REFERENCES "public"."skills"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_occupation_id_occupations_id_fk" FOREIGN KEY ("occupation_id") REFERENCES "public"."occupations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_jobs" ADD CONSTRAINT "saved_jobs_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_jobs" ADD CONSTRAINT "saved_jobs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "industries_slug_key" ON "industries" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "locations_slug_key" ON "locations" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "locations_country_idx" ON "locations" USING btree ("country_code");--> statement-breakpoint
CREATE UNIQUE INDEX "occupations_slug_key" ON "occupations" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "skills_slug_key" ON "skills" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "companies_slug_key" ON "companies" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "companies_organization_key" ON "companies" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "companies_name_trgm_idx" ON "companies" USING gin ("name" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "company_benefits_company_idx" ON "company_benefits" USING btree ("company_id");--> statement-breakpoint
CREATE UNIQUE INDEX "company_locations_key" ON "company_locations" USING btree ("company_id","location_id");--> statement-breakpoint
CREATE INDEX "company_locations_company_idx" ON "company_locations" USING btree ("company_id");--> statement-breakpoint
CREATE UNIQUE INDEX "job_locations_key" ON "job_locations" USING btree ("job_id","location_id");--> statement-breakpoint
CREATE INDEX "job_locations_location_idx" ON "job_locations" USING btree ("location_id");--> statement-breakpoint
CREATE INDEX "job_screening_questions_job_idx" ON "job_screening_questions" USING btree ("job_id");--> statement-breakpoint
CREATE UNIQUE INDEX "job_skills_key" ON "job_skills" USING btree ("job_id","skill_id");--> statement-breakpoint
CREATE INDEX "job_skills_skill_idx" ON "job_skills" USING btree ("skill_id");--> statement-breakpoint
CREATE UNIQUE INDEX "jobs_slug_key" ON "jobs" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "jobs_status_published_idx" ON "jobs" USING btree ("status","published_at");--> statement-breakpoint
CREATE INDEX "jobs_company_idx" ON "jobs" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "jobs_organization_idx" ON "jobs" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "jobs_occupation_idx" ON "jobs" USING btree ("occupation_id");--> statement-breakpoint
CREATE INDEX "jobs_search_vector_idx" ON "jobs" USING gin ("search_vector");--> statement-breakpoint
CREATE INDEX "jobs_title_trgm_idx" ON "jobs" USING gin ("title" gin_trgm_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "saved_jobs_key" ON "saved_jobs" USING btree ("job_id","user_id");--> statement-breakpoint
CREATE INDEX "saved_jobs_user_idx" ON "saved_jobs" USING btree ("user_id");