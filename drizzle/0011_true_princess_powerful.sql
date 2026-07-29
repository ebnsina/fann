CREATE TABLE "content_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reporter_user_id" uuid,
	"post_id" uuid,
	"comment_id" uuid,
	"reason" text NOT NULL,
	"reviewed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "follows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"follower_user_id" uuid NOT NULL,
	"following_user_id" uuid,
	"following_company_id" uuid
);
--> statement-breakpoint
CREATE TABLE "post_comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"post_id" uuid NOT NULL,
	"author_user_id" uuid NOT NULL,
	"body" text NOT NULL,
	"hidden_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "post_likes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"post_id" uuid NOT NULL,
	"user_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "posts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"author_user_id" uuid NOT NULL,
	"author_company_id" uuid,
	"body" text NOT NULL,
	"hidden_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "content_reports" ADD CONSTRAINT "content_reports_reporter_user_id_users_id_fk" FOREIGN KEY ("reporter_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_reports" ADD CONSTRAINT "content_reports_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_reports" ADD CONSTRAINT "content_reports_comment_id_post_comments_id_fk" FOREIGN KEY ("comment_id") REFERENCES "public"."post_comments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "follows" ADD CONSTRAINT "follows_follower_user_id_users_id_fk" FOREIGN KEY ("follower_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "follows" ADD CONSTRAINT "follows_following_user_id_users_id_fk" FOREIGN KEY ("following_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "follows" ADD CONSTRAINT "follows_following_company_id_companies_id_fk" FOREIGN KEY ("following_company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_comments" ADD CONSTRAINT "post_comments_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_comments" ADD CONSTRAINT "post_comments_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_likes" ADD CONSTRAINT "post_likes_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_likes" ADD CONSTRAINT "post_likes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_author_company_id_companies_id_fk" FOREIGN KEY ("author_company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "content_reports_post_key" ON "content_reports" USING btree ("reporter_user_id","post_id") WHERE post_id is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "content_reports_comment_key" ON "content_reports" USING btree ("reporter_user_id","comment_id") WHERE comment_id is not null;--> statement-breakpoint
CREATE INDEX "content_reports_open_idx" ON "content_reports" USING btree ("reviewed_at");--> statement-breakpoint
CREATE UNIQUE INDEX "follows_user_key" ON "follows" USING btree ("follower_user_id","following_user_id") WHERE following_user_id is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "follows_company_key" ON "follows" USING btree ("follower_user_id","following_company_id") WHERE following_company_id is not null;--> statement-breakpoint
CREATE INDEX "follows_following_user_idx" ON "follows" USING btree ("following_user_id");--> statement-breakpoint
CREATE INDEX "follows_following_company_idx" ON "follows" USING btree ("following_company_id");--> statement-breakpoint
CREATE INDEX "post_comments_post_idx" ON "post_comments" USING btree ("post_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "post_likes_key" ON "post_likes" USING btree ("post_id","user_id");--> statement-breakpoint
CREATE INDEX "post_likes_user_idx" ON "post_likes" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "posts_author_idx" ON "posts" USING btree ("author_user_id","created_at");--> statement-breakpoint
CREATE INDEX "posts_company_idx" ON "posts" USING btree ("author_company_id","created_at");--> statement-breakpoint
CREATE INDEX "posts_recent_idx" ON "posts" USING btree ("created_at");
-- Hand-added: exactly one target per follow, and a report must point at exactly
-- one thing. Drizzle has no check-constraint builder, and without these the
-- "one of two nullable columns" shape is a convention the database does not
-- enforce — which is the kind of rule that holds until one code path forgets.
ALTER TABLE "follows" ADD CONSTRAINT "follows_one_target"
	CHECK (num_nonnulls("following_user_id", "following_company_id") = 1);

ALTER TABLE "content_reports" ADD CONSTRAINT "content_reports_one_target"
	CHECK (num_nonnulls("post_id", "comment_id") = 1);

-- Nobody follows themselves.
ALTER TABLE "follows" ADD CONSTRAINT "follows_not_self"
	CHECK ("following_user_id" IS NULL OR "following_user_id" <> "follower_user_id");
