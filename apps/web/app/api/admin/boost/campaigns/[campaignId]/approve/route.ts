import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { getServerEnv } from "@surge/config";
import { adminAuditLog, boostCampaign, boostCampaignCreative, getPostgresDb } from "@surge/db";
import { requireApiAdmin } from "../../../../../../../lib/server/authorization";
import { assertSameOrigin, jsonError, jsonOk, requestId } from "../../../../../../../lib/server/http";
import { BoostServiceError, transitionCampaignTx } from "../../../../../../../lib/server/boost-service";

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
  if (!z.string().uuid().safeParse(campaignId).success || !body.success) return jsonError(request, 422, "invalid_payload", "A campaign and moderation reason are required.");
  const id = requestId(request);
  try {
    const campaign = await getPostgresDb().transaction(async (tx) => {
      const [current] = await tx.select().from(boostCampaign).where(eq(boostCampaign.id, campaignId)).limit(1);
      if (!current) throw new BoostServiceError("campaign_not_found", "The campaign was not found.", 404);
      const [creative] = await tx.select().from(boostCampaignCreative).where(and(eq(boostCampaignCreative.campaignId, campaignId), eq(boostCampaignCreative.version, current.creativeVersion))).limit(1);
      if (!creative) throw new BoostServiceError("creative_invalid", "The campaign creative was not found.", 404);
      await tx.update(boostCampaignCreative).set({ state: "approved", approvedByUserId: auth.user.id, approvedAt: new Date(), moderationReason: body.data.reason, updatedAt: new Date() }).where(eq(boostCampaignCreative.id, creative.id));
      await tx.update(boostCampaign).set({ headline: creative.headline, shortDescription: creative.description, ctaLabel: creative.ctaLabel, destinationUrl: creative.destinationUrl, logoUrl: creative.logoUrl, updatedAt: new Date() }).where(eq(boostCampaign.id, campaignId));
      const freshState = current.state === "paid" && current.startAt && current.startAt <= new Date() ? "active" : current.state === "paid" ? "scheduled" : null;
      if (freshState) await transitionCampaignTx(tx, campaignId, freshState, "Admin approved the creative after payment confirmation.", auth.user.id, id);
      await tx.insert(adminAuditLog).values({ actorUserId: auth.user.id, action: "boost_creative_approved", targetType: "boost_campaign", targetId: campaignId, previousState: { creative: creative.state }, newState: { creative: "approved" }, reason: body.data.reason, requestId: id });
      const [saved] = await tx.select().from(boostCampaign).where(eq(boostCampaign.id, campaignId)).limit(1);
      return saved;
    });
    return jsonOk(request, { campaign });
  } catch (error) {
    if (error instanceof BoostServiceError) return jsonError(request, error.status, error.code, error.message);
    return jsonError(request, 500, "moderation_failed", "The creative approval could not be recorded.");
  }
}
