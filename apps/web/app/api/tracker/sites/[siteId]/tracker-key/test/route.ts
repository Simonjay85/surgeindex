import { z } from "zod";
import { getServerEnv } from "@surge/config";
import { requireApiUser } from "../../../../../../../lib/server/authorization";
import { assertSameOrigin, jsonError, jsonOk } from "../../../../../../../lib/server/http";
import { testTrackerInstallation, TrackerKeyServiceError } from "../../../../../../../lib/server/tracker-key-service";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ siteId: string }> }) {
  const origin = assertSameOrigin(request);
  if (!origin.ok) return origin.response;
  if (getServerEnv().APP_MODE !== "production" || getServerEnv().DATA_PROVIDER !== "postgres") return jsonError(request, 409, "demo_mode", "Tracker installation tests require a production repository.");
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;
  const parsed = z.object({ siteId: z.string().uuid() }).safeParse(await params);
  if (!parsed.success) return jsonError(request, 422, "invalid_site", "The site identifier is invalid.");
  const body = z.object({ since: z.string().datetime({ offset: true }).optional() }).safeParse(await request.json().catch(() => ({})));
  if (!body.success) return jsonError(request, 422, "invalid_payload", "The test window is invalid.");
  try { return jsonOk(request, await testTrackerInstallation(auth.user.id, parsed.data.siteId, body.data.since)); }
  catch (error) {
    if (error instanceof TrackerKeyServiceError) return jsonError(request, error.status, error.code, error.message);
    return jsonError(request, 500, "tracker_test_failed", "The tracker installation test could not be completed.");
  }
}
