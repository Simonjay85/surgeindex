import { z } from "zod";
import { getServerEnv } from "@surge/config";
import { requireApiUser } from "../../../lib/server/authorization";
import { assertSameOrigin, jsonError, jsonOk } from "../../../lib/server/http";
import { ClaimServiceError, startOwnershipClaim } from "../../../lib/server/claim-service";
import { checkRateLimit } from "../../../lib/server/rate-limit";
import { verifyTurnstile } from "../../../lib/server/turnstile";

export const runtime = "nodejs";

const claimSchema = z.object({
  siteId: z.string().uuid(),
  method: z.enum(["meta_tag", "dns_txt"]),
  turnstileToken: z.string().trim().max(2_048).optional(),
});

export async function POST(request: Request) {
  const origin = assertSameOrigin(request);
  if (!origin.ok) return origin.response;
  if (getServerEnv().DATA_PROVIDER !== "postgres") return jsonError(request, 409, "demo_mode", "Ownership claims are disabled in demo mode.");
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;
  const rate = await checkRateLimit("claim-start", auth.user.id, 10, 60 * 60 * 1000);
  if (!rate.allowed) return jsonError(request, 429, "rate_limited", `Too many claim challenges. Try again in ${rate.retryAfterSeconds} seconds.`);
  const parsed = claimSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError(request, 422, "invalid_payload", "Choose a valid site and verification method.");
  const turnstile = await verifyTurnstile(request, parsed.data.turnstileToken, "claim-start");
  if (!turnstile.ok) return jsonError(request, turnstile.code === "turnstile_configuration" ? 503 : 422, turnstile.code, "The anti-bot check could not be completed.");
  try {
    const claimInput = { siteId: parsed.data.siteId, method: parsed.data.method };
    const result = await startOwnershipClaim({ ...claimInput, userId: auth.user.id });
    return jsonOk(request, result, 201);
  } catch (error) {
    if (error instanceof ClaimServiceError) return jsonError(request, error.code === "ownership_conflict" ? 409 : 422, error.code, error.message);
    return jsonError(request, 500, "claim_start_failed", "The verification challenge could not be created.");
  }
}
