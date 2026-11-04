import { z } from "zod";
import { getServerEnv } from "@surge/config";
import { requireVerifiedApiUser } from "../../../../../../lib/server/authorization";
import { assertSameOrigin, jsonError, jsonOk } from "../../../../../../lib/server/http";
import { checkRateLimit } from "../../../../../../lib/server/rate-limit";
import { mutateTrackerKey, revokeTrackerKey, getTrackerKeyStatus, TrackerKeyServiceError } from "../../../../../../lib/server/tracker-key-service";

export const runtime = "nodejs";

const siteParams = z.object({ siteId: z.string().uuid() });
const actionSchema = z.object({ action: z.enum(["generate", "rotate"]) });

export async function GET(request: Request, { params }: { params: Promise<{ siteId: string }> }) {
  if (getServerEnv().APP_MODE !== "production" || getServerEnv().DATA_PROVIDER !== "postgres") return jsonError(request, 409, "demo_mode", "Tracker key state is available for an ownership-verified production site.");
  const auth = await requireVerifiedApiUser(request);
  if ("response" in auth) return auth.response;
  const parsed = siteParams.safeParse(await params);
  if (!parsed.success) return jsonError(request, 422, "invalid_site", "The site identifier is invalid.");
  try { return jsonOk(request, await getTrackerKeyStatus(auth.user.id, parsed.data.siteId)); }
  catch (error) { return handleError(request, error); }
}

export async function POST(request: Request, { params }: { params: Promise<{ siteId: string }> }) {
  const origin = assertSameOrigin(request);
  if (!origin.ok) return origin.response;
  if (getServerEnv().APP_MODE !== "production" || getServerEnv().DATA_PROVIDER !== "postgres") return jsonError(request, 409, "demo_mode", "Tracker key mutations are disabled in demo mode.");
  const auth = await requireVerifiedApiUser(request);
  if ("response" in auth) return auth.response;
  const parsedParams = siteParams.safeParse(await params);
  if (!parsedParams.success) return jsonError(request, 422, "invalid_site", "The site identifier is invalid.");
  const parsed = actionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError(request, 422, "invalid_action", "Choose generate or rotate.");
  const rate = await checkRateLimit("tracker-key-mutation", `${auth.user.id}:${parsedParams.data.siteId}`, parsed.data.action === "rotate" ? 5 : 10, 60 * 60 * 1000);
  if (!rate.allowed) return jsonError(request, 429, "rate_limited", "Tracker key changes are temporarily rate-limited.");
  try { return jsonOk(request, await mutateTrackerKey({ userId: auth.user.id, siteId: parsedParams.data.siteId, action: parsed.data.action }), 201); }
  catch (error) { return handleError(request, error); }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ siteId: string }> }) {
  const origin = assertSameOrigin(request);
  if (!origin.ok) return origin.response;
  if (getServerEnv().APP_MODE !== "production" || getServerEnv().DATA_PROVIDER !== "postgres") return jsonError(request, 409, "demo_mode", "Tracker key mutations are disabled in demo mode.");
  const auth = await requireVerifiedApiUser(request);
  if ("response" in auth) return auth.response;
  const parsed = siteParams.safeParse(await params);
  if (!parsed.success) return jsonError(request, 422, "invalid_site", "The site identifier is invalid.");
  const rate = await checkRateLimit("tracker-key-revoke", `${auth.user.id}:${parsed.data.siteId}`, 5, 60 * 60 * 1000);
  if (!rate.allowed) return jsonError(request, 429, "rate_limited", "Tracker key changes are temporarily rate-limited.");
  try { return jsonOk(request, await revokeTrackerKey(auth.user.id, parsed.data.siteId)); }
  catch (error) { return handleError(request, error); }
}

function handleError(request: Request, error: unknown) {
  if (error instanceof TrackerKeyServiceError) return jsonError(request, error.status, error.code, error.message);
  console.error(JSON.stringify({ component: "tracker-key", errorClass: error instanceof Error ? error.name : "unknown" }));
  return jsonError(request, 500, "tracker_key_failed", "The tracker key operation could not be completed.");
}
