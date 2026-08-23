import { getServerEnv } from "@surge/config";

async function main() {
  const env = getServerEnv();
  if (env.APP_MODE !== "production" || env.DATA_PROVIDER !== "postgres" || !env.BOOST_ENABLED) {
    console.log(JSON.stringify({ status: "disabled", reason: "Campaign completion requires production Postgres with BOOST_ENABLED=true." }, null, 2));
    return;
  }
  const { and, eq, inArray, lt } = await import("drizzle-orm");
  const { boostCampaign, getPostgresDb } = await import("@surge/db");
  const { transitionBoostCampaignForSystem } = await import("../apps/web/lib/server/boost-service");
  const db = getPostgresDb();
  const expired = await db.select({ id: boostCampaign.id, state: boostCampaign.state, validImpressions: boostCampaign.validImpressions, targetImpressions: boostCampaign.targetImpressions }).from(boostCampaign).where(and(inArray(boostCampaign.state, ["active", "scheduled"]), lt(boostCampaign.endAt, new Date()))).limit(500);
  let completed = 0;
  let underdelivery = 0;
  for (const campaign of expired) {
    const checkpoint = `boost-complete:${campaign.id}:${new Date().toISOString().slice(0, 10)}`;
    await transitionBoostCampaignForSystem({ campaignId: campaign.id, next: "delivery_complete", reason: "Campaign end was reached; delivery was frozen for reconciliation.", requestId: checkpoint });
    const next = campaign.validImpressions >= campaign.targetImpressions ? "completed" : "underdelivered";
    await transitionBoostCampaignForSystem({ campaignId: campaign.id, next, reason: next === "completed" ? "Qualified delivery target was met." : "Campaign ended below its qualified delivery target; admin resolution is required.", requestId: `${checkpoint}:${next}` });
    if (next === "completed") completed += 1; else underdelivery += 1;
  }
  console.log(JSON.stringify({ status: "completed", expired: expired.length, completed, underdelivery }, null, 2));
}

void main();
