import { z } from "zod";
import { getServerEnv } from "@surge/config";
import { getPostgresDb, listAuditLog, listCategories, listClaimReviews, listPendingSites, moderateSite, updateSiteCategory } from "@surge/db";
import { requireApiAdmin } from "../../../../lib/server/authorization";
import { assertSameOrigin, jsonError, jsonOk, requestId } from "../../../../lib/server/http";
import { checkRateLimit } from "../../../../lib/server/rate-limit";

export const runtime = "nodejs";

const mutationSchema = z.object({
  action: z.enum(["approve", "reject", "suspend", "restore", "category_changed"]),
  siteId: z.string().uuid(),
  categoryId: z.string().uuid().optional(),
  reason: z.string().trim().min(3).max(500),
  confirm: z.boolean().optional(),
});

export async function GET(request: Request) {
  if (getServerEnv().DATA_PROVIDER !== "postgres") return jsonOk(request, { pending: [], audit: [], source: "demo" });
  const auth = await requireApiAdmin(request);
  if ("response" in auth) return auth.response;
  const rate = checkRateLimit("admin-moderation", auth.user.id, 120, 60 * 60 * 1000);
  if (!rate.allowed) return jsonError(request, 429, "rate_limited", `Too many moderation actions. Try again in ${rate.retryAfterSeconds} seconds.`);
  const query = new URL(request.url).searchParams.get("q")?.trim().slice(0, 80);
  const db = getPostgresDb();
  const [pending, audit, claimReviews, categories] = await Promise.all([
    listPendingSites(db, 100, query || undefined),
    listAuditLog(db),
    listClaimReviews(db),
    listCategories(db),
  ]);
  return jsonOk(request, { pending, audit, claimReviews, categories, source: "postgres" });
}

export async function POST(request: Request) {
  const origin = assertSameOrigin(request);
  if (!origin.ok) return origin.response;
  if (getServerEnv().DATA_PROVIDER !== "postgres") return jsonError(request, 409, "demo_mode", "Moderation mutations are disabled in demo mode.");
  const auth = await requireApiAdmin(request);
  if ("response" in auth) return auth.response;
  const parsed = mutationSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError(request, 422, "invalid_payload", "A valid moderation action, target, and reason are required.");
  if (["reject", "suspend"].includes(parsed.data.action) && parsed.data.confirm !== true) return jsonError(request, 409, "confirmation_required", "This destructive action requires confirmation.");
  try {
    const db = getPostgresDb();
    const result = parsed.data.action === "category_changed"
      ? parsed.data.categoryId ? await updateSiteCategory(db, { siteId: parsed.data.siteId, categoryId: parsed.data.categoryId, adminUserId: auth.user.id, reason: parsed.data.reason, requestId: requestId(request) }) : false
      : await moderateSite(db, { siteId: parsed.data.siteId, adminUserId: auth.user.id, action: parsed.data.action, reason: parsed.data.reason, requestId: requestId(request) });
    if (!result) return jsonError(request, 404, "target_not_found", "The moderation target was not found.");
    return jsonOk(request, { updated: true }, 200);
  } catch {
    return jsonError(request, 500, "moderation_failed", "The moderation action could not be saved.");
  }
}
