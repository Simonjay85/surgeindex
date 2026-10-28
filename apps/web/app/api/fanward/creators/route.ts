import { z } from "zod";
import { getServerEnv } from "@surge/config";
import { getTrustedClientIp } from "../../../../lib/server/client-ip";
import { jsonError, jsonOk } from "../../../../lib/server/http";
import { checkRateLimit } from "../../../../lib/server/rate-limit";
import { FanwardServiceError, listPublicFanwardCreators } from "../../../../lib/server/fanward-service";

export const runtime = "nodejs";

const querySchema = z.object({
  q: z.string().trim().max(80).optional(),
  category: z.string().trim().max(80).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).optional(),
  cursor: z.string().trim().max(512).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(24),
}).strict();

export async function GET(request: Request) {
  if (!getServerEnv().FEATURE_CREATORS) return jsonError(request, 404, "not_found", "Not found.");
  const url = new URL(request.url);
  const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams.entries()));
  if (!parsed.success) return jsonError(request, 422, "invalid_query", "Review the Fanward directory filters and try again.");
  const rate = await checkRateLimit("fanward-public-list", getTrustedClientIp(request), 180, 60 * 60 * 1000);
  if (!rate.allowed) return jsonError(request, 429, "rate_limited", `Too many directory requests. Try again in ${rate.retryAfterSeconds} seconds.`);
  try {
    const result = await listPublicFanwardCreators(parsed.data);
    return jsonOk(request, result, 200, { "Cache-Control": "no-store" });
  } catch (error) {
    if (error instanceof FanwardServiceError) {
      if (error.code === "feature_disabled") return jsonError(request, 404, "not_found", "Not found.");
      if (error.code === "invalid_cursor" || error.code === "invalid_input") return jsonError(request, 422, error.code, error.message);
      if (error.code === "data_provider_unavailable") return jsonError(request, 503, error.code, error.message);
    }
    return jsonError(request, 500, "fanward_unavailable", "The Fanward directory is temporarily unavailable.");
  }
}
