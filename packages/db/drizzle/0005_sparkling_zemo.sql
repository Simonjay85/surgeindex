ALTER TABLE "scoring_job_run" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "site_metric_current" ADD COLUMN "raw_score" numeric(6, 3) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "site_metric_current" ADD COLUMN "smoothed_score" numeric(6, 3) DEFAULT '0' NOT NULL;