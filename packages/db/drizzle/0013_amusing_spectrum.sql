CREATE TYPE "public"."ownership_claim_method" AS ENUM('meta_tag', 'dns_txt');--> statement-breakpoint
CREATE TABLE "rate_limit_bucket" (
	"key" text PRIMARY KEY NOT NULL,
	"window_started_at" timestamp with time zone NOT NULL,
	"window_expires_at" timestamp with time zone NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "system_job_run" (
	"job_key" text PRIMARY KEY NOT NULL,
	"last_started_at" timestamp with time zone,
	"last_success_at" timestamp with time zone,
	"last_failure_at" timestamp with time zone,
	"last_error_code" text,
	"consecutive_failures" integer DEFAULT 0 NOT NULL,
	"last_request_id" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
UPDATE "site_claim"
SET "last_error" = concat_ws('; ', nullif("last_error", ''), concat('legacy_claim_method=', "method"::text)),
	"status" = 'failed'
WHERE "method"::text NOT IN ('meta_tag', 'dns_txt');--> statement-breakpoint
ALTER TABLE "site_claim" ALTER COLUMN "method" SET DATA TYPE "public"."ownership_claim_method" USING "method"::text::"public"."ownership_claim_method";--> statement-breakpoint
ALTER TABLE "site" ADD COLUMN "permitted_aliases" text[] DEFAULT ARRAY[]::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "site" ADD COLUMN "public_revenue_visible" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "site" ADD COLUMN "public_page_metrics_visible" boolean DEFAULT false NOT NULL;--> statement-breakpoint
UPDATE "site_revenue_current" SET "public_visible" = false;--> statement-breakpoint
CREATE INDEX "rate_limit_expiry_idx" ON "rate_limit_bucket" USING btree ("window_expires_at");--> statement-breakpoint
CREATE INDEX "system_job_freshness_idx" ON "system_job_run" USING btree ("last_success_at","last_failure_at");
