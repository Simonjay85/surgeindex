import { getServerEnv } from "@surge/config";
import { requireApiUser } from "../../../../../../lib/server/authorization";
import { jsonError, jsonOk } from "../../../../../../lib/server/http";
import { BoostServiceError, getBoostCampaignReport } from "../../../../../../lib/server/boost-service";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ campaignId: string }> }) {
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;
  if (getServerEnv().APP_MODE !== "production" || getServerEnv().DATA_PROVIDER !== "postgres") return jsonOk(request, { isDemo: true, report: null, sourceLabels: { delivery: "Demo SurgeIndex ad delivery", attribution: "Demo fixture; not billable" } });
  try {
    return jsonOk(request, await getBoostCampaignReport(auth.user.id, (await params).campaignId));
  } catch (error) {
    if (error instanceof BoostServiceError) return jsonError(request, error.status, error.code, error.message);
    return jsonError(request, 500, "campaign_report_failed", "The campaign report could not be loaded.");
  }
}
