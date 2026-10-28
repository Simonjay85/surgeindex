import Link from "next/link";
import { connection } from "next/server";
import { Activity, ArrowUpRight, Radio } from "lucide-react";
import { AppShell, DataModeBadge, SourceBadge } from "../../components/app-shell";
import { LiveMetric } from "../../components/live-metric";
import { getPublicDataProvider } from "../../lib/server/public-provider";

export const metadata = { title: "Live traffic" };

export default async function LivePage() {
  await connection();
  const provider = getPublicDataProvider();
  const sites = (await provider.getLeaderboard({ window: "live", limit: 24 })).filter((site) => site.activeNow !== null || site.verification === "tracker");
  return <AppShell><div className="container page-hero"><div className="page-hero-grid"><div><div className="eyebrow">LIVE TRAFFIC</div><h1>See the sites with a pulse right now.</h1><p>Active visitors are counted from accepted visible heartbeats. Two tabs can be two active sessions, but they remain one active visitor.</p></div><div className="page-hero-aside"><span><Radio size={14} /> realtime status</span><strong>{provider.source === "demo" ? "Demo" : "Tracker"}</strong><DataModeBadge isDemo={provider.source === "demo"} compact /></div></div><div className="section-tight"><div className="dashboard-list">{sites.length ? sites.map((site) => <article className="panel" key={site.siteId} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 20, marginBottom: 10 }}><div><div className="eyebrow">{site.categoryName}</div><h2 style={{ margin: "4px 0" }}><Link href={`/site/${site.slug}`}>{site.name}</Link></h2><p style={{ margin: 0, color: "var(--foreground-muted)", fontSize: 12 }}>{site.domain}</p><div className="source-row" style={{ border: 0 }}><SourceBadge source={site.verification === "unverified" ? "unverified" : site.verification} compact />{site.isDemo ? <DataModeBadge isDemo compact /> : null}</div></div><div style={{ display: "flex", alignItems: "center", gap: 18 }}><div className="dashboard-card"><small><Activity size={12} /> active</small><LiveMetric siteId={site.siteId} initialVisitors={site.activeNow} initialSessions={site.activeSessions} /></div><Link className="row-arrow" href={`/site/${site.slug}`} aria-label={`Open ${site.name}`}><ArrowUpRight size={17} /></Link></div></article>) : <div className="empty-state"><h3>No connected live sources yet</h3><p>When an ownership-verified site sends accepted tracker heartbeats, it appears here.</p></div>}</div></div></div></AppShell>;
}
