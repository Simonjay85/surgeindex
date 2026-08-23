import { z } from "zod";
import { getServerEnv } from "@surge/config";
import { requireApiUser } from "../../../../../../lib/server/authorization";
import { assertSameOrigin, jsonError, jsonOk } from "../../../../../../lib/server/http";
import { checkRateLimit } from "../../../../../../lib/server/rate-limit";
import { Ga4ServiceError, runGa4CoreSync, runGa4RealtimeSync } from "../../../../../../lib/server/ga4-service";

export const runtime = "nodejs";
const bodySchema = z.object({ type: z.enum(["core", "realtime", "all"]).default("all") });

export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const origin = assertSameOrigin(request);
  if (!origin.ok) return origin.response;
  if (getServerEnv().APP_MODE !== "production" || getServerEnv().DATA_PROVIDER !== "postgres") return jsonError(request, 409, "demo_mode", "GA4 sync is disabled in demo mode.");
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;
  const siteId = (await params).slug;
  const body = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!body.success) return jsonError(request, 422, "invalid_sync_type", "Choose core, realtime, or all.");
  const rate = checkRateLimit("ga4-manual-sync", `${auth.user.id}:${siteId}`, 10, 60 * 60 * 1000);
  if (!rate.allowed) return jsonError(request, 429, "rate_limited", "Manual GA4 sync is temporarily rate-limited.");
  try {
    const result: Record<string, unknown> = {};
    if (body.data.type === "core" || body.data.type === "all") result.core = await runGa4CoreSync({ userId: auth.user.id, siteId, requestId: request.headers.get("x-request-id") ?? undefined });
    if (body.data.type === "realtime" || body.data.type === "all") result.realtime = await runGa4RealtimeSync({ userId: auth.user.id, siteId, requestId: request.headers.get("x-request-id") ?? undefined });
    return jsonOk(request, result);
  } catch (error) { return handleError(request, error); }
}

function handleError(request: Request, error: unknown) {
  if (error instanceof Ga4ServiceError) return jsonError(request, error.status, error.code, error.message);
  console.error(JSON.stringify({ component: "ga4-sync", event: "manual_failed", errorClass: error instanceof Error ? error.name : "unknown" }));
  return jsonError(request, 502, "ga4_sync_failed", "Sync is delayed. Your last valid data remains available.");
}
