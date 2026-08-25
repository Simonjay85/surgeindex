import { z } from "zod";
import { getServerEnv } from "@surge/config";
import { requireApiUser } from "../../../../lib/server/authorization";
import { assertSameOrigin, jsonError, jsonOk, requestId } from "../../../../lib/server/http";
import { checkRateLimit } from "../../../../lib/server/rate-limit";
import { BoostServiceError, forecastBoostInventory } from "../../../../lib/server/boost-service";
import { getBoostPackage } from "../../../../lib/server/boost-config";

export const runtime = "nodejs";

const bodySchema = z.object({
  siteId: z.string().uuid(),
  packageKey: z.enum(["starter", "growth", "launch", "custom"]),
  placementKey: z.enum(["homepage_boosted", "category_boosted", "ranking_feed_insert", "site_profile_recommendation", "breakout_sponsor"]),
  categoryId: z.string().uuid().nullable().optional(),
  startsAt: z.string().datetime({ offset: true }),
  endsAt: z.string().datetime({ offset: true }),
});

export async function POST(request: Request) {
  const origin = assertSameOrigin(request);
  if (!origin.ok) return origin.response;
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;
  if (getServerEnv().APP_MODE !== "production" || getServerEnv().DATA_PROVIDER !== "postgres") return jsonError(request, 409, "demo_mode", "Inventory forecasts are fixture-only in demo mode.");
  const rate = await checkRateLimit("boost-forecast", auth.user.id, 30, 60 * 60 * 1000);
  if (!rate.allowed) return jsonError(request, 429, "rate_limited", "Inventory forecasting is temporarily rate-limited.");
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError(request, 422, "invalid_payload", "Choose a valid site, package, placement, and date window.");
  const pkg = getBoostPackage(parsed.data.packageKey);
  if (!pkg?.active || pkg.targetQualifiedImpressions == null) return jsonError(request, 422, "package_not_found", "Custom packages require an approved server-side quote.");
  try {
    const result = await forecastBoostInventory({
      userId: auth.user.id,
      siteId: parsed.data.siteId,
      placementKey: parsed.data.placementKey,
      categoryId: parsed.data.categoryId,
      startsAt: new Date(parsed.data.startsAt),
      endsAt: new Date(parsed.data.endsAt),
      requestedImpressions: pkg.targetQualifiedImpressions,
    });
    return jsonOk(request, { packageKey: pkg.id, result, requestId: requestId(request) });
  } catch (error) {
    if (error instanceof BoostServiceError) return jsonError(request, error.status, error.code, error.message);
    return jsonError(request, 503, "inventory_forecast_failed", "Inventory estimate is temporarily unavailable.");
  }
}
