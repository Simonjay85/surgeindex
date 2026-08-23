import { getServerEnv } from "@surge/config";

async function main() {
  const env = getServerEnv();
  if (env.APP_MODE !== "production" || env.DATA_PROVIDER !== "postgres" || !env.BOOST_ENABLED) {
    console.log(JSON.stringify({ status: "disabled", reason: "Boost pacing requires production Postgres with BOOST_ENABLED=true." }, null, 2));
    return;
  }
  const { and, eq, gte, lte } = await import("drizzle-orm");
  const { boostCampaign, boostDeliveryJob, getPostgresDb } = await import("@surge/db");
  const { deliveryPacing } = await import("@surge/boost");
  const db = getPostgresDb();
  const now = new Date();
  const campaigns = await db.select().from(boostCampaign).where(and(eq(boostCampaign.state, "active"), lte(boostCampaign.startAt, now), gte(boostCampaign.endAt, now))).limit(500);
  let updated = 0;
  for (const campaign of campaigns) {
    if (!campaign.startAt || !campaign.endAt) continue;
    const result = deliveryPacing({ targetQualifiedImpressions: campaign.targetImpressions, qualifiedImpressionsDelivered: campaign.validImpressions, startsAt: campaign.startAt, endsAt: campaign.endAt, now, maxOverdeliveryPercent: env.BOOST_MAX_OVERDELIVERY_PERCENT });
    await db.insert(boostDeliveryJob).values({ campaignId: campaign.id, jobKey: `pace:${now.toISOString().slice(0, 13)}`, jobType: "pacing", status: "completed", expectedProgress: String(result.expectedProgress), actualProgress: String(result.actualProgress), lastDeliveryAt: campaign.validImpressions > 0 ? now : null, startedAt: now, finishedAt: new Date(), requestId: `boost-pace:${now.toISOString()}` }).onConflictDoNothing();
    updated += 1;
  }
  console.log(JSON.stringify({ status: "completed", campaigns: campaigns.length, jobsWritten: updated }, null, 2));
}

void main();
