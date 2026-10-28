import { getServerEnv } from "@surge/config";
import { requireApiUser } from "../../../../../../../lib/server/authorization";
import { BoostServiceError, getBoostCampaignReport } from "../../../../../../../lib/server/boost-service";

export const runtime = "nodejs";

function cell(value: string | number | null): string {
  const text = value == null ? "" : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

export async function GET(request: Request, { params }: { params: Promise<{ campaignId: string }> }) {
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;
  if (getServerEnv().APP_MODE !== "production" || getServerEnv().DATA_PROVIDER !== "postgres") {
    return new Response("metric,value,source\nqualified_impressions,0,Demo fixture; not billable\n", { status: 200, headers: { "content-type": "text/csv; charset=utf-8", "cache-control": "no-store", "content-disposition": "attachment; filename=boost-demo-report.csv" } });
  }
  try {
    const { campaign, report, sourceLabels } = await getBoostCampaignReport(auth.user.id, (await params).campaignId);
    const rows: Array<Array<string | number | null>> = [
      ["metric", "value", "source"],
      ["campaign_id", campaign.id, "SurgeIndex campaign ledger"],
      ["placement", campaign.placementKey, "SurgeIndex ad delivery"],
      ["state", campaign.state, "SurgeIndex campaign state machine"],
      ["target_qualified_impressions", report.targetQualifiedImpressions, sourceLabels.delivery],
      ["qualified_impressions", report.qualifiedImpressions, sourceLabels.delivery],
      ["rendered_impressions", report.renderedImpressions, sourceLabels.delivery],
      ["invalid_impressions", report.invalidImpressions, sourceLabels.delivery],
      ["remaining_qualified_impressions", report.remainingQualifiedImpressions, sourceLabels.delivery],
      ["valid_clicks", report.validClicks, sourceLabels.clicks],
      ["unique_clicks", report.uniqueClicks, sourceLabels.clicks],
      ["attributed_visits", report.attributedVisits, sourceLabels.attribution],
      ["attributed_engaged_visits", report.attributedEngagedVisits, sourceLabels.attribution],
      ["amount_paid_minor_units", report.amountPaidCents, sourceLabels.payment],
      ["currency", report.currency, sourceLabels.payment],
    ];
    const csv = rows.map((row) => row.map((value) => cell(value)).join(",")).join("\n") + "\n";
    return new Response(csv, { headers: { "content-type": "text/csv; charset=utf-8", "cache-control": "private, no-store", "content-disposition": `attachment; filename=boost-${campaign.id}-report.csv` } });
  } catch (error) {
    if (error instanceof BoostServiceError) return Response.json({ error: { code: error.code, message: error.message } }, { status: error.status, headers: { "cache-control": "no-store" } });
    return Response.json({ error: { code: "campaign_report_failed", message: "The campaign report could not be exported." } }, { status: 500, headers: { "cache-control": "no-store" } });
  }
}
