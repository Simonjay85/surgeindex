import { z } from "zod";
import { eq } from "drizzle-orm";
import { getServerEnv } from "@surge/config";
import { adminAuditLog, boostCampaign, getPostgresDb } from "@surge/db";
import { requireApiAdmin } from "../../../../../../../lib/server/authorization";
import { assertSameOrigin, jsonError, jsonOk, requestId } from "../../../../../../../lib/server/http";

export const runtime = "nodejs";
const bodySchema = z.object({ days: z.number().int().min(1).max(90), reason: z.string().min(3).max(500) });

export async function POST(request: Request, { params }: { params: Promise<{ campaignId: string }> }) {
  const origin = assertSameOrigin(request);
  if (!origin.ok) return origin.response;
  const auth = await requireApiAdmin(request);
  if ("response" in auth) return auth.response;
  if (getServerEnv().APP_MODE !== "production" || getServerEnv().DATA_PROVIDER !== "postgres") return jsonError(request, 409, "demo_mode", "Admin Boost mutations are disabled in demo mode.");
  const campaignId = (await params).campaignId;
  const body = bodySchema.safeParse(await request.json().catch(() => null));
  if (!z.string().uuid().safeParse(campaignId).success || !body.success) return jsonError(request, 422, "invalid_payload", "A campaign, extension days, and reason are required.");
  const id = requestId(request);
  const result = await getPostgresDb().transaction(async (tx) => {
    const [current] = await tx.select().from(boostCampaign).where(eq(boostCampaign.id, campaignId)).limit(1);
    if (!current?.endAt) throw new Error("campaign_not_found");
    const endAt = new Date(current.endAt.getTime() + body.data.days * 24 * 60 * 60 * 1000);
    const [campaign] = await tx.update(boostCampaign).set({ endAt, updatedAt: new Date() }).where(eq(boostCampaign.id, campaignId)).returning();
    await tx.insert(adminAuditLog).values({ actorUserId: auth.user.id, action: "boost_campaign_extended", targetType: "boost_campaign", targetId: campaignId, previousState: { endAt: current.endAt.toISOString() }, newState: { endAt: endAt.toISOString() }, reason: body.data.reason, requestId: id });
    return campaign;
  }).catch(() => null);
  if (!result) return jsonError(request, 404, "campaign_not_found", "The campaign could not be extended.");
  return jsonOk(request, { campaign: result });
}
