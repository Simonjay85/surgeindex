import { timingSafeEqual } from "node:crypto";
import { getServerEnv } from "@surge/config";
import { jsonError, jsonOk } from "../../../../../lib/server/http";
import { runTrafficAggregation } from "../../../../../lib/server/traffic-aggregation";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const token = getServerEnv().INTERNAL_SERVICE_TOKEN;
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!token || !supplied || token.length !== supplied.length || !timingSafeEqual(Buffer.from(token), Buffer.from(supplied))) return jsonError(request, 401, "service_auth_required", "Internal service authentication is required.");
  try { return jsonOk(request, await runTrafficAggregation()); }
  catch (error) { console.error(JSON.stringify({ component: "aggregation", errorClass: error instanceof Error ? error.name : "unknown" })); return jsonError(request, 503, "aggregation_failed", "Aggregation is temporarily unavailable."); }
}
