import Link from "next/link";
import { ArrowRight, Filter, Sparkles } from "lucide-react";
import { AppShell, SectionHeading, SourceBadge } from "../../components/app-shell";
import { CompactRankingRow } from "../../components/leaderboard-card";
import { getCategories, getLeaderboard } from "../../lib/demo-data";

export const metadata = { title: "Live rankings" };

export default function RankingsPage() {
  const sites = getLeaderboard("live");
  const categories = getCategories();
  return <AppShell><div className="container page-hero"><div className="page-hero-grid"><div><div className="eyebrow">THE ORGANIC BOARD</div><h1>Attention, in motion.</h1><p>See which websites are earning momentum from verified traffic, growth, and live activity. Paid boosts are always kept outside this board.</p></div><div className="page-hero-aside"><span>sites in demo index</span><strong>24</strong><SourceBadge source="demo" compact /></div></div><div className="section-tight"><SectionHeading title="Global leaderboard" description="Change the lens or explore a category. Every value below is simulated for this preview." action={<Link className="button button-coral button-small" href="/submit">Submit a site <ArrowRight size={14} /></Link>} /><div className="window-tabs"><span className="window-tab window-tab-active">Live</span><Link className="window-tab" href="/?window=24h">24H</Link><Link className="window-tab" href="/?window=7d">7D</Link><Link className="window-tab" href="/breakouts">Breakout</Link><span className="window-tab">New</span></div><div className="category-scroll" style={{ marginTop: 14 }}><span className="category-pill category-pill-active"><Filter size={13} /> All</span>{categories.map((category) => <Link className="category-pill" key={category.slug} href={`/categories/${category.slug}`}>{category.name} · {category.siteCount}</Link>)}</div><div className="ranking-table"><div className="ranking-table-head"><span>Rank</span><span>Move</span><span>Website</span><span>Category</span><span>Heat</span><span>Visitors</span><span>Growth</span><span>Source</span><span>Trend</span><span /></div>{sites.map((site) => <CompactRankingRow key={site.siteId} site={site} />)}</div><div className="demo-ribbon"><Sparkles size={13} /> <SourceBadge source="demo" compact /> <span>Live production mode replaces these fixtures with server-validated analytics.</span></div></div></div></AppShell>;
}
