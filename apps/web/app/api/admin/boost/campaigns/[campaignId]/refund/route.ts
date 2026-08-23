import { z } from "zod";
import { getServerEnv } from "@surge/config";
import { requireApiAdmin } from "../../../../../../../lib/server/authorization";
import { assertSameOrigin, jsonError, jsonOk, requestId } from "../../../../../../../lib/server/http";
import { StripeServiceError, requestBoostRefund } from "../../../../../../../lib/server/stripe-service";

export const runtime = "nodejs";
const bodySchema = z.object({ orderId: z.string().uuid(), amountCents: z.number().int().positive(), reason: z.string().min(3).max(500) });

export async function POST(request: Request, { params }: { params: Promise<{ campaignId: string }> }) {
  const origin = assertSameOrigin(request);
  if (!origin.ok) return origin.response;
  const auth = await requireApiAdmin(request);
  if ("response" in auth) return auth.response;
  if (getServerEnv().APP_MODE !== "production" || getServerEnv().DATA_PROVIDER !== "postgres") return jsonError(request, 409, "demo_mode", "Stripe refunds are disabled in demo mode.");
  const campaignId = (await params).campaignId;
  const body = bodySchema.safeParse(await request.json().catch(() => null));
  if (!z.string().uuid().safeParse(campaignId).success || !body.success) return jsonError(request, 422, "invalid_payload", "The campaign, refund order, amount, and reason are invalid.");
  try {
    return jsonOk(request, await requestBoostRefund({ ...body.data, campaignId, adminUserId: auth.user.id, requestId: requestId(request) }), 201);
  } catch (error) {
    if (error instanceof StripeServiceError) return jsonError(request, error.status, error.code, error.message);
    return jsonError(request, 503, "refund_failed", "The refund could not be requested.");
  }
}
