import { z } from "zod";
import { jsonError, jsonOk } from "../../../../../lib/server/http";
import { internalScoringTokenValid, recomputeSite, runAllScoringJobs, runBaselineJob, runBreakoutJob, runRankingJob, runScoreJob } from "../../../../../lib/server/ranking-engine";

export const runtime = "nodejs";

const bodySchema = z.object({
  job: z.enum(["baseline", "score", "ranking", "breakout", "all", "site"]).default("all"),
  siteId: z.string().uuid().optional(),
  rebuildBaseline: z.boolean().default(true),
});

export async function POST(request: Request) {
  if (!internalScoringTokenValid(request)) return jsonError(request, 401, "service_auth_required", "Internal scoring authentication is required.");
  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return jsonError(request, 422, "invalid_payload", "The scoring job payload is invalid.");
  if (parsed.data.job === "site" && !parsed.data.siteId) return jsonError(request, 422, "site_required", "siteId is required for a site recompute.");
  try {
    const result = parsed.data.job === "baseline"
      ? await runBaselineJob()
      : parsed.data.job === "score"
        ? await runScoreJob({ siteId: parsed.data.siteId })
        : parsed.data.job === "ranking"
          ? await runRankingJob()
          : parsed.data.job === "breakout"
            ? await runBreakoutJob()
            : parsed.data.job === "site"
              ? await recomputeSite(parsed.data.siteId!, { rebuildBaseline: parsed.data.rebuildBaseline })
              : await runAllScoringJobs();
    return jsonOk(request, result);
  } catch (error) {
    console.error(JSON.stringify({ component: "scoring-run", errorClass: error instanceof Error ? error.name : "unknown" }));
    return jsonError(request, 503, "scoring_job_failed", "The scoring job could not be completed.");
  }
}
