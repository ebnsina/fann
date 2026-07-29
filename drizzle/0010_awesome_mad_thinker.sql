CREATE TABLE "comp_benchmarks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"occupation_id" uuid NOT NULL,
	"experience_level" "experience_level" NOT NULL,
	"location_id" uuid,
	"currency" varchar(3) NOT NULL,
	"source" text NOT NULL,
	"p10" integer NOT NULL,
	"p25" integer NOT NULL,
	"p50" integer NOT NULL,
	"p75" integer NOT NULL,
	"p90" integer NOT NULL,
	"sample_size" integer NOT NULL,
	"refreshed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "salary_submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" uuid,
	"job_title" text NOT NULL,
	"occupation_id" uuid,
	"experience_level" "experience_level" NOT NULL,
	"location_id" uuid,
	"company_id" uuid,
	"salary_amount" integer NOT NULL,
	"salary_currency" varchar(3) DEFAULT 'USD' NOT NULL,
	"salary_period" "salary_period" DEFAULT 'year' NOT NULL,
	"years_of_experience" integer,
	"verified_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "comp_benchmarks" ADD CONSTRAINT "comp_benchmarks_occupation_id_occupations_id_fk" FOREIGN KEY ("occupation_id") REFERENCES "public"."occupations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comp_benchmarks" ADD CONSTRAINT "comp_benchmarks_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "salary_submissions" ADD CONSTRAINT "salary_submissions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "salary_submissions" ADD CONSTRAINT "salary_submissions_occupation_id_occupations_id_fk" FOREIGN KEY ("occupation_id") REFERENCES "public"."occupations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "salary_submissions" ADD CONSTRAINT "salary_submissions_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "salary_submissions" ADD CONSTRAINT "salary_submissions_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "comp_benchmarks_lookup_idx" ON "comp_benchmarks" USING btree ("occupation_id","experience_level","source");--> statement-breakpoint
CREATE INDEX "comp_benchmarks_source_idx" ON "comp_benchmarks" USING btree ("source","currency");--> statement-breakpoint
CREATE INDEX "salary_submissions_group_idx" ON "salary_submissions" USING btree ("occupation_id","experience_level","location_id");--> statement-breakpoint
CREATE INDEX "salary_submissions_company_idx" ON "salary_submissions" USING btree ("company_id");