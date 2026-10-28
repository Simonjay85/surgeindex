import { getServerEnv } from "@surge/config";
import { requireApiUser } from "../../../../../../lib/server/authorization";
import { assertSameOrigin, jsonError, jsonOk } from "../../../../../../lib/server/http";
import { Ga4ServiceError, startGa4OAuth } from "../../../../../../lib/server/ga4-service";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const origin = assertSameOrigin(request);
  if (!origin.ok) return origin.response;
  if (getServerEnv().APP_MODE !== "production" || getServerEnv().DATA_PROVIDER !== "postgres") return jsonError(request, 409, "demo_mode", "GA4 reauthorization is disabled in demo mode.");
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;
  try { return jsonOk(request, await startGa4OAuth({ userId: auth.user.id, siteId: (await params).slug, reauthorize: true }), 201); }
  catch (error) { if (error instanceof Ga4ServiceError) return jsonError(request, error.status, error.code, error.message); return jsonError(request, 500, "ga4_reauthorize_failed", "Google Analytics reauthorization could not be started."); }
}
