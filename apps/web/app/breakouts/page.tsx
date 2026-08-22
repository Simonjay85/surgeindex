import Link from "next/link";
import { ArrowUpRight, Radar, Sparkles } from "lucide-react";
import { AppShell, SectionHeading, SourceBadge } from "../../components/app-shell";
import { SiteMark } from "../../components/site-mark";
import { Sparkline } from "../../components/sparkline";
import { getBreakouts } from "../../lib/demo-data";

export const metadata = { title: "Breakouts" };

export default function BreakoutsPage() {
  const breakouts = getBreakouts();
  return <AppShell><div className="container page-hero"><div className="page-hero-grid"><div><div className="eyebrow">BREAKOUT SIGNALS</div><h1>Small sparks, getting bigger.</h1><p>Breakouts are sites whose current attention is running well above their own recent baseline. The multiple is a lead, not a popularity contest.</p></div><div className="page-hero-aside"><span>signals detected today</span><strong>18</strong><SourceBadge source="demo" compact /></div></div><div className="section-tight"><SectionHeading title="The watchlist" description="Sorted by attention acceleration. Unverified sites can appear here, but their volume stays unverified." action={<span className="tracker-status"><Radar size={15} /> refreshed 3m ago</span>} /><div className="breakout-grid">{breakouts.map((site) => <article className="breakout-card" key={site.siteId}><div className="breakout-card-top"><div className="breakout-site"><SiteMark site={site} size="default" /><div><Link href={`/site/${site.slug}`}><h3>{site.name}</h3></Link><span>{site.domain} · {site.categoryName}</span></div></div><div><div className="multiple">{site.multiple.toFixed(1)}×</div><SourceBadge source="demo" compact /></div></div><p className="breakout-explanation">{site.explanation}</p><div className="breakout-footer"><div><small>confidence</small><strong>{site.confidence}</strong></div><div><small>detected</small><strong>{site.detectedAt}</strong></div><div className="breakout-chart"><Sparkline values={site.sparkline} width={105} height={32} /><small>attention trend</small></div><Link className="row-arrow" href={`/site/${site.slug}`} aria-label={`View ${site.name}`}><ArrowUpRight size={16} /></Link></div></article>)}</div><div className="method-note"><Sparkles size={13} /> Breakout logic compares each site with its own baseline and applies small-base protection. It does not use paid spend.</div></div></div></AppShell>;
}
