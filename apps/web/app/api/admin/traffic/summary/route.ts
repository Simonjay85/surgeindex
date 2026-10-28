import { getServerEnv } from "@surge/config";
import { requireApiAdmin } from "../../../../../lib/server/authorization";
import { jsonError, jsonOk } from "../../../../../lib/server/http";
import { getTrafficOperationalSummary } from "../../../../../lib/server/traffic-aggregation";

export const runtime = "nodejs";

export async function GET(request: Request) {
  if (getServerEnv().APP_MODE !== "production") return jsonOk(request, { mode: "demo", eventsReceived: 0, eventsAccepted: 0, eventsRejected: 0, suspectedEvents: 0, ingestionFailures: 0, connectedSites: 0, staleTrackers: 0, queueLagSeconds: null, realtime: "local", lastAcceptedEventAt: null });
  const auth = await requireApiAdmin(request);
  if ("response" in auth) return auth.response;
  try { return jsonOk(request, await getTrafficOperationalSummary()); }
  catch { return jsonError(request, 503, "traffic_summary_unavailable", "Traffic operational summary is unavailable."); }
}

