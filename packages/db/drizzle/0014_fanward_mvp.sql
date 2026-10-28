CREATE TYPE "public"."creator_profile_status" AS ENUM('draft', 'pending', 'active', 'suspended', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."creator_revision_status" AS ENUM('draft', 'pending', 'published', 'rejected', 'superseded');--> statement-breakpoint
CREATE TABLE "creator_profile" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" text NOT NULL,
	"slug" text NOT NULL,
	"primary_site_id" uuid NOT NULL,
	"status" "creator_profile_status" DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "creator_profile_owner_unique" UNIQUE("owner_user_id"),
	CONSTRAINT "creator_profile_slug_unique" UNIQUE("slug"),
	CONSTRAINT "creator_profile_primary_site_unique" UNIQUE("primary_site_id"),
	CONSTRAINT "creator_profile_slug_length_check" CHECK (char_length("creator_profile"."slug") between 3 and 80)
);
--> statement-breakpoint
CREATE TABLE "creator_profile_revision" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"creator_profile_id" uuid NOT NULL,
	"display_name" text NOT NULL,
	"headline" text DEFAULT '' NOT NULL,
	"bio" text DEFAULT '' NOT NULL,
	"category_id" uuid,
	"status" "creator_revision_status" DEFAULT 'draft' NOT NULL,
	"created_by_user_id" text,
	"submitted_at" timestamp with time zone,
	"published_at" timestamp with time zone,
	"reviewed_at" timestamp with time zone,
	"reviewed_by_user_id" text,
	"review_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "creator_revision_display_name_length_check" CHECK (char_length("creator_profile_revision"."display_name") between 2 and 80),
	CONSTRAINT "creator_revision_headline_length_check" CHECK (char_length("creator_profile_revision"."headline") between 8 and 160),
	CONSTRAINT "creator_revision_bio_length_check" CHECK (char_length("creator_profile_revision"."bio") between 40 and 2000),
	CONSTRAINT "creator_revision_review_reason_length_check" CHECK ("creator_profile_revision"."review_reason" is null or char_length("creator_profile_revision"."review_reason") between 3 and 500)
);
--> statement-breakpoint
ALTER TABLE "creator_profile" ADD CONSTRAINT "creator_profile_owner_user_id_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creator_profile" ADD CONSTRAINT "creator_profile_primary_site_id_site_id_fk" FOREIGN KEY ("primary_site_id") REFERENCES "public"."site"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creator_profile_revision" ADD CONSTRAINT "creator_profile_revision_creator_profile_id_creator_profile_id_fk" FOREIGN KEY ("creator_profile_id") REFERENCES "public"."creator_profile"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creator_profile_revision" ADD CONSTRAINT "creator_profile_revision_category_id_category_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."category"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creator_profile_revision" ADD CONSTRAINT "creator_profile_revision_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creator_profile_revision" ADD CONSTRAINT "creator_profile_revision_reviewed_by_user_id_user_id_fk" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "creator_profile_public_idx" ON "creator_profile" USING btree ("status","updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "creator_revision_one_draft_idx" ON "creator_profile_revision" USING btree ("creator_profile_id") WHERE "creator_profile_revision"."status" = 'draft';--> statement-breakpoint
CREATE UNIQUE INDEX "creator_revision_one_pending_idx" ON "creator_profile_revision" USING btree ("creator_profile_id") WHERE "creator_profile_revision"."status" = 'pending';--> statement-breakpoint
CREATE UNIQUE INDEX "creator_revision_one_published_idx" ON "creator_profile_revision" USING btree ("creator_profile_id") WHERE "creator_profile_revision"."status" = 'published';--> statement-breakpoint
CREATE INDEX "creator_revision_profile_time_idx" ON "creator_profile_revision" USING btree ("creator_profile_id","created_at");--> statement-breakpoint
CREATE INDEX "creator_revision_review_queue_idx" ON "creator_profile_revision" USING btree ("status","submitted_at");--> statement-breakpoint
CREATE INDEX "creator_revision_public_idx" ON "creator_profile_revision" USING btree ("status","published_at","creator_profile_id");
