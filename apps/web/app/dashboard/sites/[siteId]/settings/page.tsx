import Link from "next/link";
import { ArrowLeft, Settings2 } from "lucide-react";
import { notFound } from "next/navigation";
import { getServerEnv } from "@surge/config";
import { AppShell, DataModeBadge } from "../../../../../components/app-shell";
import { DashboardShell, DashboardTopline, DemoNotice } from "../../../../../components/dashboard-shell";
import { SiteSettingsClient } from "../../../../../components/site-settings-client";
import { requirePageUser } from "../../../../../lib/server/authorization";
import { getPublicDataProvider } from "../../../../../lib/server/public-provider";

export default async function SiteSettingsPage({ params }: { params: Promise<{ siteId: string }> }) {
  const user = await requirePageUser();
  const { siteId } = await params;
  const provider = getPublicDataProvider();
  const site = await provider.getOwnedSite(user.id, siteId);
  if (!site) notFound();
  const categories = await provider.getCategories();
  const env = getServerEnv();
  return <AppShell><DashboardShell active="/dashboard/sites"><DashboardTopline title="Listing settings" description={`${site.name} · public listing controls`} action={<Link className="text-link" href={`/dashboard/sites/${site.siteId}`}><ArrowLeft size={14} /> Site overview</Link>} />{site.isDemo ? <DemoNotice>Listing settings are visible, but demo records are not mutated.</DemoNotice> : <div className="demo-ribbon dashboard-notice"><DataModeBadge isDemo={false} compact /> <span>Owner/editor changes are version-checked and audit logged.</span></div>}<div className="section-tight"><SiteSettingsClient siteId={site.siteId} initialCategories={categories} isDemo={site.isDemo} turnstileSiteKey={env.TURNSTILE_SITE_KEY} /></div><div className="method-note"><Settings2 size={14} /> Listing metadata, disclosure choices, and aliases are separate from tracker, GA4, ranking, and paid-distribution data.</div></DashboardShell></AppShell>;
}
