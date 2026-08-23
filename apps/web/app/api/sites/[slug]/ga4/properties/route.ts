import { getServerEnv } from "@surge/config";
import { requireApiUser } from "../../../../../../lib/server/authorization";
import { jsonError, jsonOk } from "../../../../../../lib/server/http";
import { Ga4ServiceError, listGa4Properties } from "../../../../../../lib/server/ga4-service";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  if (getServerEnv().APP_MODE !== "production" || getServerEnv().DATA_PROVIDER !== "postgres") return jsonError(request, 409, "demo_mode", "GA4 property discovery is disabled in demo mode.");
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;
  const siteId = (await params).slug;
  const url = new URL(request.url);
  try { return jsonOk(request, await listGa4Properties({ userId: auth.user.id, siteId, cursor: url.searchParams.get("cursor") ?? undefined, query: url.searchParams.get("q") ?? undefined })); }
  catch (error) { return handleError(request, error); }
}

function handleError(request: Request, error: unknown) {
  if (error instanceof Ga4ServiceError) return jsonError(request, error.status, error.code, error.message);
  console.error(JSON.stringify({ component: "ga4-property-discovery", event: "failed", errorClass: error instanceof Error ? error.name : "unknown" }));
  return jsonError(request, 502, "ga4_property_discovery_failed", "Accessible Google Analytics properties are temporarily unavailable.");
}
