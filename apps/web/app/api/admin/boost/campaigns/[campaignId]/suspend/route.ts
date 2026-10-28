import { z } from "zod";
import { getServerEnv } from "@surge/config";
import { adminAuditLog, getPostgresDb } from "@surge/db";
import { requireApiAdmin } from "../../../../../../../lib/server/authorization";
import { assertSameOrigin, jsonError, jsonOk, requestId } from "../../../../../../../lib/server/http";
import { BoostServiceError, transitionBoostCampaignForSystem } from "../../../../../../../lib/server/boost-service";

export const runtime = "nodejs";
const bodySchema = z.object({ reason: z.string().min(3).max(500) });

export async function POST(request: Request, { params }: { params: Promise<{ campaignId: string }> }) {
  const origin = assertSameOrigin(request);
  if (!origin.ok) return origin.response;
  const auth = await requireApiAdmin(request);
  if ("response" in auth) return auth.response;
  if (getServerEnv().APP_MODE !== "production" || getServerEnv().DATA_PROVIDER !== "postgres") return jsonError(request, 409, "demo_mode", "Admin Boost mutations are disabled in demo mode.");
  const campaignId = (await params).campaignId;
  const body = bodySchema.safeParse(await request.json().catch(() => null));
  if (!z.string().uuid().safeParse(campaignId).success || !body.success) return jsonError(request, 422, "invalid_payload", "A campaign and suspension reason are required.");
  const id = requestId(request);
  try {
    const campaign = await transitionBoostCampaignForSystem({ campaignId, next: "suspended", reason: body.data.reason, actorUserId: auth.user.id, requestId: id });
    await getPostgresDb().insert(adminAuditLog).values({ actorUserId: auth.user.id, action: "boost_campaign_suspended", targetType: "boost_campaign", targetId: campaignId, newState: { state: "suspended" }, reason: body.data.reason, requestId: id });
    return jsonOk(request, { campaign });
  } catch (error) {
    if (error instanceof BoostServiceError) return jsonError(request, error.status, error.code, error.message);
    return jsonError(request, 409, "suspend_failed", "The campaign could not be suspended in its current state.");
  }
}
