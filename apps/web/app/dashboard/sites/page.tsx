import Link from "next/link";
import { ArrowRight, Plus, ShieldCheck } from "lucide-react";
import { AppShell, DataModeBadge, EmptyState, SourceBadge } from "../../../components/app-shell";
import { DashboardShell, DashboardTopline, DemoNotice } from "../../../components/dashboard-shell";
import { SiteMark } from "../../../components/site-mark";
import { requirePageUser } from "../../../lib/server/authorization";
import { getPublicDataProvider } from "../../../lib/server/public-provider";

export const metadata = { title: "My sites" };

export default async function MySitesPage() {
  const user = await requirePageUser();
  const provider = getPublicDataProvider();
  const sites = await provider.getOwnedSites(user.id);
  const isDemo = provider.source === "demo";
  return <AppShell><DashboardShell active="/dashboard/sites"><DashboardTopline title="My sites" description={isDemo ? "Control the listing, data source, and paid distribution for sites in your demo workspace." : "Review the listing, ownership, and persisted data source for sites attached to your account."} action={<Link className="button button-coral" href="/submit"><Plus size={15} /> Add a site</Link>} />{isDemo ? <DemoNotice /> : <div className="demo-ribbon dashboard-notice"><DataModeBadge isDemo={false} compact /> <span>Only persisted production records are shown.</span></div>}<div className="section-tight"><div className="panel">{sites.length ? <div className="dashboard-list">{sites.map((site) => <div className="dashboard-list-row" key={site.siteId}><div className="breakout-site"><SiteMark site={site} size="default" /><div><strong>{site.name}</strong><span>{site.domain} · {site.categoryName}</span><span className={`site-status site-status-${site.status}`}>{site.status === "pending" ? "Pending moderation" : site.status === "active" ? "Active listing" : site.status === "suspended" ? "Suspended" : "Rejected"}</span></div></div><div style={{ display: "flex", alignItems: "center", gap: 17 }}><div style={{ textAlign: "right" }}><strong>{site.rank ? `#${site.rank}` : "—"}</strong><span>Heat {site.heatScore || "—"}</span></div><SourceBadge source={site.verification === "unverified" ? "unverified" : site.verification} compact /><Link className="row-arrow" href={`/dashboard/sites/${site.siteId}`} aria-label={`Open ${site.name} workspace`}><ArrowRight size={16} /></Link></div></div>)}</div> : <EmptyState title="No sites in this workspace" description={isDemo ? "The demo provider has no owned records." : "Submit a site and claim it after moderation to attach it to your workspace."} action={<Link className="button button-coral" href="/submit">Submit a site <Plus size={15} /></Link>} />}</div></div><div className="section-tight"><div className="method-note"><ShieldCheck size={14} /> Claim status and traffic status remain distinct. A claimed site can still have unverified traffic; a connected traffic source can still need an ownership claim.</div></div></DashboardShell></AppShell>;
}
