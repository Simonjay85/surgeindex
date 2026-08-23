import { z } from "zod";
import { getServerEnv } from "@surge/config";
import { requireApiUser } from "../../../../../../lib/server/authorization";
import { assertSameOrigin, jsonError, jsonOk } from "../../../../../../lib/server/http";
import { Ga4ServiceError, disconnectGa4 } from "../../../../../../lib/server/ga4-service";

export const runtime = "nodejs";
const bodySchema = z.object({ revoke: z.boolean().default(false) }).default({ revoke: false });

export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const origin = assertSameOrigin(request);
  if (!origin.ok) return origin.response;
  if (getServerEnv().APP_MODE !== "production" || getServerEnv().DATA_PROVIDER !== "postgres") return jsonError(request, 409, "demo_mode", "GA4 disconnect is disabled in demo mode.");
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;
  const body = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!body.success) return jsonError(request, 422, "invalid_disconnect", "Choose a valid disconnect action.");
  try { return jsonOk(request, await disconnectGa4({ userId: auth.user.id, siteId: (await params).slug, revoke: body.data.revoke })); }
  catch (error) { return handleError(request, error); }
}

function handleError(request: Request, error: unknown) {
  if (error instanceof Ga4ServiceError) return jsonError(request, error.status, error.code, error.message);
  console.error(JSON.stringify({ component: "ga4-disconnect", event: "failed", errorClass: error instanceof Error ? error.name : "unknown" }));
  return jsonError(request, 502, "ga4_disconnect_failed", "The Google Analytics connection could not be changed.");
}
