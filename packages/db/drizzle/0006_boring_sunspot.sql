CREATE TYPE "public"."ga_backfill_status" AS ENUM('queued', 'running', 'partially_complete', 'complete', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."ga_connection_state" AS ENUM('initiated', 'authorizing', 'selecting_property', 'validating_property', 'backfilling', 'connected', 'degraded', 'reauthorization_required', 'revoked', 'disconnected', 'error');--> statement-breakpoint
CREATE TYPE "public"."ga_quota_api" AS ENUM('core', 'realtime');--> statement-breakpoint
CREATE TYPE "public"."ga_report_window" AS ENUM('yesterday', '7d', '28d', '30d', '90d', 'realtime_5m', 'realtime_30m');--> statement-breakpoint
CREATE TYPE "public"."ga_sync_run_status" AS ENUM('queued', 'running', 'completed', 'partial', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."ga_sync_type" AS ENUM('realtime', 'core_recent', 'historical_reconciliation', 'initial_backfill', 'token_health', 'freshness_check');--> statement-breakpoint
CREATE TYPE "public"."ranking_source" AS ENUM('tracker', 'ga4');--> statement-breakpoint
CREATE TABLE "ga_account" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"connection_id" uuid NOT NULL,
	"resource_id" text NOT NULL,
	"display_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ga_account_connection_resource_unique" UNIQUE("connection_id","resource_id")
);
--> statement-breakpoint
CREATE TABLE "ga_backfill_job" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"connection_id" uuid NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"total_days" integer NOT NULL,
	"processed_days" integer DEFAULT 0 NOT NULL,
	"checkpoint_date" date,
	"status" "ga_backfill_status" DEFAULT 'queued' NOT NULL,
	"dry_run" boolean DEFAULT false NOT NULL,
	"last_error_code" text,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ga_backfill_connection_window_unique" UNIQUE("connection_id","start_date","end_date")
);
--> statement-breakpoint
CREATE TABLE "ga_credential" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"connection_id" uuid NOT NULL,
	"encrypted_refresh_token" text,
	"encryption_key_version" text NOT NULL,
	"granted_scopes" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"google_subject" text,
	"grant_identity" text,
	"encrypted_access_token" text,
	"access_token_key_version" text,
	"access_token_expires_at" timestamp with time zone,
	"token_created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_successful_refresh" timestamp with time zone,
	"last_refresh_failure" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ga_credential_connection_id_unique" UNIQUE("connection_id")
);
--> statement-breakpoint
CREATE TABLE "ga_data_stream" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"property_id" uuid NOT NULL,
	"resource_id" text NOT NULL,
	"display_name" text NOT NULL,
	"stream_type" text NOT NULL,
	"default_uri" text,
	"measurement_id" text,
	"time_zone" text,
	"domain_match_state" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ga_stream_property_resource_unique" UNIQUE("property_id","resource_id")
);
--> statement-breakpoint
CREATE TABLE "ga_metric_aggregate" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" uuid NOT NULL,
	"connection_id" uuid NOT NULL,
	"source" "ranking_source" DEFAULT 'ga4' NOT NULL,
	"metric_name" text NOT NULL,
	"window" text NOT NULL,
	"bucket_start" timestamp with time zone NOT NULL,
	"bucket_end" timestamp with time zone NOT NULL,
	"value" numeric(20, 6) NOT NULL,
	"observed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"freshness" "freshness_state" DEFAULT 'fresh' NOT NULL,
	"confidence" numeric(5, 4) DEFAULT '1' NOT NULL,
	"provider_definition_version" text NOT NULL,
	"partial" boolean DEFAULT false NOT NULL,
	"data_may_still_change" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ga_metric_aggregate_bucket_unique" UNIQUE("connection_id","source","metric_name","window","bucket_start")
);
--> statement-breakpoint
CREATE TABLE "ga_oauth_transaction" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"site_id" uuid NOT NULL,
	"state_hash" text NOT NULL,
	"pkce_verifier_encrypted" text NOT NULL,
	"pkce_key_version" text NOT NULL,
	"return_path" text DEFAULT '/dashboard' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ga_oauth_transaction_state_hash_unique" UNIQUE("state_hash")
);
--> statement-breakpoint
CREATE TABLE "ga_property" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"connection_id" uuid NOT NULL,
	"account_id" uuid,
	"resource_id" text NOT NULL,
	"display_name" text NOT NULL,
	"property_type" text,
	"time_zone" text,
	"currency_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ga_property_connection_resource_unique" UNIQUE("connection_id","resource_id")
);
--> statement-breakpoint
CREATE TABLE "ga_property_capability" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"property_id" uuid NOT NULL,
	"checked_at" timestamp with time zone NOT NULL,
	"supported_metrics" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"unsupported_metrics" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"compatibility_errors" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"provider_schema_version" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ga_property_capability_property_id_unique" UNIQUE("property_id")
);
--> statement-breakpoint
CREATE TABLE "ga_quota_snapshot" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"connection_id" uuid NOT NULL,
	"api" "ga_quota_api" NOT NULL,
	"state" text DEFAULT 'unknown' NOT NULL,
	"remaining_tokens" integer,
	"concurrent_requests" integer,
	"server_error_quota" integer,
	"last_429_at" timestamp with time zone,
	"retry_after_seconds" integer,
	"observed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"metadata" jsonb
);
--> statement-breakpoint
CREATE TABLE "ga_realtime_snapshot" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"connection_id" uuid NOT NULL,
	"site_id" uuid NOT NULL,
	"property_id" text NOT NULL,
	"minute_range_start" timestamp with time zone NOT NULL,
	"minute_range_end" timestamp with time zone NOT NULL,
	"active_users" integer DEFAULT 0 NOT NULL,
	"screen_page_views" integer DEFAULT 0 NOT NULL,
	"event_count" integer DEFAULT 0 NOT NULL,
	"key_events" integer DEFAULT 0 NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"provider_generated_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL,
	"provider_schema_version" text NOT NULL,
	CONSTRAINT "ga_realtime_connection_window_unique" UNIQUE("connection_id","minute_range_start","minute_range_end")
);
--> statement-breakpoint
CREATE TABLE "ga_report_snapshot" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"connection_id" uuid NOT NULL,
	"property_id" text NOT NULL,
	"window" "ga_report_window" NOT NULL,
	"requested_start_date" date NOT NULL,
	"requested_end_date" date NOT NULL,
	"property_time_zone" text,
	"metric_definitions" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"provider_response_metadata" jsonb,
	"imported_at" timestamp with time zone DEFAULT now() NOT NULL,
	"data_date" date,
	"partial" boolean DEFAULT false NOT NULL,
	"data_may_still_change" boolean DEFAULT false NOT NULL,
	"provider_generated_at" timestamp with time zone,
	"provider_schema_version" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ga_sync_job" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"connection_id" uuid NOT NULL,
	"sync_type" "ga_sync_type" NOT NULL,
	"status" "ga_sync_run_status" DEFAULT 'queued' NOT NULL,
	"priority" integer DEFAULT 50 NOT NULL,
	"next_run_at" timestamp with time zone,
	"last_run_at" timestamp with time zone,
	"last_success_at" timestamp with time zone,
	"last_error_code" text,
	"paused_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ga_sync_job_connection_type_unique" UNIQUE("connection_id","sync_type")
);
--> statement-breakpoint
CREATE TABLE "ga_sync_run" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid,
	"connection_id" uuid NOT NULL,
	"sync_type" "ga_sync_type" NOT NULL,
	"status" "ga_sync_run_status" DEFAULT 'running' NOT NULL,
	"window" text,
	"request_count" integer DEFAULT 0 NOT NULL,
	"quota_before" jsonb,
	"quota_after" jsonb,
	"rows_received" integer DEFAULT 0 NOT NULL,
	"rows_persisted" integer DEFAULT 0 NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"duration_ms" integer,
	"error_code" text,
	"request_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "site_metric_source_policy" (
	"site_id" uuid PRIMARY KEY NOT NULL,
	"primary_source" "ranking_source" DEFAULT 'tracker' NOT NULL,
	"ranking_source_version" text DEFAULT 'tracker-v1' NOT NULL,
	"ranking_source_started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ranking_source_locked_until" timestamp with time zone,
	"previous_ranking_source" "ranking_source",
	"source_switch_reason" text,
	"provisional_until" timestamp with time zone,
	"baseline_compatible" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "site_metric_source_transition" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" uuid NOT NULL,
	"from_source" "ranking_source",
	"to_source" "ranking_source" NOT NULL,
	"reason" text NOT NULL,
	"actor_user_id" text,
	"request_id" text NOT NULL,
	"baseline_compatible_before" boolean DEFAULT true NOT NULL,
	"baseline_compatible_after" boolean DEFAULT false NOT NULL,
	"provisional_until" timestamp with time zone,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ga_connection" ADD COLUMN "user_id" text;--> statement-breakpoint
ALTER TABLE "ga_connection" ADD COLUMN "stream_id" text;--> statement-breakpoint
ALTER TABLE "ga_connection" ADD COLUMN "stream_name" text;--> statement-breakpoint
ALTER TABLE "ga_connection" ADD COLUMN "stream_default_uri" text;--> statement-breakpoint
ALTER TABLE "ga_connection" ADD COLUMN "measurement_id" text;--> statement-breakpoint
ALTER TABLE "ga_connection" ADD COLUMN "domain_match_state" text;--> statement-breakpoint
ALTER TABLE "ga_connection" ADD COLUMN "property_time_zone" text;--> statement-breakpoint
ALTER TABLE "ga_connection" ADD COLUMN "currency_code" text;--> statement-breakpoint
ALTER TABLE "ga_connection" ADD COLUMN "granted_scopes" text[] DEFAULT ARRAY[]::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "ga_connection" ADD COLUMN "google_subject" text;--> statement-breakpoint
ALTER TABLE "ga_connection" ADD COLUMN "grant_identity" text;--> statement-breakpoint
ALTER TABLE "ga_connection" ADD COLUMN "connection_state" "ga_connection_state" DEFAULT 'initiated' NOT NULL;--> statement-breakpoint
ALTER TABLE "ga_connection" ADD COLUMN "last_successful_report_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "ga_connection" ADD COLUMN "last_refresh_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "ga_connection" ADD COLUMN "last_refresh_failure" text;--> statement-breakpoint
ALTER TABLE "ga_connection" ADD COLUMN "revoked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "ga_connection" ADD COLUMN "connected_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "ga_connection" ADD COLUMN "ranking_eligible" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "ga_connection" ADD COLUMN "provider_schema_version" text DEFAULT 'unknown' NOT NULL;--> statement-breakpoint
ALTER TABLE "ga_account" ADD CONSTRAINT "ga_account_connection_id_ga_connection_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."ga_connection"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ga_backfill_job" ADD CONSTRAINT "ga_backfill_job_connection_id_ga_connection_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."ga_connection"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ga_credential" ADD CONSTRAINT "ga_credential_connection_id_ga_connection_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."ga_connection"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ga_data_stream" ADD CONSTRAINT "ga_data_stream_property_id_ga_property_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."ga_property"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ga_metric_aggregate" ADD CONSTRAINT "ga_metric_aggregate_site_id_site_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."site"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ga_metric_aggregate" ADD CONSTRAINT "ga_metric_aggregate_connection_id_ga_connection_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."ga_connection"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ga_oauth_transaction" ADD CONSTRAINT "ga_oauth_transaction_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ga_oauth_transaction" ADD CONSTRAINT "ga_oauth_transaction_site_id_site_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."site"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ga_property" ADD CONSTRAINT "ga_property_connection_id_ga_connection_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."ga_connection"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ga_property" ADD CONSTRAINT "ga_property_account_id_ga_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."ga_account"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ga_property_capability" ADD CONSTRAINT "ga_property_capability_property_id_ga_property_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."ga_property"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ga_quota_snapshot" ADD CONSTRAINT "ga_quota_snapshot_connection_id_ga_connection_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."ga_connection"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ga_realtime_snapshot" ADD CONSTRAINT "ga_realtime_snapshot_connection_id_ga_connection_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."ga_connection"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ga_realtime_snapshot" ADD CONSTRAINT "ga_realtime_snapshot_site_id_site_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."site"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ga_report_snapshot" ADD CONSTRAINT "ga_report_snapshot_connection_id_ga_connection_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."ga_connection"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ga_sync_job" ADD CONSTRAINT "ga_sync_job_connection_id_ga_connection_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."ga_connection"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ga_sync_run" ADD CONSTRAINT "ga_sync_run_job_id_ga_sync_job_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."ga_sync_job"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ga_sync_run" ADD CONSTRAINT "ga_sync_run_connection_id_ga_connection_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."ga_connection"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_metric_source_policy" ADD CONSTRAINT "site_metric_source_policy_site_id_site_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."site"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_metric_source_transition" ADD CONSTRAINT "site_metric_source_transition_site_id_site_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."site"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_metric_source_transition" ADD CONSTRAINT "site_metric_source_transition_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ga_account_connection_idx" ON "ga_account" USING btree ("connection_id");--> statement-breakpoint
CREATE INDEX "ga_backfill_status_idx" ON "ga_backfill_job" USING btree ("status","updated_at");--> statement-breakpoint
CREATE INDEX "ga_credential_grant_idx" ON "ga_credential" USING btree ("grant_identity");--> statement-breakpoint
CREATE INDEX "ga_credential_refresh_idx" ON "ga_credential" USING btree ("last_refresh_failure");--> statement-breakpoint
CREATE INDEX "ga_stream_property_idx" ON "ga_data_stream" USING btree ("property_id");--> statement-breakpoint
CREATE INDEX "ga_metric_site_metric_time_idx" ON "ga_metric_aggregate" USING btree ("site_id","metric_name","bucket_start");--> statement-breakpoint
CREATE INDEX "ga_oauth_transaction_lookup_idx" ON "ga_oauth_transaction" USING btree ("site_id","user_id","expires_at");--> statement-breakpoint
CREATE INDEX "ga_oauth_transaction_open_idx" ON "ga_oauth_transaction" USING btree ("expires_at","completed_at");--> statement-breakpoint
CREATE INDEX "ga_property_connection_idx" ON "ga_property" USING btree ("connection_id");--> statement-breakpoint
CREATE INDEX "ga_quota_connection_api_time_idx" ON "ga_quota_snapshot" USING btree ("connection_id","api","observed_at");--> statement-breakpoint
CREATE INDEX "ga_realtime_site_time_idx" ON "ga_realtime_snapshot" USING btree ("site_id","fetched_at");--> statement-breakpoint
CREATE INDEX "ga_report_connection_window_idx" ON "ga_report_snapshot" USING btree ("connection_id","window","imported_at");--> statement-breakpoint
CREATE INDEX "ga_sync_job_due_idx" ON "ga_sync_job" USING btree ("status","next_run_at");--> statement-breakpoint
CREATE INDEX "ga_sync_run_connection_time_idx" ON "ga_sync_run" USING btree ("connection_id","started_at");--> statement-breakpoint
CREATE INDEX "ga_sync_run_status_idx" ON "ga_sync_run" USING btree ("status","started_at");--> statement-breakpoint
CREATE INDEX "source_transition_site_time_idx" ON "site_metric_source_transition" USING btree ("site_id","occurred_at");--> statement-breakpoint
ALTER TABLE "ga_connection" ADD CONSTRAINT "ga_connection_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ga_connection_state_idx" ON "ga_connection" USING btree ("connection_state","updated_at");--> statement-breakpoint
CREATE INDEX "ga_connection_grant_idx" ON "ga_connection" USING btree ("grant_identity");