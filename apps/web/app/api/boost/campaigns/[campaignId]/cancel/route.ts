import { getServerEnv } from "@surge/config";
import { requireApiUser } from "../../../../../../lib/server/authorization";
import { assertSameOrigin, jsonError, jsonOk, requestId } from "../../../../../../lib/server/http";
import { BoostServiceError, getOwnedBoostCampaign, releaseBoostReservation, transitionOwnedBoostCampaign } from "../../../../../../lib/server/boost-service";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ campaignId: string }> }) {
  const origin = assertSameOrigin(request);
  if (!origin.ok) return origin.response;
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;
  if (getServerEnv().APP_MODE !== "production" || getServerEnv().DATA_PROVIDER !== "postgres") return jsonError(request, 409, "demo_mode", "Demo campaigns are fixture-only.");
  const campaignId = (await params).campaignId;
  try {
    const campaign = await getOwnedBoostCampaign(auth.user.id, campaignId);
    if (["draft", "inventory_reserved", "pending_payment", "payment_processing", "payment_failed", "checkout_expired"].includes(campaign.state)) {
      await releaseBoostReservation({ campaignId, reason: "Owner cancelled before delivery; reservation released.", requestId: requestId(request), nextState: "draft" });
    }
    const next = ["paid", "paid_pending_inventory_review", "scheduled", "active", "paused"].includes(campaign.state) ? "cancel_requested" : "cancelled";
    const updated = await transitionOwnedBoostCampaign({ userId: auth.user.id, campaignId, next, reason: "Owner requested campaign cancellation; refund policy review may apply.", requestId: requestId(request) });
    return jsonOk(request, { campaign: updated, refund: "policy_review_required" });
  } catch (error) {
    if (error instanceof BoostServiceError) return jsonError(request, error.status, error.code, error.message);
    return jsonError(request, 409, "cancel_failed", "The campaign could not be cancelled in its current state.");
  }
}
