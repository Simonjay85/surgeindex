import { getServerEnv } from "@surge/config";
import { requireApiUser } from "../../../../../../lib/server/authorization";
import { assertSameOrigin, jsonError, jsonOk, requestId } from "../../../../../../lib/server/http";
import { BoostServiceError, reserveBoostInventory } from "../../../../../../lib/server/boost-service";
import { checkRateLimit } from "../../../../../../lib/server/rate-limit";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ campaignId: string }> }) {
  const origin = assertSameOrigin(request);
  if (!origin.ok) return origin.response;
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;
  const rate = checkRateLimit("boost-reserve", auth.user.id, 20, 60 * 60 * 1000);
  if (!rate.allowed) return jsonError(request, 429, "rate_limited", "Inventory reservation is temporarily rate-limited.");
  if (getServerEnv().APP_MODE !== "production" || getServerEnv().DATA_PROVIDER !== "postgres") return jsonError(request, 409, "demo_mode", "Demo delivery does not create production reservations.");
  try {
    const reservation = await reserveBoostInventory({ userId: auth.user.id, campaignId: (await params).campaignId, requestId: requestId(request) });
    return jsonOk(request, { reservation }, 201);
  } catch (error) {
    if (error instanceof BoostServiceError) return jsonError(request, error.status, error.code, error.message);
    return jsonError(request, 503, "reservation_failed", "Inventory could not be reserved safely.");
  }
}
