import { z } from "zod";
import { assertSameOrigin, jsonError, jsonOk, requestId } from "../../../../lib/server/http";
import { requireApiUser } from "../../../../lib/server/authorization";
import { checkRateLimit } from "../../../../lib/server/rate-limit";
import { boostErrorResponse } from "../../../../lib/server/boost-http";
import { createBoostCampaign, listOwnedBoostCampaigns } from "../../../../lib/server/boost-service";

export const runtime = "nodejs";

const createSchema = z.object({
  siteId: z.string().uuid(),
  packageKey: z.enum(["starter", "growth", "launch"]),
  placementKey: z.enum(["homepage_boosted", "category_boosted", "ranking_feed_insert", "site_profile_recommendation", "breakout_sponsor"]),
  durationDays: z.number().int().min(1).max(30).optional(),
  headline: z.string().trim().min(1).max(80),
  description: z.string().trim().min(1).max(180),
  ctaLabel: z.string().trim().min(1).max(24),
  destinationUrl: z.string().url().max(2_048).optional(),
});

export async function GET(request: Request) {
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;
  try {
    return jsonOk(request, { campaigns: await listOwnedBoostCampaigns(auth.user.id) });
  } catch (error) {
    return boostErrorResponse(request, error);
  }
}

export async function POST(request: Request) {
  const origin = assertSameOrigin(request);
  if (!origin.ok) return origin.response;
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;
  const rate = checkRateLimit("boost-campaign-create", auth.user.id, 10, 60 * 60 * 1000);
  if (!rate.allowed) return jsonError(request, 429, "rate_limited", "Campaign creation is temporarily rate-limited.");
  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError(request, 422, "invalid_payload", "Choose an eligible site, package, placement, and valid creative.");
  try {
    const campaign = await createBoostCampaign({
      userId: auth.user.id,
      siteId: parsed.data.siteId,
      packageKey: parsed.data.packageKey,
      placementKey: parsed.data.placementKey,
      durationDays: parsed.data.durationDays,
      creative: {
        headline: parsed.data.headline,
        description: parsed.data.description,
        ctaLabel: parsed.data.ctaLabel,
        destinationUrl: parsed.data.destinationUrl,
      },
      requestId: requestId(request),
    });
    return jsonOk(request, { campaign }, 201);
  } catch (error) {
    return boostErrorResponse(request, error);
  }
}
