import { z } from "zod";
import { getServerEnv } from "@surge/config";
import { requireApiUser } from "../../../../../../lib/server/authorization";
import { assertSameOrigin, jsonError, jsonOk } from "../../../../../../lib/server/http";
import { checkRateLimit } from "../../../../../../lib/server/rate-limit";
import { Ga4ServiceError, startGa4OAuth } from "../../../../../../lib/server/ga4-service";

export const runtime = "nodejs";

const paramsSchema = z.object({ slug: z.string().uuid() });
const bodySchema = z.object({ returnPath: z.string().optional() }).default({});

export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const origin = assertSameOrigin(request);
  if (!origin.ok) return origin.response;
  if (getServerEnv().APP_MODE !== "production" || getServerEnv().DATA_PROVIDER !== "postgres") return jsonError(request, 409, "demo_mode", "GA4 OAuth is disabled in demo mode; use the deterministic fixture test environment.");
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;
  const parsedParams = paramsSchema.safeParse(await params);
  if (!parsedParams.success) return jsonError(request, 422, "invalid_site", "The site identifier is invalid.");
  const body = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!body.success) return jsonError(request, 422, "invalid_payload", "The return path is invalid.");
  const rate = checkRateLimit("ga4-oauth-start", `${auth.user.id}:${parsedParams.data.slug}`, 10, 60 * 60 * 1000);
  if (!rate.allowed) return jsonError(request, 429, "rate_limited", "Google Analytics connection attempts are temporarily rate-limited.");
  try { return jsonOk(request, await startGa4OAuth({ userId: auth.user.id, siteId: parsedParams.data.slug, returnPath: body.data.returnPath }), 201); }
  catch (error) { return handleError(request, error); }
}

function handleError(request: Request, error: unknown) {
  if (error instanceof Ga4ServiceError) return jsonError(request, error.status, error.code, error.message);
  console.error(JSON.stringify({ component: "ga4-oauth", event: "start_failed", errorClass: error instanceof Error ? error.name : "unknown" }));
  return jsonError(request, 500, "ga4_oauth_failed", "Google Analytics authorization could not be started.");
}
