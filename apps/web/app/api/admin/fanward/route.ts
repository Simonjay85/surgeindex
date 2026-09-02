import { z } from "zod";
import { getServerEnv } from "@surge/config";
import { requireApiAdmin } from "../../../../lib/server/authorization";
import { FanwardServiceError, listFanwardAdminQueue } from "../../../../lib/server/fanward-service";
import { jsonError, jsonOk } from "../../../../lib/server/http";
import { checkRateLimit } from "../../../../lib/server/rate-limit";

export const runtime = "nodejs";

const querySchema = z.object({
  q: z.string().trim().max(80).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
}).strict();

export async function GET(request: Request) {
  if (!getServerEnv().FEATURE_CREATORS) return jsonError(request, 409, "feature_disabled", "Fanward is currently disabled.");
  const auth = await requireApiAdmin(request);
  if ("response" in auth) return auth.response;
  const parsed = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams.entries()));
  if (!parsed.success) return jsonError(request, 422, "invalid_query", "Review the Fanward queue filters and try again.");
  const rate = await checkRateLimit("fanward-admin-read", auth.user.id, 180, 60 * 60 * 1000);
  if (!rate.allowed) return jsonError(request, 429, "rate_limited", `Too many moderation requests. Try again in ${rate.retryAfterSeconds} seconds.`);
  try {
    return jsonOk(request, await listFanwardAdminQueue(parsed.data), 200, { "Cache-Control": "private, no-store" });
  } catch (error) {
    if (error instanceof FanwardServiceError) {
      if (error.code === "feature_disabled") return jsonError(request, 409, error.code, "Fanward is currently disabled.");
      if (error.code === "data_provider_unavailable") return jsonError(request, 503, error.code, error.message);
      if (error.code === "invalid_input") return jsonError(request, 422, error.code, error.message);
    }
    return jsonError(request, 500, "fanward_admin_unavailable", "The Fanward review queue is temporarily unavailable.");
  }
}
