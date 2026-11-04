import { z } from "zod";
import { getServerEnv } from "@surge/config";
import { requireApiUser } from "../../../../../../../../lib/server/authorization";
import { jsonError, jsonOk } from "../../../../../../../../lib/server/http";
import { Ga4ServiceError, listGa4Streams } from "../../../../../../../../lib/server/ga4-service";

export const runtime = "nodejs";

const paramsSchema = z.object({ slug: z.string().uuid(), propertyId: z.string().regex(/^[0-9A-Za-z_-]{1,128}$/) });

export async function GET(request: Request, { params }: { params: Promise<{ slug: string; propertyId: string }> }) {
  if (getServerEnv().APP_MODE !== "production" || getServerEnv().DATA_PROVIDER !== "postgres") return jsonError(request, 409, "demo_mode", "GA4 stream discovery is disabled in demo mode.");
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;
  const parsed = paramsSchema.safeParse(await params);
  if (!parsed.success) return jsonError(request, 422, "invalid_property", "The property identifier is invalid.");
  const url = new URL(request.url);
  try { return jsonOk(request, await listGa4Streams({ userId: auth.user.id, siteId: parsed.data.slug, propertyId: parsed.data.propertyId, cursor: url.searchParams.get("cursor") ?? undefined })); }
  catch (error) { return handleError(request, error); }
}

function handleError(request: Request, error: unknown) {
  if (error instanceof Ga4ServiceError) return jsonError(request, error.status, error.code, error.message);
  console.error(JSON.stringify({ component: "ga4-stream-discovery", event: "failed", errorClass: error instanceof Error ? error.name : "unknown" }));
  return jsonError(request, 502, "ga4_stream_discovery_failed", "Google Analytics web streams are temporarily unavailable.");
}
