import { AppShell } from "../../../components/app-shell";
import { BoostDashboardClient } from "../../../components/boost-dashboard-client";
import { DashboardShell, DashboardTopline } from "../../../components/dashboard-shell";
import { requirePageUser } from "../../../lib/server/authorization";
import { listBoostPackages, listBoostPlacements } from "../../../lib/server/boost-config";
import { listOwnedBoostCampaigns } from "../../../lib/server/boost-service";
import { getPublicDataProvider } from "../../../lib/server/public-provider";
import { stripeTestModeStatus } from "../../../lib/server/stripe-service";

export const metadata = { title: "Boost campaigns" };

export default async function BoostsPage() {
  const user = await requirePageUser();
  const provider = getPublicDataProvider();
  const [ownedSites, campaigns] = await Promise.all([
    provider.getOwnedSites(user.id),
    listOwnedBoostCampaigns(user.id),
  ]);
  const sites = ownedSites
    .filter((site) => site.status === "active" && site.ownership === "claimed" && !site.isDemo)
    .map((site) => ({ id: site.siteId, name: site.name, domain: site.domain }));
  const packages = listBoostPackages()
    .filter((item) => item.active && item.amountCents != null && item.targetQualifiedImpressions != null)
    .map((item) => ({ id: item.id, name: item.name, amountCents: item.amountCents!, currency: item.currency, targetImpressions: item.targetQualifiedImpressions!, durationDays: item.defaultDurationDays }));
  const placements = listBoostPlacements().filter((item) => item.active).map((item) => ({ key: item.key, name: item.name, description: item.description }));
  const rows = campaigns.map((campaign) => ({
    ...campaign,
    startAt: campaign.startAt?.toISOString() ?? null,
    endAt: campaign.endAt?.toISOString() ?? null,
    createdAt: campaign.createdAt.toISOString(),
    updatedAt: campaign.updatedAt.toISOString(),
  }));
  return <AppShell><DashboardShell active="/dashboard/boosts"><DashboardTopline title="Boost campaigns" description="Persistent campaigns backed by the production PostgreSQL repository." /><BoostDashboardClient initialCampaigns={rows} sites={sites} packages={packages} placements={placements} paymentConfigured={stripeTestModeStatus().configured} /></DashboardShell></AppShell>;
}
