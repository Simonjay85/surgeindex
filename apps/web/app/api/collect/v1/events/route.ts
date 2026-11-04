import { getServerEnv } from "@surge/config";
import { flattenTrackerBatch, trackerBatchSchema } from "@surge/shared";
import { collectorCorsHeaders, collectorErrorResponse, collectTrackerRequest } from "../../../../../lib/server/traffic-pipeline";
import { jsonError, jsonOk } from "../../../../../lib/server/http";

function corsHeaders(request: Request): HeadersInit {
  return collectorCorsHeaders(request);
}

export async function OPTIONS(request: Request) {
  return new Response(null, { status: 204, headers: { ...corsHeaders(request), "Access-Control-Max-Age": "600" } });
}

export async function POST(request: Request) {
  if (getServerEnv().APP_MODE === "demo") {
    const parsed = trackerBatchSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return withCors(jsonError(request, 422, "invalid_payload", "The tracker event payload is invalid."), request);
    const accepted = flattenTrackerBatch(parsed.data).length;
    return jsonOk(request, { accepted, rejected: 0, source: "demo" }, 202, { ...corsHeaders(request), "Cache-Control": "no-store" });
  }
  try {
    const outcome = await collectTrackerRequest(request);
    return jsonOk(request, outcome, 202, { ...corsHeaders(request), "Cache-Control": "no-store" });
  } catch (error) {
    return collectorErrorResponse(request, error);
  }
}

function withCors(response: Response, request: Request) {
  for (const [key, value] of Object.entries(corsHeaders(request))) response.headers.set(key, String(value));
  return response;
}
