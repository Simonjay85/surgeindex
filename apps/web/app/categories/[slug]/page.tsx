import Link from "next/link";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { notFound } from "next/navigation";
import { AppShell, commercialUiEnabled, DataModeBadge, SectionHeading } from "../../../components/app-shell";
import { CompactRankingRow } from "../../../components/leaderboard-card";
import { getPublicDataProvider } from "../../../lib/server/public-provider";
import { SponsoredBoostCard } from "../../../components/sponsored-boost-card";

export default async function CategoryPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const provider = getPublicDataProvider();
  const category = (await provider.getCategories()).find((item) => item.slug === slug);
  if (!category) notFound();
  const sites = await provider.getLeaderboard({ window: "live", category: slug });
  // Demo categories use slugs; production categories use UUIDs. The API
  // accepts only the latter for server-side category targeting.
  const categoryId = /^[0-9a-f-]{36}$/i.test(category.id) ? category.id : undefined;
  return <AppShell><div className="container page-hero"><Link className="text-link" href="/categories"><ArrowLeft size={14} /> All categories</Link><div className="page-hero-grid" style={{ marginTop: 26 }}><div><div className="eyebrow">CATEGORY INDEX</div><h1>{category.name}</h1><p>{category.description} Sites are sorted by organic Heat Score and displayed with {provider.source === "demo" ? "demo provenance" : "persisted production data"}.</p></div><div className="page-hero-aside"><span>sites in category</span><strong>{category.siteCount}</strong><DataModeBadge isDemo={provider.source === "demo"} compact /></div></div><div className="section-tight"><SectionHeading title="Category leaderboard" description="Organic rank stays separate from any sponsored recommendations." action={<Link className="button button-coral button-small" href="/submit">Submit a site <ArrowRight size={14} /></Link>} /><div className="ranking-table"><div className="ranking-table-head"><span>Rank</span><span>Move</span><span>Website</span><span>Category</span><span>Heat</span><span>Visitors</span><span>Growth</span><span>Source</span><span>Trend</span><span /></div>{sites.map((site) => <CompactRankingRow key={site.siteId} site={site} />)}</div></div>{commercialUiEnabled ? <div className="section-tight"><SectionHeading eyebrow="SPONSORED DISTRIBUTION" title="A labeled category recommendation" description="This paid lane is rendered outside the organic leaderboard and never changes rank." /><SponsoredBoostCard placement="category_boosted" categoryId={categoryId} routeContext={`/categories/${category.slug}`} /></div> : null}</div></AppShell>;
}
