ALTER TYPE "public"."activity_type" ADD VALUE 'tracker_key_generated';--> statement-breakpoint
ALTER TYPE "public"."activity_type" ADD VALUE 'tracker_first_detected';--> statement-breakpoint
ALTER TYPE "public"."activity_type" ADD VALUE 'tracker_connected';--> statement-breakpoint
ALTER TYPE "public"."activity_type" ADD VALUE 'tracker_stale';--> statement-breakpoint
ALTER TYPE "public"."activity_type" ADD VALUE 'tracker_reconnected';--> statement-breakpoint
ALTER TYPE "public"."activity_type" ADD VALUE 'tracker_key_rotated';--> statement-breakpoint
ALTER TYPE "public"."activity_type" ADD VALUE 'tracker_key_revoked';--> statement-breakpoint
ALTER TYPE "public"."activity_type" ADD VALUE 'surgeindex_attributed_visit';--> statement-breakpoint
ALTER TYPE "public"."tracker_key_status" ADD VALUE 'pending' BEFORE 'active';--> statement-breakpoint
ALTER TYPE "public"."tracker_key_status" ADD VALUE 'stale' BEFORE 'rotated';--> statement-breakpoint
CREATE TABLE "aggregation_job_state" (
	"job_key" text PRIMARY KEY NOT NULL,
	"last_started_at" timestamp with time zone,
	"last_completed_at" timestamp with time zone,
	"last_error" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "attribution_record" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" uuid NOT NULL,
	"outbound_click_id" uuid,
	"token_hash" text NOT NULL,
	"visitor_hash" text NOT NULL,
	"session_hash" text NOT NULL,
	"landing_event_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"engaged_at" timestamp with time zone,
	CONSTRAINT "attribution_record_token_hash_unique" UNIQUE("token_hash"),
	CONSTRAINT "attribution_record_landing_event_id_unique" UNIQUE("landing_event_id")
);
--> statement-breakpoint
CREATE TABLE "ingestion_failure" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" uuid,
	"event_id" text,
	"request_id" text NOT NULL,
	"stage" text NOT NULL,
	"code" text NOT NULL,
	"detail" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "active_session" ADD COLUMN "last_event_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "site_metric_current" ADD COLUMN "sessions_24h" bigint;--> statement-breakpoint
ALTER TABLE "site_metric_current" ADD COLUMN "engaged_sessions_24h" bigint;--> statement-breakpoint
ALTER TABLE "site_metric_current" ADD COLUMN "active_sessions" integer;--> statement-breakpoint
ALTER TABLE "site_metric_current" ADD COLUMN "surge_attributed_visits_24h" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "site_metric_current" ADD COLUMN "surge_attributed_engaged_visits_24h" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "site_metric_current" ADD COLUMN "accepted_events_24h" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "site_metric_current" ADD COLUMN "suspected_events_24h" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "site_metric_current" ADD COLUMN "invalid_events_24h" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "site_metric_current" ADD COLUMN "last_accepted_event_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "site_metric_current" ADD COLUMN "last_detected_origin" text;--> statement-breakpoint
ALTER TABLE "site_metric_current" ADD COLUMN "tracker_version" text;--> statement-breakpoint
ALTER TABLE "site_metric_snapshot" ADD COLUMN "sessions" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "site_metric_snapshot" ADD COLUMN "pageviews" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "site_metric_snapshot" ADD COLUMN "engaged_sessions" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "site_metric_snapshot" ADD COLUMN "attributed_visits" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "tracker_event" ADD COLUMN "visible" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "tracker_event" ADD COLUMN "engaged_seconds" integer;--> statement-breakpoint
ALTER TABLE "tracker_event" ADD COLUMN "tracker_version" text DEFAULT '1.0.0' NOT NULL;--> statement-breakpoint
ALTER TABLE "tracker_event" ADD COLUMN "attribution_token_hash" text;--> statement-breakpoint
ALTER TABLE "tracker_event" ADD COLUMN "origin_host" text;--> statement-breakpoint
ALTER TABLE "tracker_event" ADD COLUMN "fraud_score" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "tracker_event" ADD COLUMN "fraud_rule_version" text DEFAULT 'v1' NOT NULL;--> statement-breakpoint
ALTER TABLE "tracker_event" ADD COLUMN "collector_request_id" text;--> statement-breakpoint
ALTER TABLE "tracker_key" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "tracker_key" ADD COLUMN "environment" text DEFAULT 'production' NOT NULL;--> statement-breakpoint
ALTER TABLE "tracker_key" ADD COLUMN "activated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tracker_key" ADD COLUMN "last_origin" text;--> statement-breakpoint
ALTER TABLE "tracker_key" ADD COLUMN "last_error" text;--> statement-breakpoint
ALTER TABLE "tracker_key" ADD COLUMN "revoked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "attribution_record" ADD CONSTRAINT "attribution_record_site_id_site_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."site"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attribution_record" ADD CONSTRAINT "attribution_record_outbound_click_id_outbound_click_id_fk" FOREIGN KEY ("outbound_click_id") REFERENCES "public"."outbound_click"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingestion_failure" ADD CONSTRAINT "ingestion_failure_site_id_site_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."site"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "attribution_site_time_idx" ON "attribution_record" USING btree ("site_id","created_at");--> statement-breakpoint
CREATE INDEX "attribution_session_idx" ON "attribution_record" USING btree ("session_hash");--> statement-breakpoint
CREATE INDEX "ingestion_failure_time_idx" ON "ingestion_failure" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "ingestion_failure_site_idx" ON "ingestion_failure" USING btree ("site_id");--> statement-breakpoint
CREATE INDEX "tracker_event_attribution_idx" ON "tracker_event" USING btree ("attribution_token_hash");--> statement-breakpoint
CREATE INDEX "tracker_event_decision_time_idx" ON "tracker_event" USING btree ("decision","occurred_at");--> statement-breakpoint
CREATE INDEX "tracker_key_status_idx" ON "tracker_key" USING btree ("status");
