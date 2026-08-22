CREATE TYPE "public"."activity_type" AS ENUM('site_submitted', 'site_approved', 'site_rejected', 'site_verified', 'ownership_verification_started', 'ownership_verified', 'category_changed', 'site_suspended', 'site_restored', 'entered_top_10', 'rank_up', 'surging', 'boost_started', 'boost_completed', 'badge_earned');--> statement-breakpoint
CREATE TYPE "public"."boost_placement" AS ENUM('homepage', 'category', 'ranking_feed', 'profile_recommendation', 'breakout_feed');--> statement-breakpoint
CREATE TYPE "public"."boost_status" AS ENUM('draft', 'pending_payment', 'scheduled', 'active', 'paused', 'completed', 'cancelled', 'refunded');--> statement-breakpoint
CREATE TYPE "public"."claim_method" AS ENUM('meta_tag', 'html_file', 'dns_txt', 'tracker', 'ga4');--> statement-breakpoint
CREATE TYPE "public"."claim_status" AS ENUM('pending', 'verified', 'failed', 'expired');--> statement-breakpoint
CREATE TYPE "public"."data_source" AS ENUM('tracker', 'ga4', 'surgeindex', 'sponsored', 'demo', 'unverified');--> statement-breakpoint
CREATE TYPE "public"."fraud_decision" AS ENUM('valid', 'suspected', 'invalid', 'review_required');--> statement-breakpoint
CREATE TYPE "public"."fraud_subject" AS ENUM('event', 'click', 'site');--> statement-breakpoint
CREATE TYPE "public"."ga_status" AS ENUM('active', 'disconnected', 'error', 'quota_exceeded');--> statement-breakpoint
CREATE TYPE "public"."owner_role" AS ENUM('owner', 'editor');--> statement-breakpoint
CREATE TYPE "public"."ownership_status" AS ENUM('unclaimed', 'claimed');--> statement-breakpoint
CREATE TYPE "public"."payment_provider" AS ENUM('mock', 'stripe');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('pending', 'succeeded', 'failed', 'refunded');--> statement-breakpoint
CREATE TYPE "public"."rank_window" AS ENUM('live', '24h', '7d');--> statement-breakpoint
CREATE TYPE "public"."site_status" AS ENUM('pending', 'active', 'suspended', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."snapshot_granularity" AS ENUM('hour', 'day');--> statement-breakpoint
CREATE TYPE "public"."tracker_key_status" AS ENUM('active', 'rotated', 'revoked');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('user', 'admin');--> statement-breakpoint
CREATE TYPE "public"."verification_status" AS ENUM('unverified', 'tracker', 'ga4');--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "active_session" (
	"session_id" text PRIMARY KEY NOT NULL,
	"site_id" uuid NOT NULL,
	"visitor_hash" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_heartbeat_at" timestamp with time zone DEFAULT now() NOT NULL,
	"hidden" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "activity_event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" "activity_type" NOT NULL,
	"site_id" uuid,
	"detail" text,
	"payload" jsonb,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"is_demo" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admin_audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_user_id" text,
	"action" text NOT NULL,
	"target_type" text NOT NULL,
	"target_id" text,
	"previous_state" jsonb,
	"new_state" jsonb,
	"details" jsonb,
	"reason" text,
	"request_id" text NOT NULL,
	"actor_ip_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "blocked_domain" (
	"domain" text PRIMARY KEY NOT NULL,
	"reason" text DEFAULT '' NOT NULL,
	"blocked_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "boost_campaign" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" uuid NOT NULL,
	"owner_id" text NOT NULL,
	"status" "boost_status" DEFAULT 'draft' NOT NULL,
	"placement" "boost_placement" NOT NULL,
	"category_id" uuid,
	"headline" text DEFAULT '' NOT NULL,
	"budget_cents" integer DEFAULT 0 NOT NULL,
	"spend_cents" integer DEFAULT 0 NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"target_impressions" integer DEFAULT 0 NOT NULL,
	"delivered_impressions" integer DEFAULT 0 NOT NULL,
	"valid_impressions" integer DEFAULT 0 NOT NULL,
	"valid_clicks" integer DEFAULT 0 NOT NULL,
	"unique_clicks" integer DEFAULT 0 NOT NULL,
	"start_at" timestamp with time zone,
	"end_at" timestamp with time zone,
	"daily_cap" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"activated_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"payment_reference" text,
	"is_demo" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "boost_impression" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"site_id" uuid NOT NULL,
	"placement" "boost_placement" NOT NULL,
	"visitor_hash" text NOT NULL,
	"qualified" boolean DEFAULT false NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "boost_placement_def" (
	"slug" "boost_placement" PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "category" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "category_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "feature_flag" (
	"key" text PRIMARY KEY NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fraud_flag" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" uuid,
	"subject_type" "fraud_subject" NOT NULL,
	"subject_ref" text NOT NULL,
	"signals" jsonb NOT NULL,
	"score" integer DEFAULT 0 NOT NULL,
	"decision" "fraud_decision" NOT NULL,
	"rule_version" text NOT NULL,
	"note" text,
	"resolved_at" timestamp with time zone,
	"resolved_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ga_connection" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" uuid NOT NULL,
	"property_id" text NOT NULL,
	"property_name" text,
	"refresh_token_encrypted" text,
	"status" "ga_status" DEFAULT 'active' NOT NULL,
	"last_sync_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ga_connection_site_id_unique" UNIQUE("site_id")
);
--> statement-breakpoint
CREATE TABLE "moderation_action" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_user_id" text,
	"action" text NOT NULL,
	"target_type" text NOT NULL,
	"target_id" text NOT NULL,
	"previous_state" jsonb,
	"new_state" jsonb,
	"reason" text,
	"request_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "outbound_click" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" uuid NOT NULL,
	"campaign_id" uuid,
	"placement" text DEFAULT 'organic' NOT NULL,
	"visitor_hash" text NOT NULL,
	"referrer_path" text,
	"is_unique" boolean DEFAULT true NOT NULL,
	"valid" boolean DEFAULT true NOT NULL,
	"decision" "fraud_decision" DEFAULT 'valid' NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"is_demo" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "outbound_click_aggregate" (
	"site_id" uuid NOT NULL,
	"placement" text NOT NULL,
	"day" date NOT NULL,
	"clicks" integer DEFAULT 0 NOT NULL,
	"unique_clicks" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "outbound_click_aggregate_site_id_placement_day_pk" PRIMARY KEY("site_id","placement","day")
);
--> statement-breakpoint
CREATE TABLE "payment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"boost_campaign_id" uuid,
	"provider" "payment_provider" NOT NULL,
	"provider_reference" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"status" "payment_status" DEFAULT 'pending' NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "processed_webhook_event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" "payment_provider" NOT NULL,
	"event_id" text NOT NULL,
	"processed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rank_snapshot" (
	"id" bigint PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "rank_snapshot_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"site_id" uuid NOT NULL,
	"scope" text NOT NULL,
	"window" "rank_window" NOT NULL,
	"rank" integer NOT NULL,
	"previous_rank" integer,
	"captured_at" timestamp with time zone NOT NULL,
	CONSTRAINT "rank_snapshot_site_unique" UNIQUE("site_id","scope","window","captured_at")
);
--> statement-breakpoint
CREATE TABLE "score_version" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"weights" jsonb NOT NULL,
	"released_at" timestamp with time zone DEFAULT now() NOT NULL,
	"is_active" boolean DEFAULT false NOT NULL,
	CONSTRAINT "score_version_version_unique" UNIQUE("version")
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "site" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"domain" text NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"category_id" uuid,
	"status" "site_status" DEFAULT 'pending' NOT NULL,
	"verification" "verification_status" DEFAULT 'unverified' NOT NULL,
	"ownership" "ownership_status" DEFAULT 'unclaimed' NOT NULL,
	"logo_url" text,
	"favicon_url" text,
	"og_image_url" text,
	"submitted_by_user_id" text,
	"featured" boolean DEFAULT false NOT NULL,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "site_slug_unique" UNIQUE("slug"),
	CONSTRAINT "site_domain_unique" UNIQUE("domain")
);
--> statement-breakpoint
CREATE TABLE "site_category" (
	"site_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "site_category_site_id_category_id_pk" PRIMARY KEY("site_id","category_id")
);
--> statement-breakpoint
CREATE TABLE "site_claim" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"method" "claim_method" NOT NULL,
	"token" text NOT NULL,
	"status" "claim_status" DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"verified_at" timestamp with time zone,
	CONSTRAINT "site_claim_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "site_metric_current" (
	"site_id" uuid PRIMARY KEY NOT NULL,
	"active_now" integer,
	"active_last_30m" integer,
	"visitors_24h" bigint,
	"visitors_7d" bigint,
	"pageviews_24h" bigint,
	"engagement_rate" numeric(5, 4),
	"avg_engagement_seconds" integer,
	"baseline_daily_visitors" bigint,
	"typical_active_now" integer,
	"growth_24h_pct" numeric(8, 2),
	"growth_7d_pct" numeric(8, 2),
	"surge_referrals_24h" integer DEFAULT 0 NOT NULL,
	"heat_score" integer DEFAULT 0 NOT NULL,
	"heat_league" text DEFAULT 'new' NOT NULL,
	"score_version" text DEFAULT 'v1' NOT NULL,
	"fraud_penalty" numeric(4, 3) DEFAULT '0' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"is_demo" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "site_metric_snapshot" (
	"id" bigint PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "site_metric_snapshot_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"site_id" uuid NOT NULL,
	"granularity" "snapshot_granularity" NOT NULL,
	"visitors" integer DEFAULT 0 NOT NULL,
	"active_now" integer DEFAULT 0 NOT NULL,
	"growth_pct" numeric(8, 2),
	"heat_score" integer DEFAULT 0 NOT NULL,
	"captured_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "site_owner" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"role" "owner_role" DEFAULT 'owner' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "site_owner_unique" UNIQUE("site_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "site_tag" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" uuid NOT NULL,
	"tag" text NOT NULL,
	CONSTRAINT "site_tag_unique" UNIQUE("site_id","tag")
);
--> statement-breakpoint
CREATE TABLE "site_verification" (
	"site_id" uuid PRIMARY KEY NOT NULL,
	"source" "data_source" DEFAULT 'unverified' NOT NULL,
	"method" "claim_method",
	"status" "ga_status" DEFAULT 'disconnected' NOT NULL,
	"verified_at" timestamp with time zone,
	"last_sync_at" timestamp with time zone,
	"last_error" text,
	"evidence" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscription" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"provider" "payment_provider" NOT NULL,
	"external_id" text NOT NULL,
	"status" text DEFAULT 'inactive' NOT NULL,
	"current_period_end" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subscription_external_id_unique" UNIQUE("external_id")
);
--> statement-breakpoint
CREATE TABLE "tracker_event" (
	"event_id" text PRIMARY KEY NOT NULL,
	"site_id" uuid NOT NULL,
	"event_type" text NOT NULL,
	"session_id" text NOT NULL,
	"visitor_hash" text NOT NULL,
	"pathname" text DEFAULT '/' NOT NULL,
	"referrer_host" text,
	"country" text,
	"device" text,
	"decision" "fraud_decision" DEFAULT 'valid' NOT NULL,
	"reasons" jsonb,
	"occurred_at" timestamp with time zone NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"is_demo" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tracker_key" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" uuid NOT NULL,
	"public_key" text NOT NULL,
	"allowed_domains" text[] NOT NULL,
	"status" "tracker_key_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_event_at" timestamp with time zone,
	CONSTRAINT "tracker_key_public_key_unique" UNIQUE("public_key")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"role" "user_role" DEFAULT 'user' NOT NULL,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification_token" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "waitlist_entry" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"topic" text NOT NULL,
	"email" text NOT NULL,
	"consent" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "waitlist_topic_email_unique" UNIQUE("topic","email")
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "active_session" ADD CONSTRAINT "active_session_site_id_site_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."site"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_event" ADD CONSTRAINT "activity_event_site_id_site_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."site"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_audit_log" ADD CONSTRAINT "admin_audit_log_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blocked_domain" ADD CONSTRAINT "blocked_domain_blocked_by_user_id_user_id_fk" FOREIGN KEY ("blocked_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "boost_campaign" ADD CONSTRAINT "boost_campaign_site_id_site_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."site"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "boost_campaign" ADD CONSTRAINT "boost_campaign_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "boost_campaign" ADD CONSTRAINT "boost_campaign_category_id_category_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."category"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "boost_impression" ADD CONSTRAINT "boost_impression_campaign_id_boost_campaign_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."boost_campaign"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "boost_impression" ADD CONSTRAINT "boost_impression_site_id_site_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."site"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fraud_flag" ADD CONSTRAINT "fraud_flag_site_id_site_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."site"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fraud_flag" ADD CONSTRAINT "fraud_flag_resolved_by_user_id_user_id_fk" FOREIGN KEY ("resolved_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ga_connection" ADD CONSTRAINT "ga_connection_site_id_site_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."site"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moderation_action" ADD CONSTRAINT "moderation_action_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outbound_click" ADD CONSTRAINT "outbound_click_site_id_site_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."site"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outbound_click_aggregate" ADD CONSTRAINT "outbound_click_aggregate_site_id_site_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."site"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment" ADD CONSTRAINT "payment_boost_campaign_id_boost_campaign_id_fk" FOREIGN KEY ("boost_campaign_id") REFERENCES "public"."boost_campaign"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rank_snapshot" ADD CONSTRAINT "rank_snapshot_site_id_site_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."site"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site" ADD CONSTRAINT "site_category_id_category_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."category"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site" ADD CONSTRAINT "site_submitted_by_user_id_user_id_fk" FOREIGN KEY ("submitted_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_category" ADD CONSTRAINT "site_category_site_id_site_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."site"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_category" ADD CONSTRAINT "site_category_category_id_category_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."category"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_claim" ADD CONSTRAINT "site_claim_site_id_site_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."site"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_claim" ADD CONSTRAINT "site_claim_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_metric_current" ADD CONSTRAINT "site_metric_current_site_id_site_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."site"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_metric_snapshot" ADD CONSTRAINT "site_metric_snapshot_site_id_site_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."site"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_owner" ADD CONSTRAINT "site_owner_site_id_site_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."site"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_owner" ADD CONSTRAINT "site_owner_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_tag" ADD CONSTRAINT "site_tag_site_id_site_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."site"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_verification" ADD CONSTRAINT "site_verification_site_id_site_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."site"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription" ADD CONSTRAINT "subscription_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tracker_event" ADD CONSTRAINT "tracker_event_site_id_site_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."site"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tracker_key" ADD CONSTRAINT "tracker_key_site_id_site_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."site"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_user_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "active_session_site_idx" ON "active_session" USING btree ("site_id","last_heartbeat_at");--> statement-breakpoint
CREATE INDEX "activity_time_idx" ON "activity_event" USING btree ("occurred_at");--> statement-breakpoint
CREATE INDEX "admin_audit_time_idx" ON "admin_audit_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "admin_audit_request_idx" ON "admin_audit_log" USING btree ("request_id");--> statement-breakpoint
CREATE INDEX "boost_campaign_status_idx" ON "boost_campaign" USING btree ("status","placement");--> statement-breakpoint
CREATE INDEX "boost_campaign_site_idx" ON "boost_campaign" USING btree ("site_id");--> statement-breakpoint
CREATE INDEX "boost_campaign_owner_idx" ON "boost_campaign" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "boost_impression_campaign_idx" ON "boost_impression" USING btree ("campaign_id","occurred_at");--> statement-breakpoint
CREATE INDEX "boost_impression_dedupe_idx" ON "boost_impression" USING btree ("campaign_id","visitor_hash","occurred_at");--> statement-breakpoint
CREATE INDEX "fraud_flag_site_idx" ON "fraud_flag" USING btree ("site_id");--> statement-breakpoint
CREATE INDEX "fraud_flag_open_idx" ON "fraud_flag" USING btree ("resolved_at","created_at");--> statement-breakpoint
CREATE INDEX "moderation_action_target_idx" ON "moderation_action" USING btree ("target_type","target_id");--> statement-breakpoint
CREATE INDEX "moderation_action_request_idx" ON "moderation_action" USING btree ("request_id");--> statement-breakpoint
CREATE INDEX "outbound_click_site_time_idx" ON "outbound_click" USING btree ("site_id","occurred_at");--> statement-breakpoint
CREATE INDEX "outbound_click_visitor_idx" ON "outbound_click" USING btree ("visitor_hash","occurred_at");--> statement-breakpoint
CREATE INDEX "outbound_click_campaign_idx" ON "outbound_click" USING btree ("campaign_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_provider_ref_unique" ON "payment" USING btree ("provider","provider_reference");--> statement-breakpoint
CREATE UNIQUE INDEX "processed_webhook_unique" ON "processed_webhook_event" USING btree ("provider","event_id");--> statement-breakpoint
CREATE INDEX "rank_snapshot_scope_time_idx" ON "rank_snapshot" USING btree ("scope","window","captured_at");--> statement-breakpoint
CREATE INDEX "session_user_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "site_category_idx" ON "site" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "site_status_idx" ON "site" USING btree ("status");--> statement-breakpoint
CREATE INDEX "site_domain_idx" ON "site" USING btree ("domain");--> statement-breakpoint
CREATE INDEX "site_category_category_idx" ON "site_category" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "site_claim_site_idx" ON "site_claim" USING btree ("site_id","status");--> statement-breakpoint
CREATE INDEX "site_claim_user_idx" ON "site_claim" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "site_metric_heat_idx" ON "site_metric_current" USING btree ("heat_score");--> statement-breakpoint
CREATE INDEX "metric_snapshot_site_time_idx" ON "site_metric_snapshot" USING btree ("site_id","granularity","captured_at");--> statement-breakpoint
CREATE INDEX "tracker_event_site_time_idx" ON "tracker_event" USING btree ("site_id","occurred_at");--> statement-breakpoint
CREATE INDEX "tracker_event_type_time_idx" ON "tracker_event" USING btree ("event_type","occurred_at");--> statement-breakpoint
CREATE INDEX "tracker_event_session_idx" ON "tracker_event" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "tracker_key_site_idx" ON "tracker_key" USING btree ("site_id");