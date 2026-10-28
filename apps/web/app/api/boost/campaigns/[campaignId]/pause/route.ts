import { getServerEnv } from "@surge/config";
import { requireApiUser } from "../../../../../../lib/server/authorization";
import { assertSameOrigin, jsonError, jsonOk, requestId } from "../../../../../../lib/server/http";
import { BoostServiceError, transitionOwnedBoostCampaign } from "../../../../../../lib/server/boost-service";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ campaignId: string }> }) {
  const origin = assertSameOrigin(request);
  if (!origin.ok) return origin.response;
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;
  if (getServerEnv().APP_MODE !== "production" || getServerEnv().DATA_PROVIDER !== "postgres") return jsonError(request, 409, "demo_mode", "Demo campaigns are fixture-only.");
  try {
    const campaign = await transitionOwnedBoostCampaign({ userId: auth.user.id, campaignId: (await params).campaignId, next: "paused", reason: "Owner paused the Boost campaign.", requestId: requestId(request) });
    return jsonOk(request, { campaign });
  } catch (error) {
    if (error instanceof BoostServiceError) return jsonError(request, error.status, error.code, error.message);
    return jsonError(request, 409, "pause_failed", "The campaign could not be paused in its current state.");
  }
}
