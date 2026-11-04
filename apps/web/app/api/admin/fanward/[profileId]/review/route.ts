import { z } from "zod";
import { getServerEnv } from "@surge/config";
import { requireApiAdmin } from "../../../../../../lib/server/authorization";
import { FanwardServiceError, reviewFanwardProfile } from "../../../../../../lib/server/fanward-service";
import { assertSameOrigin, jsonError, jsonOk, requestId } from "../../../../../../lib/server/http";
import { checkRateLimit } from "../../../../../../lib/server/rate-limit";

export const runtime = "nodejs";

const paramsSchema = z.object({ profileId: z.string().uuid() });
const reviewSchema = z.object({
  action: z.enum(["approve", "reject", "suspend", "restore"]),
  revisionId: z.string().uuid().optional(),
  reason: z.string().trim().min(3).max(500),
  confirm: z.literal(true),
}).strict().superRefine((value, context) => {
  if ((value.action === "approve" || value.action === "reject") && !value.revisionId) {
    context.addIssue({ code: "custom", path: ["revisionId"], message: "A pending revision is required for this action." });
  }
});

export async function POST(request: Request, { params }: { params: Promise<{ profileId: string }> }) {
  const origin = assertSameOrigin(request);
  if (!origin.ok) return origin.response;
  if (!getServerEnv().FEATURE_CREATORS) return jsonError(request, 409, "feature_disabled", "Fanward is currently disabled.");
  const auth = await requireApiAdmin(request);
  if ("response" in auth) return auth.response;
  const rate = await checkRateLimit("fanward-admin-review", auth.user.id, 120, 60 * 60 * 1000);
  if (!rate.allowed) return jsonError(request, 429, "rate_limited", `Too many moderation actions. Try again in ${rate.retryAfterSeconds} seconds.`);
  const [parsedParams, parsed] = await Promise.all([
    paramsSchema.safeParseAsync(await params),
    request.json().catch(() => null).then((body) => reviewSchema.safeParseAsync(body)),
  ]);
  if (!parsedParams.success || !parsed.success) return jsonError(request, 422, "invalid_payload", "A valid profile, explicit confirmation, action, revision, and reason are required.");
  try {
    const result = await reviewFanwardProfile(auth.user.id, parsedParams.data.profileId, {
      action: parsed.data.action,
      revisionId: parsed.data.revisionId,
      reason: parsed.data.reason,
      requestId: requestId(request),
    });
    return jsonOk(request, result);
  } catch (error) {
    if (error instanceof FanwardServiceError) {
      if (error.code === "feature_disabled") return jsonError(request, 409, error.code, "Fanward is currently disabled.");
      if (error.code === "data_provider_unavailable") return jsonError(request, 503, error.code, error.message);
      if (error.code === "target_not_found") return jsonError(request, 404, error.code, error.message);
      if (error.code === "invalid_transition" || ["site_not_active", "site_not_claimed", "traffic_not_verified", "demo_site", "site_already_linked"].includes(error.code)) {
        return jsonError(request, 409, error.code, error.message);
      }
      if (error.code === "site_owner_required") return jsonError(request, 409, error.code, error.message);
      return jsonError(request, 422, error.code, error.message);
    }
    return jsonError(request, 500, "fanward_review_failed", "The Fanward review action could not be saved.");
  }
}
