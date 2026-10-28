import { closeDb } from "@surge/db";
import { getServerEnv } from "@surge/config";
import { runAllScoringJobs } from "../apps/web/lib/server/ranking-engine";
import { withJobStatus } from "../apps/web/lib/server/job-status";

async function main(): Promise<void> {
  const env = getServerEnv();
  if (env.APP_MODE !== "production" || env.DATA_PROVIDER !== "postgres") {
    console.log(JSON.stringify({ status: "disabled", reason: "Scoring jobs require production Postgres." }));
    return;
  }
  try {
    const result = await withJobStatus("scoring-all", () => runAllScoringJobs());
    console.log(JSON.stringify(result, null, 2));
  } finally {
    // The timer is a short-lived oneshot. Close pg's pool so systemd can
    // reap the process instead of leaving its idle handles alive.
    await closeDb();
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Scoring jobs failed.");
  process.exitCode = 1;
});
