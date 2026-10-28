import { z } from "zod";
import { desc, eq } from "drizzle-orm";
import { getServerEnv } from "@surge/config";
import { boostCampaign, boostCampaignCreative, boostCampaignStateTransition, getPostgresDb, site } from "@surge/db";
import { requireApiUser } from "../../../../../lib/server/authorization";
import { assertSameOrigin, jsonError, jsonOk } from "../../../../../lib/server/http";
import { BoostServiceError, getBoostCampaignReport, getOwnedBoostCampaign } from "../../../../../lib/server/boost-service";
import { getBoostPlacement, sanitizeCreative } from "../../../../../lib/server/boost-config";

export const runtime = "nodejs";

const paramsSchema = z.object({ campaignId: z.string().uuid() });
const patchSchema = z.object({
  headline: z.string().max(240).optional(),
  description: z.string().max(500).optional(),
  ctaLabel: z.string().max(80).optional(),
  destinationUrl: z.string().url().max(2048).optional(),
  logoUrl: z.string().url().max(2048).nullable().optional(),
});

export async function GET(request: Request, { params }: { params: Promise<{ campaignId: string }> }) {
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;
  if (getServerEnv().APP_MODE !== "production" || getServerEnv().DATA_PROVIDER !== "postgres") return jsonOk(request, { isDemo: true, campaign: null, report: null });
  const parsedParams = paramsSchema.safeParse(await params);
  if (!parsedParams.success) return jsonError(request, 422, "invalid_campaign", "The campaign identifier is invalid.");
  try {
    const result = await getBoostCampaignReport(auth.user.id, parsedParams.data.campaignId);
    const transitions = await getPostgresDb().select().from(boostCampaignStateTransition).where(eq(boostCampaignStateTransition.campaignId, parsedParams.data.campaignId)).orderBy(desc(boostCampaignStateTransition.occurredAt));
    return jsonOk(request, { isDemo: false, ...result, transitions });
  } catch (error) {
    if (error instanceof BoostServiceError) return jsonError(request, error.status, error.code, error.message);
    return jsonError(request, 500, "campaign_read_failed", "The campaign report could not be loaded.");
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ campaignId: string }> }) {
  const origin = assertSameOrigin(request);
  if (!origin.ok) return origin.response;
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;
  if (getServerEnv().APP_MODE !== "production" || getServerEnv().DATA_PROVIDER !== "postgres") return jsonError(request, 409, "demo_mode", "Demo campaign creatives are fixture-only.");
  const parsedParams = paramsSchema.safeParse(await params);
  const body = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsedParams.success || !body.success) return jsonError(request, 422, "invalid_payload", "The campaign creative payload is invalid.");
  try {
    const campaign = await getOwnedBoostCampaign(auth.user.id, parsedParams.data.campaignId);
    const [siteRow] = await getPostgresDb().select({ domain: site.domain, logoUrl: site.logoUrl }).from(site).where(eq(site.id, campaign.siteId)).limit(1);
    const placement = getBoostPlacement(campaign.placementKey);
    if (!siteRow || !placement) throw new BoostServiceError("creative_invalid", "The campaign placement or site is no longer available.", 409);
    const creative = sanitizeCreative({ ...body.data, siteDomain: siteRow.domain, logoUrl: body.data.logoUrl ?? siteRow.logoUrl }, placement);
    const nextVersion = campaign.creativeVersion + 1;
    const updated = await getPostgresDb().transaction(async (tx) => {
      await tx.insert(boostCampaignCreative).values({ campaignId: campaign.id, version: nextVersion, state: "pending_review", headline: creative.headline, description: creative.description, ctaLabel: creative.ctaLabel, destinationUrl: creative.destinationUrl, logoUrl: creative.logoUrl });
      const [saved] = await tx.update(boostCampaign).set({ headline: creative.headline, shortDescription: creative.description, ctaLabel: creative.ctaLabel, destinationUrl: creative.destinationUrl, logoUrl: creative.logoUrl, creativeVersion: nextVersion, updatedAt: new Date() }).where(eq(boostCampaign.id, campaign.id)).returning();
      return saved;
    });
    return jsonOk(request, { campaign: updated, moderation: "pending_review" });
  } catch (error) {
    if (error instanceof BoostServiceError) return jsonError(request, error.status, error.code, error.message);
    return jsonError(request, 422, "creative_invalid", "The creative could not be saved for review.");
  }
}
