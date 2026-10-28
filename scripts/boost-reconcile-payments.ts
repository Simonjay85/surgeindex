import { getServerEnv } from "@surge/config";
import { withJobStatus } from "../apps/web/lib/server/job-status";

async function main() {
  const env = getServerEnv();
  if (env.APP_MODE !== "production" || env.DATA_PROVIDER !== "postgres" || !env.STRIPE_ENABLED) {
    console.log(JSON.stringify({ status: "disabled", reason: "Payment reconciliation requires production Postgres with Stripe enabled." }, null, 2));
    return;
  }
  const result = await withJobStatus("boost-reconcile-payments", async () => {
    const { inArray } = await import("drizzle-orm");
    const { boostOrder, getPostgresDb } = await import("@surge/db");
    const pending = await getPostgresDb().select({ id: boostOrder.id, paymentStatus: boostOrder.paymentStatus }).from(boostOrder).where(inArray(boostOrder.paymentStatus, ["pending", "processing"])).limit(500);
    return { status: "queued", pendingOrders: pending.length, note: "Webhook-backed reconciliation retains application state; unresolved Stripe objects require a provider fetch before mutation." };
  });
  console.log(JSON.stringify(result, null, 2));
}

void main();
