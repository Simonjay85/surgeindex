import { getServerEnv } from "@surge/config";
import { withJobStatus } from "../apps/web/lib/server/job-status";

async function main() {
  const env = getServerEnv();
  if (env.APP_MODE !== "production" || env.DATA_PROVIDER !== "postgres" || !env.GA4_ENABLED) {
    console.log(JSON.stringify({ status: "disabled", reason: "GA4 health requires production Postgres with GA4_ENABLED=true." }, null, 2));
    return;
  }
  const { getGa4Operations } = await import("../apps/web/lib/server/ga4-service");
  console.log(JSON.stringify(await withJobStatus("ga4-health", () => getGa4Operations()), null, 2));
}

void main();
