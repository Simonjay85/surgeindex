import { getServerEnv } from "@surge/config";
import { requireApiUser } from "../../../../../../lib/server/authorization";
import { assertSameOrigin, jsonError, jsonOk, requestId } from "../../../../../../lib/server/http";
import { StripeServiceError, createBoostCheckout } from "../../../../../../lib/server/stripe-service";
import { checkRateLimit } from "../../../../../../lib/server/rate-limit";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ campaignId: string }> }) {
  const origin = assertSameOrigin(request);
  if (!origin.ok) return origin.response;
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;
  const rate = await checkRateLimit("boost-checkout", auth.user.id, 10, 60 * 60 * 1000);
  if (!rate.allowed) return jsonError(request, 429, "rate_limited", "Checkout creation is temporarily rate-limited.");
  if (getServerEnv().APP_MODE !== "production" || getServerEnv().DATA_PROVIDER !== "postgres") return jsonError(request, 409, "demo_mode", "Stripe Checkout is disabled in demo mode.");
  try {
    const result = await createBoostCheckout({ userId: auth.user.id, campaignId: (await params).campaignId, requestId: requestId(request) });
    return jsonOk(request, result, 201);
  } catch (error) {
    if (error instanceof StripeServiceError) return jsonError(request, error.status, error.code, error.message);
    return jsonError(request, 503, "checkout_unavailable", "Checkout is temporarily unavailable. Your reservation remains subject to its expiry window.");
  }
}
