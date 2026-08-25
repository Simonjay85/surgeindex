import { getServerEnv } from "@surge/config";
import { withJobStatus } from "../apps/web/lib/server/job-status";

async function main() {
  const env = getServerEnv();
  if (env.APP_MODE !== "production" || env.DATA_PROVIDER !== "postgres" || !env.GA4_ENABLED) {
    console.log(JSON.stringify({ status: "disabled", reason: "GA4 sync requires production Postgres with GA4_ENABLED=true." }, null, 2));
    return;
  }
  const { runGa4CoreSync } = await import("../apps/web/lib/server/ga4-service");
  const args = new Map(process.argv.slice(2).map((value) => { const [key, val] = value.split("=", 2); return [key, val ?? "true"]; }));
  const result = await withJobStatus("ga4-core-sync", (requestId) => runGa4CoreSync({ siteId: args.get("--site-id"), connectionId: args.get("--connection-id"), requestId }));
  console.log(JSON.stringify(result, null, 2));
}

void main();
