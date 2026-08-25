import { z } from "zod";
import { getServerEnv } from "@surge/config";
import { getLeaderboard } from "../../../lib/demo-data";
import { safeDomain } from "../../../lib/utils";
import { requireApiUser } from "../../../lib/server/authorization";
import { assertSameOrigin, jsonError, jsonOk, requestId } from "../../../lib/server/http";
import { SiteServiceError, submitSiteForUser } from "../../../lib/server/site-service";
import { checkRateLimit } from "../../../lib/server/rate-limit";
import { verifyTurnstile } from "../../../lib/server/turnstile";

export const runtime = "nodejs";

const submitSchema = z.object({
  url: z.string().trim().min(1).max(2_048),
  category: z.string().trim().min(1).max(80),
  title: z.string().trim().max(160).optional(),
  description: z.string().trim().max(320).optional(),
  turnstileToken: z.string().trim().max(2_048).optional(),
});

export async function POST(request: Request) {
  const origin = assertSameOrigin(request);
  if (!origin.ok) return origin.response;
  const parsed = submitSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError(request, 422, "invalid_payload", "Enter a valid website URL and category.");
  const domain = safeDomain(parsed.data.url);
  if (!domain) return jsonError(request, 422, "invalid_domain", "Only public HTTP or HTTPS domains are accepted.");
  const env = getServerEnv();
  const turnstile = await verifyTurnstile(request, parsed.data.turnstileToken, "site-submit");
  if (!turnstile.ok) return jsonError(request, turnstile.code === "turnstile_configuration" ? 503 : 422, turnstile.code, "The anti-bot check could not be completed.");
  if (env.DATA_PROVIDER === "demo") {
    const existing = getLeaderboard("live").some((site) => site.domain === domain);
    return jsonOk(request, { domain, category: parsed.data.category, duplicate: existing, status: "pending_review", isDemo: true, source: "demo" }, 201);
  }
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;
  const rate = await checkRateLimit("site-submit", auth.user.id, 10, 60 * 60 * 1000);
  if (!rate.allowed) return jsonError(request, 429, "rate_limited", `Too many submissions. Try again in ${rate.retryAfterSeconds} seconds.`);
  try {
    const result = await submitSiteForUser({
      userId: auth.user.id,
      url: parsed.data.url,
      categorySlug: parsed.data.category,
      title: parsed.data.title,
      description: parsed.data.description,
      requestId: requestId(request),
    });
    return jsonOk(request, result, 201);
  } catch (error) {
    if (error instanceof SiteServiceError) {
      const status = error.code === "duplicate_domain" ? 409 : error.code === "category_not_found" || error.code === "invalid_domain" ? 422 : 502;
      return jsonError(request, status, error.code, error.message);
    }
    return jsonError(request, 500, "submission_failed", "The submission could not be saved.");
  }
}
