import { z } from "zod";
import { getServerEnv } from "@surge/config";
import { requireApiUser } from "../../../../../../lib/server/authorization";
import { assertSameOrigin, jsonError, jsonOk } from "../../../../../../lib/server/http";
import { checkRateLimit } from "../../../../../../lib/server/rate-limit";
import { Ga4ServiceError, selectGa4Property } from "../../../../../../lib/server/ga4-service";

export const runtime = "nodejs";

const paramsSchema = z.object({ slug: z.string().uuid() });
const bodySchema = z.object({ propertyId: z.string().regex(/^[0-9A-Za-z_-]{1,128}$/), streamId: z.string().regex(/^[0-9A-Za-z_-]{1,128}$/) });

export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const origin = assertSameOrigin(request);
  if (!origin.ok) return origin.response;
  if (getServerEnv().APP_MODE !== "production" || getServerEnv().DATA_PROVIDER !== "postgres") return jsonError(request, 409, "demo_mode", "GA4 selection is disabled in demo mode.");
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;
  const parsedParams = paramsSchema.safeParse(await params);
  const body = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsedParams.success || !body.success) return jsonError(request, 422, "invalid_selection", "Choose a valid GA4 property and web data stream.");
  const rate = await checkRateLimit("ga4-property-select", `${auth.user.id}:${parsedParams.data.slug}`, 20, 60 * 60 * 1000);
  if (!rate.allowed) return jsonError(request, 429, "rate_limited", "GA4 property validation is temporarily rate-limited.");
  try { return jsonOk(request, await selectGa4Property({ userId: auth.user.id, siteId: parsedParams.data.slug, ...body.data }), 201); }
  catch (error) { return handleError(request, error); }
}

function handleError(request: Request, error: unknown) {
  if (error instanceof Ga4ServiceError) return jsonError(request, error.status, error.code, error.message);
  console.error(JSON.stringify({ component: "ga4-selection", event: "failed", errorClass: error instanceof Error ? error.name : "unknown" }));
  return jsonError(request, 502, "ga4_selection_failed", "The Google Analytics stream could not be validated.");
}
