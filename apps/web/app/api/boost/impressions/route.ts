import { z } from "zod";
import { eq } from "drizzle-orm";
import { getServerEnv } from "@surge/config";
import { boostCampaign, getPostgresDb } from "@surge/db";
import { getCurrentUser } from "../../../../lib/server/auth";
import { assertSameOrigin, jsonError, jsonOk, requestId } from "../../../../lib/server/http";
import { anonymousVisitorHash } from "../../../../lib/server/boost-tokens";
import { checkRateLimit } from "../../../../lib/server/rate-limit";
import { parseServedImpressionToken, qualifyBoostImpression, BoostServiceError } from "../../../../lib/server/boost-service";

export const runtime = "nodejs";

const bodySchema = z.object({
  token: z.string().min(20).max(4096),
  eventId: z.string().min(8).max(128).regex(/^[A-Za-z0-9._:-]+$/),
  visiblePercent: z.number().min(0).max(100),
  visibleMilliseconds: z.number().int().min(0).max(600_000),
});

export async function POST(request: Request) {
  const origin = assertSameOrigin(request);
  if (!origin.ok) return origin.response;
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError(request, 422, "invalid_payload", "The impression event is invalid.");
  const payload = parseServedImpressionToken(parsed.data.token);
  if (!payload) return jsonError(request, 422, "token_invalid", "The impression opportunity is invalid or expired.");
  const visitorHash = anonymousVisitorHash(request, getServerEnv().APP_MODE === "demo" ? "public" : payload.siteId);
  const rate = await checkRateLimit("boost-impression", visitorHash, 180, 60 * 1000);
  if (!rate.allowed) return jsonError(request, 429, "rate_limited", "Impression qualification is temporarily rate-limited.");
  if (visitorHash !== payload.visitorContextHash) return jsonError(request, 422, "token_context_mismatch", "The impression opportunity does not match this visitor.");
  if (getServerEnv().APP_MODE === "demo") {
    const qualified = parsed.data.visiblePercent >= 50 && parsed.data.visibleMilliseconds >= 1_000;
    return jsonOk(request, { isDemo: true, classification: qualified ? "qualified" : "viewability_failed", note: "Demo delivery is labeled and is not billable." });
  }
  let isOwner = false;
  if (getServerEnv().APP_MODE === "production" && getServerEnv().DATA_PROVIDER === "postgres") {
    const current = await getCurrentUser(request);
    if (current) {
      const [campaign] = await getPostgresDb().select({ ownerId: boostCampaign.ownerId }).from(boostCampaign).where(eq(boostCampaign.id, payload.campaignId)).limit(1);
      isOwner = campaign?.ownerId === current.id;
    }
  }
  try {
    const result = await qualifyBoostImpression({ ...parsed.data, visitorContextHash: payload.visitorContextHash, requestId: requestId(request), isOwner });
    return jsonOk(request, result);
  } catch (error) {
    if (error instanceof BoostServiceError) return jsonError(request, error.status, error.code, error.message);
    return jsonError(request, 503, "impression_record_failed", "The impression could not be recorded.");
  }
}
