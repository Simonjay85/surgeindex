import { z } from "zod";
import { getServerEnv } from "@surge/config";
import { requireVerifiedApiUser } from "../../../../../lib/server/authorization";
import { FanwardServiceError, submitFanwardOwnerDraft } from "../../../../../lib/server/fanward-service";
import { assertSameOrigin, jsonError, jsonOk } from "../../../../../lib/server/http";
import { checkRateLimit } from "../../../../../lib/server/rate-limit";
import { verifyTurnstile } from "../../../../../lib/server/turnstile";

export const runtime = "nodejs";

const submitSchema = z.object({
  expectedUpdatedAt: z.string().datetime({ offset: true }),
  turnstileToken: z.string().trim().max(2_048).optional(),
}).strict();

export async function POST(request: Request) {
  const origin = assertSameOrigin(request);
  if (!origin.ok) return origin.response;
  if (!getServerEnv().FEATURE_CREATORS) return jsonError(request, 409, "feature_disabled", "Fanward is currently disabled.");
  const auth = await requireVerifiedApiUser(request);
  if ("response" in auth) return auth.response;
  const rate = await checkRateLimit("fanward-owner-submit", auth.user.id, 5, 24 * 60 * 60 * 1000);
  if (!rate.allowed) return jsonError(request, 429, "rate_limited", `Too many review submissions. Try again in ${rate.retryAfterSeconds} seconds.`);
  const parsed = submitSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError(request, 422, "invalid_payload", "A current saved draft version is required.");
  const turnstile = await verifyTurnstile(request, parsed.data.turnstileToken, "fanward-submit");
  if (!turnstile.ok) return jsonError(request, turnstile.code === "turnstile_configuration" ? 503 : 422, turnstile.code, "The anti-bot check could not be completed.");
  try {
    const workspace = await submitFanwardOwnerDraft(auth.user.id, { expectedUpdatedAt: parsed.data.expectedUpdatedAt });
    return jsonOk(request, workspace, 200, { "Cache-Control": "private, no-store" });
  } catch (error) {
    if (error instanceof FanwardServiceError) {
      if (error.code === "feature_disabled") return jsonError(request, 409, error.code, "Fanward is currently disabled.");
      if (error.code === "data_provider_unavailable") return jsonError(request, 503, error.code, error.message);
      if (error.code === "site_owner_required") return jsonError(request, 403, error.code, error.message);
      if (["edit_conflict", "pending_exists", "profile_suspended"].includes(error.code)) return jsonError(request, 409, error.code, error.message);
      if (error.code === "profile_not_found" || error.code === "draft_not_found") return jsonError(request, 404, error.code, error.message);
      return jsonError(request, 422, error.code, error.message);
    }
    return jsonError(request, 500, "fanward_submit_failed", "The Fanward profile could not be submitted.");
  }
}
