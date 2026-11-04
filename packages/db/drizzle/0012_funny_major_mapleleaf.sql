CREATE TYPE "public"."revenue_source" AS ENUM('woocommerce', 'stripe_boost', 'ga4_ecommerce', 'manual');--> statement-breakpoint
CREATE TYPE "public"."revenue_status" AS ENUM('connected', 'stale', 'unavailable', 'error');--> statement-breakpoint
CREATE TABLE "site_page_metric_current" (
	"site_id" uuid NOT NULL,
	"pathname" text NOT NULL,
	"active_now" integer DEFAULT 0 NOT NULL,
	"active_sessions" integer DEFAULT 0 NOT NULL,
	"visitors_24h" bigint DEFAULT 0 NOT NULL,
	"visitors_7d" bigint DEFAULT 0 NOT NULL,
	"pageviews_24h" bigint DEFAULT 0 NOT NULL,
	"sessions_24h" bigint DEFAULT 0 NOT NULL,
	"engaged_sessions_24h" bigint DEFAULT 0 NOT NULL,
	"engagement_rate" numeric(5, 4),
	"avg_engagement_seconds" integer,
	"last_accepted_event_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"is_demo" boolean DEFAULT false NOT NULL,
	CONSTRAINT "site_page_metric_current_pk" PRIMARY KEY("site_id","pathname")
);
--> statement-breakpoint
CREATE TABLE "site_revenue_current" (
	"site_id" uuid NOT NULL,
	"source" "revenue_source" NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"gross_amount_cents" bigint DEFAULT 0 NOT NULL,
	"refunded_amount_cents" bigint DEFAULT 0 NOT NULL,
	"net_amount_cents" bigint DEFAULT 0 NOT NULL,
	"order_count" integer DEFAULT 0 NOT NULL,
	"last_order_at" timestamp with time zone,
	"period_start" timestamp with time zone,
	"period_end" timestamp with time zone,
	"last_synced_at" timestamp with time zone,
	"status" "revenue_status" DEFAULT 'unavailable' NOT NULL,
	"public_visible" boolean DEFAULT false NOT NULL,
	"provider_definition_version" text DEFAULT 'revenue-v1' NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"is_demo" boolean DEFAULT false NOT NULL,
	CONSTRAINT "site_revenue_current_pk" PRIMARY KEY("site_id","source","currency")
);
--> statement-breakpoint
ALTER TABLE "active_session" ADD COLUMN "last_pathname" text DEFAULT '/' NOT NULL;--> statement-breakpoint
ALTER TABLE "site_page_metric_current" ADD CONSTRAINT "site_page_metric_current_site_id_site_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."site"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_revenue_current" ADD CONSTRAINT "site_revenue_current_site_id_site_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."site"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "site_page_metric_site_pageviews_idx" ON "site_page_metric_current" USING btree ("site_id","pageviews_24h");--> statement-breakpoint
CREATE INDEX "site_page_metric_site_active_idx" ON "site_page_metric_current" USING btree ("site_id","active_now");--> statement-breakpoint
CREATE INDEX "site_revenue_site_source_idx" ON "site_revenue_current" USING btree ("site_id","source");--> statement-breakpoint
CREATE INDEX "site_revenue_public_idx" ON "site_revenue_current" USING btree ("public_visible","status");