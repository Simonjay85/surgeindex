import { getServerEnv } from "@surge/config";
import { requireApiUser } from "../../../../../../lib/server/authorization";
import { jsonError, jsonOk } from "../../../../../../lib/server/http";
import { Ga4ServiceError, getGa4Status } from "../../../../../../lib/server/ga4-service";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  if (getServerEnv().APP_MODE !== "production" || getServerEnv().DATA_PROVIDER !== "postgres") return jsonOk(request, { connection: null, backfill: null, syncs: [], quota: [], disabled: true });
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;
  try { return jsonOk(request, await getGa4Status({ userId: auth.user.id, siteId: (await params).slug })); }
  catch (error) { if (error instanceof Ga4ServiceError) return jsonError(request, error.status, error.code, error.message); return jsonError(request, 503, "ga4_status_unavailable", "GA4 status is temporarily unavailable."); }
}
