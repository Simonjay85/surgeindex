import { z } from "zod";
import { getServerEnv } from "@surge/config";
import { requireApiUser } from "../../../../../lib/server/authorization";
import { assertSameOrigin, jsonError, jsonOk } from "../../../../../lib/server/http";
import { ClaimServiceError, verifyOwnershipClaim } from "../../../../../lib/server/claim-service";
import { checkRateLimit } from "../../../../../lib/server/rate-limit";
import { verifyTurnstile } from "../../../../../lib/server/turnstile";

export const runtime = "nodejs";

const paramsSchema = z.object({ claimId: z.string().uuid() });
const verifySchema = z.object({ turnstileToken: z.string().trim().max(2_048).optional() }).strict();

export async function POST(request: Request, { params }: { params: Promise<{ claimId: string }> }) {
  const origin = assertSameOrigin(request);
  if (!origin.ok) return origin.response;
  if (getServerEnv().DATA_PROVIDER !== "postgres") return jsonError(request, 409, "demo_mode", "Ownership claims are disabled in demo mode.");
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;
  const rate = await checkRateLimit("claim-verify", auth.user.id, 30, 60 * 60 * 1000);
  if (!rate.allowed) return jsonError(request, 429, "rate_limited", `Too many verification attempts. Try again in ${rate.retryAfterSeconds} seconds.`);
  const parsed = paramsSchema.safeParse(await params);
  if (!parsed.success) return jsonError(request, 422, "invalid_claim", "Verification challenge was not found.");
  const body = verifySchema.safeParse(await request.json().catch(() => ({})));
  if (!body.success) return jsonError(request, 422, "invalid_payload", "The verification request was invalid.");
  const turnstile = await verifyTurnstile(request, body.data.turnstileToken, "claim-verify");
  if (!turnstile.ok) return jsonError(request, turnstile.code === "turnstile_configuration" ? 503 : 422, turnstile.code, "The anti-bot check could not be completed.");
  try {
    const result = await verifyOwnershipClaim({ claimId: parsed.data.claimId, userId: auth.user.id });
    return jsonOk(request, result);
  } catch (error) {
    if (error instanceof ClaimServiceError) {
      const status = error.code === "claim_not_found" ? 404 : error.code === "ownership_conflict" ? 409 : 422;
      return jsonError(request, status, error.code, error.message);
    }
    return jsonError(request, 500, "claim_verify_failed", "The verification could not be completed.");
  }
}
