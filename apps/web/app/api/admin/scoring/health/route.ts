import { getServerEnv } from "@surge/config";
import { requireApiAdmin } from "../../../../../lib/server/authorization";
import { jsonError, jsonOk } from "../../../../../lib/server/http";
import { getScoringHealth } from "../../../../../lib/server/ranking-engine";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const auth = await requireApiAdmin(request);
  if ("response" in auth) return auth.response;
  if (getServerEnv().DATA_PROVIDER === "demo") return jsonOk(request, { source: "demo", generatedAt: new Date().toISOString(), jobs: [], states: [], leagues: [], breakouts: [], freshness: [] });
  try {
    return jsonOk(request, { source: getServerEnv().ANALYTICS_PROVIDER, ...(await getScoringHealth()) });
  } catch {
    return jsonError(request, 503, "scoring_health_unavailable", "Scoring health is temporarily unavailable.");
  }
}
