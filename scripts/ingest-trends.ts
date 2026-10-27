/**
 * Hourly Top 10 ingestion: `pnpm trends:ingest`
 *
 * Reads public charts (Google Trends, YouTube, Wikipedia, Reddit, Hacker News,
 * GitHub, Amazon, eBay, TikTok Shop VN via AccessTrade),
 * scores them and writes JSON snapshots to TRENDS_DATA_DIR
 * (default apps/web/data/trends). Designed for cron: sequential requests,
 * no database, a lock file against overlapping runs, exit code 0 unless every
 * live source failed.
 *
 * Env is read from the process, then from TRENDS_ENV_FILE or apps/web/.env
 * when present (existing variables are never overwritten).
 */
import path from "node:path";
import { loadEnvFileInto } from "../apps/web/lib/trends/env-file";
import { runIngest } from "../apps/web/lib/trends/ingest";
import { resolveTrendsDataDir } from "../apps/web/lib/trends/paths";

const explicitEnvFile = process.env.TRENDS_ENV_FILE?.trim();
const envFile = explicitEnvFile || path.join(process.cwd(), "apps", "web", ".env");
const envResult = loadEnvFileInto(envFile);
if (envResult.ok) {
  console.log(`[trends] env ${envFile}: set ${envResult.set.length ? envResult.set.join(", ") : "nothing new"}`);
} else if (explicitEnvFile) {
  // An explicit env file that cannot be read means optional keys (YouTube, Reddit) silently vanish; say so loudly.
  console.warn(`[trends] WARNING could not read TRENDS_ENV_FILE ${envFile} (${envResult.error}); optional API keys from it are missing this run`);
}
console.log(`[trends] YOUTUBE_API_KEY ${process.env.YOUTUBE_API_KEY?.trim() ? "present" : "MISSING"}`);
console.log(`[trends] ACCESSTRADE_API_KEY ${process.env.ACCESSTRADE_API_KEY?.trim() ? "present" : "MISSING"}`);

const dir = resolveTrendsDataDir();

runIngest(dir)
  .then(({ results }) => {
    const fetched = results.filter((r) => r.status !== "soon");
    const failed = fetched.filter((r) => r.status === "stale" || r.status === "unavailable");
    if (fetched.length && failed.length === fetched.length) {
      console.error("[trends] every source failed this run");
      process.exit(2);
    }
    process.exit(0);
  })
  .catch((e: unknown) => {
    console.error(`[trends] ingest aborted: ${(e as Error).message}`);
    process.exit(1);
  });
