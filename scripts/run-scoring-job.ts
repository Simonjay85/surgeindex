import { runBaselineJob, runBreakoutJob, runRankingJob, runScoreJob } from "../apps/web/lib/server/ranking-engine";
import { getServerEnv } from "@surge/config";

const env = getServerEnv();
if (env.APP_MODE !== "production" || env.DATA_PROVIDER !== "postgres") {
  console.log(JSON.stringify({ status: "disabled", reason: "Scoring jobs require production Postgres." }));
  process.exit(0);
}
const job = process.argv.find((value) => value.startsWith("--job="))?.slice("--job=".length) ?? "all";
const result = job === "baseline"
  ? await runBaselineJob()
  : job === "score"
    ? await runScoreJob()
    : job === "ranking"
      ? await runRankingJob()
      : job === "breakout"
        ? await runBreakoutJob()
        : { error: `Unknown scoring job: ${job}` };
console.log(JSON.stringify(result, null, 2));
