import Link from "next/link";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { notFound } from "next/navigation";
import { AppShell, SectionHeading, SourceBadge } from "../../../components/app-shell";
import { CompactRankingRow } from "../../../components/leaderboard-card";
import { getCategories, getLeaderboard } from "../../../lib/demo-data";

export default async function CategoryPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const category = getCategories().find((item) => item.slug === slug);
  if (!category) notFound();
  const sites = getLeaderboard("live", slug);
  return <AppShell><div className="container page-hero"><Link className="text-link" href="/categories"><ArrowLeft size={14} /> All categories</Link><div className="page-hero-grid" style={{ marginTop: 26 }}><div><div className="eyebrow">CATEGORY INDEX</div><h1>{category.name}</h1><p>{category.description} Sites are sorted by organic Heat Score and displayed with demo provenance.</p></div><div className="page-hero-aside"><span>sites in category</span><strong>{category.siteCount}</strong><SourceBadge source="demo" compact /></div></div><div className="section-tight"><SectionHeading title="Category leaderboard" description="Organic rank stays separate from any sponsored recommendations." action={<Link className="button button-coral button-small" href="/submit">Submit a site <ArrowRight size={14} /></Link>} /><div className="ranking-table"><div className="ranking-table-head"><span>Rank</span><span>Move</span><span>Website</span><span>Category</span><span>Heat</span><span>Visitors</span><span>Growth</span><span>Source</span><span>Trend</span><span /></div>{sites.map((site) => <CompactRankingRow key={site.siteId} site={site} />)}</div></div></div></AppShell>;
}
