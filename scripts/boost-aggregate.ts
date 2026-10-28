import { getServerEnv } from "@surge/config";
import { withJobStatus } from "../apps/web/lib/server/job-status";

async function main() {
  const env = getServerEnv();
  if (env.APP_MODE !== "production" || env.DATA_PROVIDER !== "postgres" || !env.BOOST_ENABLED) {
    console.log(JSON.stringify({ status: "disabled", reason: "Boost aggregation requires production Postgres with BOOST_ENABLED=true." }, null, 2));
    return;
  }
  const result = await withJobStatus("boost-aggregate", async () => {
    const { eq, sql } = await import("drizzle-orm");
    const { boostCampaign, boostClickEvent, boostImpressionEvent, getPostgresDb } = await import("@surge/db");
    const db = getPostgresDb();
    const campaigns = await db.select({ id: boostCampaign.id }).from(boostCampaign).limit(1000);
    let rebuilt = 0;
    for (const campaign of campaigns) {
      const [impressions] = await db.select({ qualified: sql<number>`count(*) filter (where ${boostImpressionEvent.classification} = 'qualified')`, rendered: sql<number>`count(*) filter (where ${boostImpressionEvent.classification} in ('qualified','viewability_failed','expired_token','owner_self_view','frequency_capped'))`, invalid: sql<number>`count(*) filter (where ${boostImpressionEvent.classification} in ('invalid','viewability_failed','expired_token','owner_self_view','frequency_capped'))` }).from(boostImpressionEvent).where(eq(boostImpressionEvent.campaignId, campaign.id));
      const [clicks] = await db.select({ total: sql<number>`count(*)`, valid: sql<number>`count(*) filter (where ${boostClickEvent.valid} = true)`, unique: sql<number>`count(*) filter (where ${boostClickEvent.uniqueClick} = true and ${boostClickEvent.valid} = true)` }).from(boostClickEvent).where(eq(boostClickEvent.campaignId, campaign.id));
      await db.update(boostCampaign).set({ validImpressions: Number(impressions?.qualified ?? 0), deliveredImpressions: Number(impressions?.qualified ?? 0), renderedImpressions: Number(impressions?.rendered ?? 0), invalidImpressions: Number(impressions?.invalid ?? 0), clicks: Number(clicks?.total ?? 0), validClicks: Number(clicks?.valid ?? 0), uniqueClicks: Number(clicks?.unique ?? 0), updatedAt: new Date() }).where(eq(boostCampaign.id, campaign.id));
      rebuilt += 1;
    }
    return { status: "completed", campaigns: campaigns.length, rebuilt };
  });
  console.log(JSON.stringify(result, null, 2));
}

void main();
