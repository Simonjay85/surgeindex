ALTER TABLE "baseline_bucket" DROP CONSTRAINT "baseline_bucket_site_time_unique";--> statement-breakpoint
ALTER TABLE "baseline_bucket" ALTER COLUMN "source" SET DEFAULT 'tracker'::"public"."ranking_source";--> statement-breakpoint
ALTER TABLE "baseline_bucket" ALTER COLUMN "source" SET DATA TYPE "public"."ranking_source" USING "source"::"public"."ranking_source";--> statement-breakpoint
ALTER TABLE "current_ranking" ADD COLUMN "ranking_source" "ranking_source" DEFAULT 'tracker' NOT NULL;--> statement-breakpoint
ALTER TABLE "current_ranking" ADD COLUMN "provider_definition_version" text DEFAULT 'tracker-v1' NOT NULL;--> statement-breakpoint
ALTER TABLE "rank_snapshot" ADD COLUMN "ranking_source" "ranking_source" DEFAULT 'tracker' NOT NULL;--> statement-breakpoint
ALTER TABLE "rank_snapshot" ADD COLUMN "provider_definition_version" text DEFAULT 'tracker-v1' NOT NULL;--> statement-breakpoint
ALTER TABLE "site_baseline" ADD COLUMN "source" "ranking_source" DEFAULT 'tracker' NOT NULL;--> statement-breakpoint
ALTER TABLE "site_baseline" ADD COLUMN "provider_definition_version" text DEFAULT 'tracker-v1' NOT NULL;--> statement-breakpoint
ALTER TABLE "site_metric_current" ADD COLUMN "ranking_source" "ranking_source" DEFAULT 'tracker' NOT NULL;--> statement-breakpoint
ALTER TABLE "site_metric_current" ADD COLUMN "provider_definition_version" text DEFAULT 'tracker-v1' NOT NULL;--> statement-breakpoint
ALTER TABLE "site_score" ADD COLUMN "ranking_source" "ranking_source" DEFAULT 'tracker' NOT NULL;--> statement-breakpoint
ALTER TABLE "site_score" ADD COLUMN "provider_definition_version" text DEFAULT 'tracker-v1' NOT NULL;--> statement-breakpoint
ALTER TABLE "baseline_bucket" ADD CONSTRAINT "baseline_bucket_site_source_time_unique" UNIQUE("site_id","source","bucket_start");