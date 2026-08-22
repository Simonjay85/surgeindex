import { z } from "zod";
import { getServerEnv } from "@surge/config";
import { requireApiUser } from "../../../../../lib/server/authorization";
import { assertSameOrigin, jsonError, jsonOk } from "../../../../../lib/server/http";
import { ClaimServiceError, verifyOwnershipClaim } from "../../../../../lib/server/claim-service";
import { checkRateLimit } from "../../../../../lib/server/rate-limit";

export const runtime = "nodejs";

const paramsSchema = z.object({ claimId: z.string().uuid() });

export async function POST(request: Request, { params }: { params: Promise<{ claimId: string }> }) {
  const origin = assertSameOrigin(request);
  if (!origin.ok) return origin.response;
  if (getServerEnv().DATA_PROVIDER !== "postgres") return jsonError(request, 409, "demo_mode", "Ownership claims are disabled in demo mode.");
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;
  const rate = checkRateLimit("claim-verify", auth.user.id, 30, 60 * 60 * 1000);
  if (!rate.allowed) return jsonError(request, 429, "rate_limited", `Too many verification attempts. Try again in ${rate.retryAfterSeconds} seconds.`);
  const parsed = paramsSchema.safeParse(await params);
  if (!parsed.success) return jsonError(request, 422, "invalid_claim", "Verification challenge was not found.");
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
