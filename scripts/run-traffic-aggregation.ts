import { closeDb } from "@surge/db";
import { runTrafficAggregation } from "../apps/web/lib/server/traffic-aggregation";

async function main(): Promise<void> {
  try {
    const result = await runTrafficAggregation();
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
