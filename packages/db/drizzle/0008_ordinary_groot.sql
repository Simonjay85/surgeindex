CREATE TYPE "public"."boost_campaign_state" AS ENUM('draft', 'inventory_check', 'awaiting_checkout', 'inventory_reserved', 'pending_payment', 'payment_processing', 'paid', 'paid_pending_inventory_review', 'scheduled', 'active', 'paused', 'delivery_complete', 'completed', 'underdelivered', 'cancel_requested', 'cancelled', 'refund_pending', 'partially_refunded', 'refunded', 'payment_failed', 'checkout_expired', 'disputed', 'suspended');--> statement-breakpoint
CREATE TYPE "public"."boost_creative_state" AS ENUM('draft', 'pending_review', 'approved', 'rejected', 'suspended');--> statement-breakpoint
CREATE TYPE "public"."boost_dispute_status" AS ENUM('open', 'won', 'lost', 'closed');--> statement-breakpoint
CREATE TYPE "public"."boost_impression_classification" AS ENUM('opportunity', 'rendered', 'qualified', 'duplicate', 'invalid', 'suspected', 'viewability_failed', 'expired_token', 'frequency_capped', 'owner_self_view');--> statement-breakpoint
CREATE TYPE "public"."boost_payment_status" AS ENUM('pending', 'processing', 'succeeded', 'failed', 'expired', 'partially_refunded', 'refunded', 'disputed');--> statement-breakpoint
CREATE TYPE "public"."boost_refund_status" AS ENUM('requested', 'processing', 'succeeded', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."boost_reservation_status" AS ENUM('held', 'confirmed', 'released', 'expired');--> statement-breakpoint
CREATE TYPE "public"."stripe_environment" AS ENUM('test', 'live');--> statement-breakpoint
CREATE TABLE "boost_attribution_aggregate" (
	"campaign_id" uuid NOT NULL,
	"site_id" uuid NOT NULL,
	"day" date NOT NULL,
	"attributed_visits" integer DEFAULT 0 NOT NULL,
	"attributed_engaged_visits" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "boost_attribution_aggregate_campaign_id_day_pk" PRIMARY KEY("campaign_id","day")
);
--> statement-breakpoint
CREATE TABLE "boost_campaign_creative" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"state" "boost_creative_state" DEFAULT 'draft' NOT NULL,
	"headline" text NOT NULL,
	"description" text NOT NULL,
	"cta_label" text NOT NULL,
	"destination_url" text NOT NULL,
	"logo_url" text,
	"moderation_reason" text,
	"approved_by_user_id" text,
	"approved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "boost_creative_campaign_version_unique" UNIQUE("campaign_id","version")
);
--> statement-breakpoint
CREATE TABLE "boost_campaign_state_transition" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"previous_state" "boost_campaign_state",
	"new_state" "boost_campaign_state" NOT NULL,
	"reason" text NOT NULL,
	"actor_user_id" text,
	"request_id" text NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "boost_click_event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"site_id" uuid NOT NULL,
	"impression_opportunity_id" uuid,
	"visitor_hash" text NOT NULL,
	"destination_url" text NOT NULL,
	"valid" boolean DEFAULT false NOT NULL,
	"unique_click" boolean DEFAULT false NOT NULL,
	"decision" "fraud_decision" DEFAULT 'valid' NOT NULL,
	"referrer_path" text,
	"creative_version" integer NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"is_demo" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "boost_delivery_job" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"job_key" text NOT NULL,
	"job_type" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"expected_progress" numeric(6, 4),
	"actual_progress" numeric(6, 4),
	"last_delivery_at" timestamp with time zone,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"error_code" text,
	"request_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "boost_delivery_job_key_unique" UNIQUE("campaign_id","job_key")
);
--> statement-breakpoint
CREATE TABLE "boost_dispute" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"payment_id" uuid,
	"order_id" uuid NOT NULL,
	"stripe_environment" "stripe_environment" NOT NULL,
	"stripe_dispute_id" text NOT NULL,
	"status" "boost_dispute_status" DEFAULT 'open' NOT NULL,
	"reason" text,
	"evidence_snapshot" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "boost_dispute_environment_provider_id_unique" UNIQUE("stripe_environment","stripe_dispute_id")
);
--> statement-breakpoint
CREATE TABLE "boost_frequency_cap" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"visitor_hash" text NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"exposure_count" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "boost_frequency_campaign_visitor_window_unique" UNIQUE("campaign_id","visitor_hash","window_start")
);
--> statement-breakpoint
CREATE TABLE "boost_impression_aggregate" (
	"campaign_id" uuid NOT NULL,
	"bucket_start" timestamp with time zone NOT NULL,
	"opportunities" integer DEFAULT 0 NOT NULL,
	"rendered_impressions" integer DEFAULT 0 NOT NULL,
	"qualified_impressions" integer DEFAULT 0 NOT NULL,
	"invalid_impressions" integer DEFAULT 0 NOT NULL,
	"suspected_impressions" integer DEFAULT 0 NOT NULL,
	"duplicate_impressions" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "boost_impression_aggregate_campaign_id_bucket_start_pk" PRIMARY KEY("campaign_id","bucket_start")
);
--> statement-breakpoint
CREATE TABLE "boost_impression_event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" text NOT NULL,
	"opportunity_id" uuid,
	"campaign_id" uuid NOT NULL,
	"site_id" uuid NOT NULL,
	"visitor_hash" text NOT NULL,
	"classification" "boost_impression_classification" NOT NULL,
	"visible_percent" integer,
	"visible_milliseconds" integer,
	"user_agent_class" text,
	"reason_code" text,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"is_demo" boolean DEFAULT false NOT NULL,
	CONSTRAINT "boost_impression_event_event_id_unique" UNIQUE("event_id")
);
--> statement-breakpoint
CREATE TABLE "boost_impression_opportunity" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"placement_key" text NOT NULL,
	"creative_version" integer NOT NULL,
	"visitor_context_hash" text NOT NULL,
	"route_context" text,
	"token_hash" text NOT NULL,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "boost_impression_opportunity_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "boost_inventory_reservation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"window_id" uuid,
	"placement_key" text NOT NULL,
	"category_id" uuid,
	"reserved_impressions" integer NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"status" "boost_reservation_status" DEFAULT 'held' NOT NULL,
	"stripe_checkout_session_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"released_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "boost_inventory_window" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"placement_key" text NOT NULL,
	"category_id" uuid,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"estimated_opportunities" integer DEFAULT 0 NOT NULL,
	"estimated_qualified_impressions" integer DEFAULT 0 NOT NULL,
	"reserved_impressions" integer DEFAULT 0 NOT NULL,
	"safe_capacity" integer DEFAULT 0 NOT NULL,
	"confidence" text DEFAULT 'unknown' NOT NULL,
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "boost_order" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"package_key" text NOT NULL,
	"package_snapshot" jsonb NOT NULL,
	"currency" text NOT NULL,
	"expected_amount_cents" integer NOT NULL,
	"paid_amount_cents" integer DEFAULT 0 NOT NULL,
	"refunded_amount_cents" integer DEFAULT 0 NOT NULL,
	"stripe_environment" "stripe_environment" DEFAULT 'test' NOT NULL,
	"payment_status" "boost_payment_status" DEFAULT 'pending' NOT NULL,
	"paid_at" timestamp with time zone,
	"refunded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "boost_order_campaign_id_unique" UNIQUE("campaign_id")
);
--> statement-breakpoint
CREATE TABLE "boost_package" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"package_key" text NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"amount_cents" integer,
	"stripe_price_id" text,
	"target_qualified_impressions" integer,
	"eligible_placements" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"eligible_categories" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"default_duration_days" integer DEFAULT 7 NOT NULL,
	"maximum_duration_days" integer DEFAULT 30 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "boost_package_package_key_unique" UNIQUE("package_key")
);
--> statement-breakpoint
CREATE TABLE "boost_payment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"stripe_environment" "stripe_environment" NOT NULL,
	"status" "boost_payment_status" DEFAULT 'pending' NOT NULL,
	"amount_cents" integer NOT NULL,
	"currency" text NOT NULL,
	"stripe_payment_intent_id" text,
	"stripe_charge_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"paid_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "boost_payment_environment_intent_unique" UNIQUE("stripe_environment","stripe_payment_intent_id")
);
--> statement-breakpoint
CREATE TABLE "boost_placement_config" (
	"key" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"route_pattern" text NOT NULL,
	"eligible_categories" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"device_support" text[] DEFAULT ARRAY['desktop','mobile','tablet']::text[] NOT NULL,
	"creative_spec" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"frequency_policy" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"viewability_rule" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "boost_refund" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"stripe_environment" "stripe_environment" NOT NULL,
	"stripe_refund_id" text,
	"amount_cents" integer NOT NULL,
	"status" "boost_refund_status" DEFAULT 'requested' NOT NULL,
	"reason" text NOT NULL,
	"requested_by_user_id" text,
	"approved_by_user_id" text,
	"request_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "boost_refund_environment_provider_id_unique" UNIQUE("stripe_environment","stripe_refund_id")
);
--> statement-breakpoint
CREATE TABLE "boost_stripe_checkout_session" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"stripe_session_id" text NOT NULL,
	"stripe_environment" "stripe_environment" NOT NULL,
	"idempotency_key" text NOT NULL,
	"payment_intent_id" text,
	"status" text DEFAULT 'open' NOT NULL,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "boost_stripe_checkout_session_order_id_unique" UNIQUE("order_id"),
	CONSTRAINT "boost_checkout_session_environment_id_unique" UNIQUE("stripe_environment","stripe_session_id"),
	CONSTRAINT "boost_checkout_session_idempotency_unique" UNIQUE("stripe_environment","idempotency_key")
);
--> statement-breakpoint
CREATE TABLE "stripe_customer" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"stripe_customer_id" text NOT NULL,
	"stripe_environment" "stripe_environment" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stripe_customer_user_environment_unique" UNIQUE("user_id","stripe_environment"),
	CONSTRAINT "stripe_customer_provider_id_unique" UNIQUE("stripe_environment","stripe_customer_id")
);
--> statement-breakpoint
DROP INDEX "processed_webhook_unique";--> statement-breakpoint
ALTER TABLE "boost_campaign" ADD COLUMN "state" "boost_campaign_state" DEFAULT 'draft' NOT NULL;--> statement-breakpoint
ALTER TABLE "boost_campaign" ADD COLUMN "placement_key" text DEFAULT 'homepage_boosted' NOT NULL;--> statement-breakpoint
ALTER TABLE "boost_campaign" ADD COLUMN "package_id" uuid;--> statement-breakpoint
ALTER TABLE "boost_campaign" ADD COLUMN "package_key" text DEFAULT 'custom' NOT NULL;--> statement-breakpoint
ALTER TABLE "boost_campaign" ADD COLUMN "package_snapshot" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "boost_campaign" ADD COLUMN "short_description" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "boost_campaign" ADD COLUMN "cta_label" text DEFAULT 'Visit site' NOT NULL;--> statement-breakpoint
ALTER TABLE "boost_campaign" ADD COLUMN "destination_url" text;--> statement-breakpoint
ALTER TABLE "boost_campaign" ADD COLUMN "logo_url" text;--> statement-breakpoint
ALTER TABLE "boost_campaign" ADD COLUMN "creative_version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "boost_campaign" ADD COLUMN "pacing_mode" text DEFAULT 'even' NOT NULL;--> statement-breakpoint
ALTER TABLE "boost_campaign" ADD COLUMN "rendered_impressions" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "boost_campaign" ADD COLUMN "invalid_impressions" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "boost_campaign" ADD COLUMN "clicks" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "boost_campaign" ADD COLUMN "attributed_visits" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "boost_campaign" ADD COLUMN "attributed_engaged_visits" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "boost_campaign" ADD COLUMN "owner_self_view_excluded" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "outbound_click" ADD COLUMN "traffic_origin" text DEFAULT 'organic_surgedindex_referral' NOT NULL;--> statement-breakpoint
ALTER TABLE "processed_webhook_event" ADD COLUMN "stripe_environment" "stripe_environment" DEFAULT 'test' NOT NULL;--> statement-breakpoint
ALTER TABLE "processed_webhook_event" ADD COLUMN "event_type" text;--> statement-breakpoint
ALTER TABLE "processed_webhook_event" ADD COLUMN "request_id" text;--> statement-breakpoint
ALTER TABLE "processed_webhook_event" ADD COLUMN "processing_result" text;--> statement-breakpoint
ALTER TABLE "processed_webhook_event" ADD COLUMN "error_code" text;--> statement-breakpoint
ALTER TABLE "boost_attribution_aggregate" ADD CONSTRAINT "boost_attribution_aggregate_campaign_id_boost_campaign_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."boost_campaign"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "boost_attribution_aggregate" ADD CONSTRAINT "boost_attribution_aggregate_site_id_site_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."site"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "boost_campaign_creative" ADD CONSTRAINT "boost_campaign_creative_campaign_id_boost_campaign_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."boost_campaign"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "boost_campaign_creative" ADD CONSTRAINT "boost_campaign_creative_approved_by_user_id_user_id_fk" FOREIGN KEY ("approved_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "boost_campaign_state_transition" ADD CONSTRAINT "boost_campaign_state_transition_campaign_id_boost_campaign_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."boost_campaign"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "boost_campaign_state_transition" ADD CONSTRAINT "boost_campaign_state_transition_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "boost_click_event" ADD CONSTRAINT "boost_click_event_campaign_id_boost_campaign_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."boost_campaign"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "boost_click_event" ADD CONSTRAINT "boost_click_event_site_id_site_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."site"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "boost_click_event" ADD CONSTRAINT "boost_click_event_impression_opportunity_id_boost_impression_opportunity_id_fk" FOREIGN KEY ("impression_opportunity_id") REFERENCES "public"."boost_impression_opportunity"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "boost_delivery_job" ADD CONSTRAINT "boost_delivery_job_campaign_id_boost_campaign_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."boost_campaign"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "boost_dispute" ADD CONSTRAINT "boost_dispute_payment_id_boost_payment_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."boost_payment"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "boost_dispute" ADD CONSTRAINT "boost_dispute_order_id_boost_order_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."boost_order"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "boost_frequency_cap" ADD CONSTRAINT "boost_frequency_cap_campaign_id_boost_campaign_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."boost_campaign"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "boost_impression_aggregate" ADD CONSTRAINT "boost_impression_aggregate_campaign_id_boost_campaign_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."boost_campaign"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "boost_impression_event" ADD CONSTRAINT "boost_impression_event_opportunity_id_boost_impression_opportunity_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."boost_impression_opportunity"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "boost_impression_event" ADD CONSTRAINT "boost_impression_event_campaign_id_boost_campaign_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."boost_campaign"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "boost_impression_event" ADD CONSTRAINT "boost_impression_event_site_id_site_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."site"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "boost_impression_opportunity" ADD CONSTRAINT "boost_impression_opportunity_campaign_id_boost_campaign_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."boost_campaign"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "boost_inventory_reservation" ADD CONSTRAINT "boost_inventory_reservation_campaign_id_boost_campaign_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."boost_campaign"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "boost_inventory_reservation" ADD CONSTRAINT "boost_inventory_reservation_window_id_boost_inventory_window_id_fk" FOREIGN KEY ("window_id") REFERENCES "public"."boost_inventory_window"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "boost_inventory_reservation" ADD CONSTRAINT "boost_inventory_reservation_category_id_category_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."category"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "boost_inventory_window" ADD CONSTRAINT "boost_inventory_window_category_id_category_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."category"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "boost_order" ADD CONSTRAINT "boost_order_campaign_id_boost_campaign_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."boost_campaign"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "boost_order" ADD CONSTRAINT "boost_order_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "boost_payment" ADD CONSTRAINT "boost_payment_order_id_boost_order_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."boost_order"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "boost_refund" ADD CONSTRAINT "boost_refund_order_id_boost_order_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."boost_order"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "boost_refund" ADD CONSTRAINT "boost_refund_requested_by_user_id_user_id_fk" FOREIGN KEY ("requested_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "boost_refund" ADD CONSTRAINT "boost_refund_approved_by_user_id_user_id_fk" FOREIGN KEY ("approved_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "boost_stripe_checkout_session" ADD CONSTRAINT "boost_stripe_checkout_session_order_id_boost_order_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."boost_order"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stripe_customer" ADD CONSTRAINT "stripe_customer_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "boost_attribution_site_day_idx" ON "boost_attribution_aggregate" USING btree ("site_id","day");--> statement-breakpoint
CREATE INDEX "boost_creative_campaign_state_idx" ON "boost_campaign_creative" USING btree ("state","updated_at");--> statement-breakpoint
CREATE INDEX "boost_state_transition_campaign_time_idx" ON "boost_campaign_state_transition" USING btree ("campaign_id","occurred_at");--> statement-breakpoint
CREATE INDEX "boost_state_transition_request_idx" ON "boost_campaign_state_transition" USING btree ("request_id");--> statement-breakpoint
CREATE INDEX "boost_click_campaign_time_idx" ON "boost_click_event" USING btree ("campaign_id","occurred_at");--> statement-breakpoint
CREATE INDEX "boost_click_visitor_time_idx" ON "boost_click_event" USING btree ("campaign_id","visitor_hash","occurred_at");--> statement-breakpoint
CREATE INDEX "boost_delivery_job_status_idx" ON "boost_delivery_job" USING btree ("status","updated_at");--> statement-breakpoint
CREATE INDEX "boost_dispute_status_idx" ON "boost_dispute" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "boost_frequency_expiry_idx" ON "boost_frequency_cap" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "boost_impression_aggregate_time_idx" ON "boost_impression_aggregate" USING btree ("bucket_start");--> statement-breakpoint
CREATE INDEX "boost_impression_event_campaign_time_idx" ON "boost_impression_event" USING btree ("campaign_id","occurred_at");--> statement-breakpoint
CREATE INDEX "boost_impression_event_visitor_idx" ON "boost_impression_event" USING btree ("campaign_id","visitor_hash","occurred_at");--> statement-breakpoint
CREATE INDEX "boost_opportunity_campaign_idx" ON "boost_impression_opportunity" USING btree ("campaign_id","issued_at");--> statement-breakpoint
CREATE INDEX "boost_opportunity_expiry_idx" ON "boost_impression_opportunity" USING btree ("expires_at","used_at");--> statement-breakpoint
CREATE INDEX "boost_reservation_window_idx" ON "boost_inventory_reservation" USING btree ("placement_key","category_id","starts_at","ends_at","status");--> statement-breakpoint
CREATE INDEX "boost_reservation_campaign_idx" ON "boost_inventory_reservation" USING btree ("campaign_id","status");--> statement-breakpoint
CREATE INDEX "boost_inventory_window_lookup_idx" ON "boost_inventory_window" USING btree ("placement_key","category_id","starts_at","ends_at");--> statement-breakpoint
CREATE INDEX "boost_order_user_idx" ON "boost_order" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "boost_order_payment_status_idx" ON "boost_order" USING btree ("payment_status","updated_at");--> statement-breakpoint
CREATE INDEX "boost_payment_order_idx" ON "boost_payment" USING btree ("order_id","created_at");--> statement-breakpoint
CREATE INDEX "boost_refund_order_idx" ON "boost_refund" USING btree ("order_id","created_at");--> statement-breakpoint
ALTER TABLE "boost_campaign" ADD CONSTRAINT "boost_campaign_package_id_boost_package_id_fk" FOREIGN KEY ("package_id") REFERENCES "public"."boost_package"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "processed_webhook_unique" ON "processed_webhook_event" USING btree ("provider","stripe_environment","event_id");