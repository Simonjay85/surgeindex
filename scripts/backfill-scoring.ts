import { recomputeSite, runAllScoringJobs } from "../apps/web/lib/server/ranking-engine";

const siteId = process.argv.find((value) => value.startsWith("--site-id="))?.slice("--site-id=".length)
  ?? process.argv.find((value) => value.startsWith("--site="))?.slice("--site=".length);
const from = process.argv.find((value) => value.startsWith("--from="))?.slice("--from=".length);
const to = process.argv.find((value) => value.startsWith("--to="))?.slice("--to=".length);
const batchSize = Number(process.argv.find((value) => value.startsWith("--batch="))?.slice("--batch=".length) ?? 100);
const dryRun = process.argv.includes("--dry-run");
const rebuildBaseline = !process.argv.includes("--no-baseline");
if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 5_000) throw new Error("--batch must be an integer from 1 to 5000");
if (from && Number.isNaN(Date.parse(from))) throw new Error("--from must be an ISO date");
if (to && Number.isNaN(Date.parse(to))) throw new Error("--to must be an ISO date");
if (from && to && Date.parse(from) > Date.parse(to)) throw new Error("--from must be before --to");
const plan = { mode: siteId ? "site" : "all", siteId: siteId ?? null, from: from ?? null, to: to ?? null, batchSize, rebuildBaseline, dryRun, note: "Historical score rows are versioned and never deleted; the current runner publishes an idempotent bounded recompute." };
if (dryRun) {
  console.log(JSON.stringify({ plan }, null, 2));
  process.exit(0);
}
const now = to ? new Date(to) : undefined;
const result = siteId
  ? await recomputeSite(siteId, { now, rebuildBaseline })
  : await runAllScoringJobs({ now });
console.log(JSON.stringify({ plan, result }, null, 2));
