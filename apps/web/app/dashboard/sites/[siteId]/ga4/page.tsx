import { notFound } from "next/navigation";
import { getServerEnv } from "@surge/config";
import { AppShell } from "../../../../../components/app-shell";
import { DashboardShell, DashboardTopline } from "../../../../../components/dashboard-shell";
import { Ga4ConnectionClient } from "../../../../../components/ga4-connection-client";
import { requirePageUser } from "../../../../../lib/server/authorization";
import { getPublicDataProvider } from "../../../../../lib/server/public-provider";

export const metadata = { title: "Google Analytics 4 connection" };

export default async function Ga4Page({ params }: { params: Promise<{ siteId: string }> }) {
  const user = await requirePageUser();
  const ga4Enabled = getServerEnv().GA4_ENABLED;
  const { siteId } = await params;
  const site = await getPublicDataProvider().getOwnedSite(user.id, siteId);
  if (!site) notFound();
  if (!ga4Enabled) {
    return <AppShell><DashboardShell active="/dashboard/sites"><DashboardTopline title="Google Analytics 4" description={`${site.name} · connection unavailable in Public Free`} /><div className="section-tight"><div className="empty-state"><h3>GA4 is coming later</h3><p>This release uses the first-party tracker. Google OAuth and GA4 imports stay disabled until a separate provider-verification release is complete.</p></div></div></DashboardShell></AppShell>;
  }
  return <AppShell><DashboardShell active="/dashboard/sites"><DashboardTopline title="Google Analytics 4" description={`${site.name} · read-only traffic connection`} /><Ga4ConnectionClient siteId={site.siteId} domain={site.domain} isDemo={site.isDemo} /></DashboardShell></AppShell>;
}
