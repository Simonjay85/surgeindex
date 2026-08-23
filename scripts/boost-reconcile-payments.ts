import { getServerEnv } from "@surge/config";

async function main() {
  const env = getServerEnv();
  if (env.APP_MODE !== "production" || env.DATA_PROVIDER !== "postgres" || !env.STRIPE_ENABLED) {
    console.log(JSON.stringify({ status: "disabled", reason: "Payment reconciliation requires production Postgres with Stripe enabled." }, null, 2));
    return;
  }
  const { inArray } = await import("drizzle-orm");
  const { boostOrder, getPostgresDb } = await import("@surge/db");
  const pending = await getPostgresDb().select({ id: boostOrder.id, paymentStatus: boostOrder.paymentStatus }).from(boostOrder).where(inArray(boostOrder.paymentStatus, ["pending", "processing"])).limit(500);
  console.log(JSON.stringify({ status: "queued", pendingOrders: pending.length, note: "Webhook-backed reconciliation retains application state; unresolved Stripe objects require a provider fetch before mutation." }, null, 2));
}

void main();
