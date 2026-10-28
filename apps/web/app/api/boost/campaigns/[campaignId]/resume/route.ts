import { getServerEnv } from "@surge/config";
import { requireApiUser } from "../../../../../../lib/server/authorization";
import { assertSameOrigin, jsonError, jsonOk, requestId } from "../../../../../../lib/server/http";
import { BoostServiceError, getOwnedBoostCampaign, transitionOwnedBoostCampaign } from "../../../../../../lib/server/boost-service";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ campaignId: string }> }) {
  const origin = assertSameOrigin(request);
  if (!origin.ok) return origin.response;
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;
  if (getServerEnv().APP_MODE !== "production" || getServerEnv().DATA_PROVIDER !== "postgres") return jsonError(request, 409, "demo_mode", "Demo campaigns are fixture-only.");
  try {
    const campaign = await getOwnedBoostCampaign(auth.user.id, (await params).campaignId);
    const next = campaign.startAt && campaign.startAt <= new Date() ? "active" : "scheduled";
    const resumed = await transitionOwnedBoostCampaign({ userId: auth.user.id, campaignId: campaign.id, next, reason: "Owner resumed the Boost campaign.", requestId: requestId(request) });
    return jsonOk(request, { campaign: resumed });
  } catch (error) {
    if (error instanceof BoostServiceError) return jsonError(request, error.status, error.code, error.message);
    return jsonError(request, 409, "resume_failed", "The campaign could not be resumed in its current state.");
  }
}
