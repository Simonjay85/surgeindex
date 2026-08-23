import { getServerEnv } from "@surge/config";

async function main() {
  const env = getServerEnv();
  if (env.APP_MODE !== "production" || env.DATA_PROVIDER !== "postgres" || !env.BOOST_ENABLED) {
    console.log(JSON.stringify({ status: "disabled", reason: "Reservation cleanup requires production Postgres with BOOST_ENABLED=true." }, null, 2));
    return;
  }
  const { and, eq, inArray, lt } = await import("drizzle-orm");
  const { boostInventoryReservation, getPostgresDb } = await import("@surge/db");
  const { releaseBoostReservation } = await import("../apps/web/lib/server/boost-service");
  const db = getPostgresDb();
  // A confirmed reservation belongs to a paid campaign and may outlive the
  // Checkout hold window. Only abandoned, still-held reservations expire here.
  const expired = await db.select({ campaignId: boostInventoryReservation.campaignId }).from(boostInventoryReservation).where(and(eq(boostInventoryReservation.status, "held"), lt(boostInventoryReservation.expiresAt, new Date()))).limit(500);
  let released = 0;
  for (const row of expired) {
    if (await releaseBoostReservation({ campaignId: row.campaignId, reason: "Reservation cleanup expired an abandoned Checkout hold.", requestId: `boost-release:${row.campaignId}` , nextState: "checkout_expired" })) released += 1;
  }
  console.log(JSON.stringify({ status: "completed", expired: expired.length, released }, null, 2));
}

void main();
