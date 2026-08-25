import { desc } from "drizzle-orm";
import { getServerEnv } from "@surge/config";
import { getPostgresDb, systemJobRun } from "@surge/db";
import { requireApiAdmin } from "../../../../../lib/server/authorization";
import { jsonError, jsonOk } from "../../../../../lib/server/http";

export const runtime = "nodejs";

export async function GET(request: Request) {
  if (getServerEnv().DATA_PROVIDER !== "postgres") return jsonOk(request, { source: "demo", jobs: [] });
  const auth = await requireApiAdmin(request);
  if ("response" in auth) return auth.response;
  try {
    const jobs = await getPostgresDb().select().from(systemJobRun).orderBy(desc(systemJobRun.lastSuccessAt), desc(systemJobRun.updatedAt));
    return jsonOk(request, {
      source: "postgres",
      jobs: jobs.map((job) => ({
        jobKey: job.jobKey,
        lastStartedAt: job.lastStartedAt?.toISOString() ?? null,
        lastSuccessAt: job.lastSuccessAt?.toISOString() ?? null,
        lastFailureAt: job.lastFailureAt?.toISOString() ?? null,
        lastErrorCode: job.lastErrorCode,
        consecutiveFailures: job.consecutiveFailures,
        lastRequestId: job.lastRequestId,
        updatedAt: job.updatedAt.toISOString(),
      })),
    });
  } catch {
    return jsonError(request, 503, "job_health_unavailable", "Job health is temporarily unavailable.");
  }
}
