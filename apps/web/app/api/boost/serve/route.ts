import { z } from "zod";
import { jsonError, jsonOk } from "../../../../lib/server/http";
import { anonymousVisitorHash, hashBoostToken, routeContext } from "../../../../lib/server/boost-tokens";
import { servedBoost } from "../../../../lib/server/boost-service";
import { checkRateLimit } from "../../../../lib/server/rate-limit";

export const runtime = "nodejs";

const querySchema = z.object({
  placement: z.enum(["homepage_boosted", "category_boosted", "ranking_feed_insert", "site_profile_recommendation", "breakout_sponsor"]).default("homepage_boosted"),
  categoryId: z.string().uuid().nullable().optional(),
});

export async function GET(request: Request) {
  const url = new URL(request.url);
  const parsed = querySchema.safeParse({ placement: url.searchParams.get("placement") ?? undefined, categoryId: url.searchParams.get("categoryId") ?? undefined });
  if (!parsed.success) return jsonError(request, 422, "invalid_placement", "The sponsored placement is invalid.");
  const visitorHash = anonymousVisitorHash(request, "serve");
  const rate = checkRateLimit("boost-serve", hashBoostToken(visitorHash), 120, 60 * 1000);
  if (!rate.allowed) return jsonError(request, 429, "rate_limited", "Sponsored delivery is temporarily rate-limited.");
  try {
    const result = await servedBoost({ placementKey: parsed.data.placement, categoryId: parsed.data.categoryId, routeContext: routeContext(request), visitorContextHash: anonymousVisitorHash(request, "public"), request });
    return jsonOk(request, result, 200, { "Cache-Control": "private, no-store" });
  } catch {
    return jsonError(request, 503, "boost_serve_unavailable", "Sponsored delivery is temporarily unavailable.");
  }
}
