CREATE TABLE "scorecard_criteria" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"job_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"position" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scorecard_ratings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"scorecard_id" uuid NOT NULL,
	"criterion_id" uuid NOT NULL,
	"rating" integer NOT NULL,
	"comment" text
);
--> statement-breakpoint
CREATE TABLE "scorecards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"application_id" uuid NOT NULL,
	"interviewer_user_id" uuid NOT NULL,
	"overall" integer,
	"summary" text,
	"submitted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "scorecard_criteria" ADD CONSTRAINT "scorecard_criteria_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scorecard_ratings" ADD CONSTRAINT "scorecard_ratings_scorecard_id_scorecards_id_fk" FOREIGN KEY ("scorecard_id") REFERENCES "public"."scorecards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scorecard_ratings" ADD CONSTRAINT "scorecard_ratings_criterion_id_scorecard_criteria_id_fk" FOREIGN KEY ("criterion_id") REFERENCES "public"."scorecard_criteria"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scorecards" ADD CONSTRAINT "scorecards_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scorecards" ADD CONSTRAINT "scorecards_interviewer_user_id_users_id_fk" FOREIGN KEY ("interviewer_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "scorecard_criteria_order" ON "scorecard_criteria" USING btree ("job_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "scorecard_ratings_key" ON "scorecard_ratings" USING btree ("scorecard_id","criterion_id");--> statement-breakpoint
CREATE UNIQUE INDEX "scorecards_application_interviewer_key" ON "scorecards" USING btree ("application_id","interviewer_user_id");--> statement-breakpoint
CREATE INDEX "scorecards_application_idx" ON "scorecards" USING btree ("application_id");