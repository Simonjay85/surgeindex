import Link from "next/link";
import { ArrowLeft, ArrowUpRight, Search as SearchIcon } from "lucide-react";
import { AppShell, SourceBadge } from "../../components/app-shell";
import { SiteMark } from "../../components/site-mark";
import { getLeaderboard } from "../../lib/demo-data";

export const metadata = { title: "Search sites" };

export default function SearchPage() {
  const sites = getLeaderboard().slice(0, 6);
  return <AppShell><div className="container page-hero"><Link className="text-link" href="/"><ArrowLeft size={14} /> Back to live board</Link><div className="page-hero-grid" style={{ marginTop: 26 }}><div><div className="eyebrow">SEARCH THE INDEX</div><h1>Find a site worth watching.</h1><p>Search by name, domain, or category. This demo uses a deterministic local index; production search is rate-limited and server-backed.</p></div></div><div className="section-tight"><form className="search-submit-wrap" action="/"><label className="sr-only" htmlFor="search-page">Search sites</label><input id="search-page" name="q" placeholder="Try launchpilot.ai or AI Tools" autoFocus /><button className="button button-coral" type="submit"><SearchIcon size={16} /> Search</button></form><div className="section-heading" style={{ marginTop: 36 }}><div><div className="eyebrow">POPULAR RIGHT NOW</div><h2>Suggested sites</h2></div><SourceBadge source="demo" compact /></div><div className="dashboard-list panel">{sites.map((site) => <div className="dashboard-list-row" key={site.siteId}><div className="breakout-site"><SiteMark site={site} size="small" /><div><strong>{site.name}</strong><span>{site.domain} · {site.categoryName}</span></div></div><div style={{ display: "flex", alignItems: "center", gap: 13 }}><span className="status-chip status-active">Heat {site.heatScore}</span><Link className="row-arrow" href={`/site/${site.slug}`} aria-label={`View ${site.name}`}><ArrowUpRight size={16} /></Link></div></div>)}</div></div></div></AppShell>;
}
