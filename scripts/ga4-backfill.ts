import { getServerEnv } from "@surge/config";

async function main() {
  const env = getServerEnv();
  if (env.APP_MODE !== "production" || env.DATA_PROVIDER !== "postgres" || !env.GA4_ENABLED) {
    console.log(JSON.stringify({ status: "disabled", reason: "GA4 backfill requires production Postgres with GA4_ENABLED=true." }, null, 2));
    return;
  }
  const { runGa4Backfill } = await import("../apps/web/lib/server/ga4-service");
  const args = new Map(process.argv.slice(2).map((value) => { const [key, val] = value.split("=", 2); return [key, val ?? "true"]; }));
  const result = await runGa4Backfill({ siteId: args.get("--site-id"), connectionId: args.get("--connection-id"), requestId: args.get("--request-id") });
  console.log(JSON.stringify(result, null, 2));
}

void main();
