import Link from "next/link";
import { ArrowRight, Plus, ShieldCheck } from "lucide-react";
import { AppShell, SourceBadge } from "../../../components/app-shell";
import { DashboardShell, DashboardTopline, DemoNotice } from "../../../components/dashboard-shell";
import { SiteMark } from "../../../components/site-mark";
import { getLeaderboard } from "../../../lib/demo-data";

export const metadata = { title: "My sites" };

export default function MySitesPage() {
  const sites = getLeaderboard().slice(0, 3);
  return <AppShell><DashboardShell active="/dashboard/sites"><DashboardTopline title="My sites" description="Control the listing, data source, and paid distribution for sites in your workspace." action={<Link className="button button-coral" href="/submit"><Plus size={15} /> Add a site</Link>} /><DemoNotice /><div className="section-tight"><div className="panel"><div className="dashboard-list">{sites.map((site) => <div className="dashboard-list-row" key={site.siteId}><div className="breakout-site"><SiteMark site={site} size="default" /><div><strong>{site.name}</strong><span>{site.domain} · {site.categoryName}</span></div></div><div style={{ display: "flex", alignItems: "center", gap: 17 }}><div style={{ textAlign: "right" }}><strong>#{site.rank || "—"}</strong><span>Heat {site.heatScore}</span></div><SourceBadge source={site.verification === "unverified" ? "unverified" : site.verification} compact /><Link className="row-arrow" href={`/dashboard/sites/${site.siteId}`} aria-label={`Open ${site.name} workspace`}><ArrowRight size={16} /></Link></div></div>)}</div></div></div><div className="section-tight"><div className="method-note"><ShieldCheck size={14} /> Claim status and traffic status remain distinct. A claimed site can still have unverified traffic; a GA4-verified site can still be unclaimed.</div></div></DashboardShell></AppShell>;
}
