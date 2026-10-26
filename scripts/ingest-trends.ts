/**
 * Hourly Top 10 ingestion: `pnpm trends:ingest`
 *
 * Reads public charts (Google Trends, YouTube, Wikipedia, Reddit, Hacker News,
 * GitHub, Amazon, eBay),
 * scores them and writes JSON snapshots to TRENDS_DATA_DIR
 * (default apps/web/data/trends). Designed for cron: sequential requests,
 * no database, a lock file against overlapping runs, exit code 0 unless every
 * live source failed.
 *
 * Env is read from the process, then from TRENDS_ENV_FILE or apps/web/.env
 * when present (existing variables are never overwritten).
 */
import { existsSync } from "node:fs";
import path from "node:path";
import { runIngest } from "../apps/web/lib/trends/ingest";
import { resolveTrendsDataDir } from "../apps/web/lib/trends/paths";

const envFile = process.env.TRENDS_ENV_FILE ?? path.join(process.cwd(), "apps", "web", ".env");
if (existsSync(envFile)) {
  try {
    process.loadEnvFile(envFile);
  } catch (e) {
    console.warn(`[trends] could not read ${envFile}: ${(e as Error).message}`);
  }
}

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
