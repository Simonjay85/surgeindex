import { getServerEnv } from "@surge/config";
import { requireApiAdmin } from "../../../../../lib/server/authorization";
import { jsonError, jsonOk } from "../../../../../lib/server/http";
import { getGa4Operations } from "../../../../../lib/server/ga4-service";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const auth = await requireApiAdmin(request);
  if ("response" in auth) return auth.response;
  if (getServerEnv().APP_MODE !== "production" || getServerEnv().DATA_PROVIDER !== "postgres") return jsonOk(request, { connections: [], backfills: [], quotaLimited: [], tokenVersions: [], source: "demo" });
  try { return jsonOk(request, { ...(await getGa4Operations()), source: "postgres" }); }
  catch (error) { console.error(JSON.stringify({ component: "ga4-admin", event: "health_failed", errorClass: error instanceof Error ? error.name : "unknown" })); return jsonError(request, 503, "ga4_health_unavailable", "GA4 operations data is temporarily unavailable."); }
}
