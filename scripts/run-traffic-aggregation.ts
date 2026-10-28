import { closeDb } from "@surge/db";
import { getServerEnv } from "@surge/config";
import { runTrafficAggregation } from "../apps/web/lib/server/traffic-aggregation";
import { withJobStatus } from "../apps/web/lib/server/job-status";

async function main(): Promise<void> {
  const env = getServerEnv();
  if (env.APP_MODE !== "production" || env.DATA_PROVIDER !== "postgres") {
    console.log(JSON.stringify({ status: "disabled", reason: "Traffic aggregation requires production Postgres." }));
    return;
  }
  try {
    const result = await withJobStatus("traffic-aggregation", () => runTrafficAggregation());
    console.log(JSON.stringify(result));
  } finally {
    // The timer is a short-lived oneshot. Close pg's pool so systemd can
    // reap the process instead of leaving its idle handles alive.
    await closeDb();
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Traffic aggregation failed.");
  process.exitCode = 1;
});
