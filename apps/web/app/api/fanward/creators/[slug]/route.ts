import { z } from "zod";
import { getServerEnv } from "@surge/config";
import { getTrustedClientIp } from "../../../../../lib/server/client-ip";
import { FanwardServiceError, getPublicFanwardCreatorBySlug } from "../../../../../lib/server/fanward-service";
import { jsonError, jsonOk } from "../../../../../lib/server/http";
import { checkRateLimit } from "../../../../../lib/server/rate-limit";

export const runtime = "nodejs";

const paramsSchema = z.object({ slug: z.string().trim().min(3).max(80).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/) });

export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  if (!getServerEnv().FEATURE_CREATORS) return jsonError(request, 404, "not_found", "Not found.");
  const parsed = paramsSchema.safeParse(await params);
  if (!parsed.success) return jsonError(request, 404, "not_found", "Not found.");
  const rate = await checkRateLimit("fanward-public-detail", getTrustedClientIp(request), 240, 60 * 60 * 1000);
  if (!rate.allowed) return jsonError(request, 429, "rate_limited", `Too many profile requests. Try again in ${rate.retryAfterSeconds} seconds.`);
  try {
    const creator = await getPublicFanwardCreatorBySlug(parsed.data.slug);
    if (!creator) return jsonError(request, 404, "not_found", "Not found.");
    return jsonOk(request, creator, 200, { "Cache-Control": "no-store" });
  } catch (error) {
    if (error instanceof FanwardServiceError) {
      if (error.code === "feature_disabled") return jsonError(request, 404, "not_found", "Not found.");
      if (error.code === "data_provider_unavailable") return jsonError(request, 503, error.code, error.message);
    }
    return jsonError(request, 500, "fanward_unavailable", "This Fanward profile is temporarily unavailable.");
  }
}
