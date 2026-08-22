import Link from "next/link";
import { ArrowLeft, ArrowUpRight, Search as SearchIcon } from "lucide-react";
import { AppShell, DataModeBadge } from "../../components/app-shell";
import { SiteMark } from "../../components/site-mark";
import { getPublicDataProvider } from "../../lib/server/public-provider";

export const metadata = { title: "Search sites" };

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const provider = getPublicDataProvider();
  const query = (await searchParams).q?.trim() ?? "";
  const sites = await provider.getLeaderboard({ window: "live", query, limit: 6 });
  return <AppShell><div className="container page-hero"><Link className="text-link" href="/"><ArrowLeft size={14} /> Back to live board</Link><div className="page-hero-grid" style={{ marginTop: 26 }}><div><div className="eyebrow">SEARCH THE INDEX</div><h1>Find a site worth watching.</h1><p>Search by name, domain, or category. {provider.source === "demo" ? "This demo uses a deterministic local index." : "Production search is rate-limited and server-backed."}</p></div></div><div className="section-tight"><form className="search-submit-wrap" action="/search"><label className="sr-only" htmlFor="search-page">Search sites</label><input id="search-page" name="q" placeholder="Try launchpilot.ai or AI Tools" defaultValue={query} autoFocus /><button className="button button-coral" type="submit"><SearchIcon size={16} /> Search</button></form><div className="section-heading" style={{ marginTop: 36 }}><div><div className="eyebrow">{query ? "SEARCH RESULTS" : "POPULAR RIGHT NOW"}</div><h2>{query ? `Results for ${query}` : "Suggested sites"}</h2></div><DataModeBadge isDemo={provider.source === "demo"} compact /></div>{sites.length ? <div className="dashboard-list panel">{sites.map((site) => <div className="dashboard-list-row" key={site.siteId}><div className="breakout-site"><SiteMark site={site} size="small" /><div><strong>{site.name}</strong><span>{site.domain} · {site.categoryName}</span></div></div><div style={{ display: "flex", alignItems: "center", gap: 13 }}><span className="status-chip status-active">Heat {site.heatScore || "—"}</span><Link className="row-arrow" href={`/site/${site.slug}`} aria-label={`View ${site.name}`}><ArrowUpRight size={16} /></Link></div></div>)}</div> : <div className="empty-state"><SearchIcon size={22} /><h3>No public sites found.</h3><p>Try another name or submit a new site for review.</p></div>}</div></div></AppShell>;
}
