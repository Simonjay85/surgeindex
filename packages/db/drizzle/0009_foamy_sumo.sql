ALTER TABLE "attribution_record" ADD COLUMN "campaign_id" uuid;--> statement-breakpoint
ALTER TABLE "attribution_record" ADD COLUMN "traffic_origin" text DEFAULT 'organic_surgedindex_referral' NOT NULL;--> statement-breakpoint
ALTER TABLE "tracker_event" ADD COLUMN "traffic_origin" text DEFAULT 'direct' NOT NULL;--> statement-breakpoint
ALTER TABLE "tracker_event" ADD COLUMN "attribution_campaign_id" uuid;--> statement-breakpoint
ALTER TABLE "attribution_record" ADD CONSTRAINT "attribution_record_campaign_id_boost_campaign_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."boost_campaign"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tracker_event" ADD CONSTRAINT "tracker_event_attribution_campaign_id_boost_campaign_id_fk" FOREIGN KEY ("attribution_campaign_id") REFERENCES "public"."boost_campaign"("id") ON DELETE set null ON UPDATE no action;