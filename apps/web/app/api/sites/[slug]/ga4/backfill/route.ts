import { z } from "zod";
import { getServerEnv } from "@surge/config";
import { requireApiUser } from "../../../../../../lib/server/authorization";
import { assertSameOrigin, jsonError, jsonOk } from "../../../../../../lib/server/http";
import { Ga4ServiceError, startGa4Backfill } from "../../../../../../lib/server/ga4-service";

export const runtime = "nodejs";
const bodySchema = z.object({ days: z.number().int().min(1).max(365).optional(), dryRun: z.boolean().optional() }).default({});

export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const origin = assertSameOrigin(request);
  if (!origin.ok) return origin.response;
  if (getServerEnv().APP_MODE !== "production" || getServerEnv().DATA_PROVIDER !== "postgres") return jsonError(request, 409, "demo_mode", "GA4 backfill is disabled in demo mode.");
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;
  const body = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!body.success) return jsonError(request, 422, "invalid_backfill", "Choose a backfill window between 1 and 365 days.");
  try { return jsonOk(request, await startGa4Backfill({ userId: auth.user.id, siteId: (await params).slug, ...body.data }), 202); }
  catch (error) { return handleError(request, error); }
}

function handleError(request: Request, error: unknown) {
  if (error instanceof Ga4ServiceError) return jsonError(request, error.status, error.code, error.message);
  console.error(JSON.stringify({ component: "ga4-backfill", event: "start_failed", errorClass: error instanceof Error ? error.name : "unknown" }));
  return jsonError(request, 500, "ga4_backfill_failed", "The GA4 backfill could not be queued.");
}
