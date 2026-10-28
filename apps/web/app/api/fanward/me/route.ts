import { z } from "zod";
import { getServerEnv } from "@surge/config";
import { requireVerifiedApiUser } from "../../../../lib/server/authorization";
import {
  FanwardServiceError,
  getFanwardOwnerWorkspace,
  saveFanwardOwnerDraft,
} from "../../../../lib/server/fanward-service";
import { assertSameOrigin, jsonError, jsonOk } from "../../../../lib/server/http";
import { checkRateLimit } from "../../../../lib/server/rate-limit";

export const runtime = "nodejs";

const saveSchema = z.object({
  primarySiteId: z.string().uuid(),
  displayName: z.string().trim().min(2).max(80),
  headline: z.string().trim().min(8).max(160),
  bio: z.string().trim().min(40).max(2_000),
  categoryId: z.string().uuid(),
  expectedUpdatedAt: z.string().datetime({ offset: true }).optional(),
}).strict();

function ownerError(request: Request, error: unknown) {
  if (!(error instanceof FanwardServiceError)) return jsonError(request, 500, "fanward_owner_failed", "The Fanward workspace could not be updated.");
  if (error.code === "feature_disabled") return jsonError(request, 409, error.code, "Fanward is currently disabled.");
  if (error.code === "data_provider_unavailable") return jsonError(request, 503, error.code, error.message);
  if (error.code === "site_owner_required") return jsonError(request, 403, error.code, error.message);
  if (["edit_conflict", "pending_exists", "profile_conflict", "primary_site_locked", "profile_suspended", "site_already_linked"].includes(error.code)) {
    return jsonError(request, 409, error.code, error.message);
  }
  if (error.code === "profile_not_found" || error.code === "draft_not_found") return jsonError(request, 404, error.code, error.message);
  return jsonError(request, 422, error.code, error.message);
}

export async function GET(request: Request) {
  if (!getServerEnv().FEATURE_CREATORS) return jsonError(request, 409, "feature_disabled", "Fanward is currently disabled.");
  const auth = await requireVerifiedApiUser(request);
  if ("response" in auth) return auth.response;
  const rate = await checkRateLimit("fanward-owner-read", auth.user.id, 180, 60 * 60 * 1000);
  if (!rate.allowed) return jsonError(request, 429, "rate_limited", `Too many workspace requests. Try again in ${rate.retryAfterSeconds} seconds.`);
  try {
    return jsonOk(request, await getFanwardOwnerWorkspace(auth.user.id), 200, { "Cache-Control": "private, no-store" });
  } catch (error) {
    return ownerError(request, error);
  }
}

export async function PATCH(request: Request) {
  const origin = assertSameOrigin(request);
  if (!origin.ok) return origin.response;
  if (!getServerEnv().FEATURE_CREATORS) return jsonError(request, 409, "feature_disabled", "Fanward is currently disabled.");
  const auth = await requireVerifiedApiUser(request);
  if ("response" in auth) return auth.response;
  const rate = await checkRateLimit("fanward-owner-save", auth.user.id, 30, 60 * 60 * 1000);
  if (!rate.allowed) return jsonError(request, 429, "rate_limited", `Too many draft saves. Try again in ${rate.retryAfterSeconds} seconds.`);
  const parsed = saveSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError(request, 422, "invalid_payload", "Review the Fanward draft fields and try again.");
  try {
    return jsonOk(request, await saveFanwardOwnerDraft(auth.user.id, parsed.data), 200, { "Cache-Control": "private, no-store" });
  } catch (error) {
    return ownerError(request, error);
  }
}
