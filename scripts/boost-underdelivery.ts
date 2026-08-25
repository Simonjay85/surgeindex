import { getServerEnv } from "@surge/config";
import { withJobStatus } from "../apps/web/lib/server/job-status";

async function main() {
  const env = getServerEnv();
  if (env.APP_MODE !== "production" || env.DATA_PROVIDER !== "postgres" || !env.BOOST_ENABLED) {
    console.log(JSON.stringify({ status: "disabled", reason: "Underdelivery detection requires production Postgres with BOOST_ENABLED=true." }, null, 2));
    return;
  }
  const result = await withJobStatus("boost-underdelivery", async () => {
    const { and, eq, lt } = await import("drizzle-orm");
    const { boostCampaign, getPostgresDb } = await import("@surge/db");
    const { transitionBoostCampaignForSystem } = await import("../apps/web/lib/server/boost-service");
    const db = getPostgresDb();
    const candidates = await db.select({ id: boostCampaign.id, validImpressions: boostCampaign.validImpressions, targetImpressions: boostCampaign.targetImpressions }).from(boostCampaign).where(and(eq(boostCampaign.state, "delivery_complete"), lt(boostCampaign.validImpressions, boostCampaign.targetImpressions))).limit(500);
    for (const campaign of candidates) await transitionBoostCampaignForSystem({ campaignId: campaign.id, next: "underdelivered", reason: "Reconciliation found a qualified-delivery shortfall; admin resolution is required.", requestId: `boost-underdelivery:${campaign.id}` });
    return { status: "completed", candidates: candidates.length, marked: candidates.length };
  });
  console.log(JSON.stringify(result, null, 2));
}

void main();
