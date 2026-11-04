import Link from "next/link";
import { connection } from "next/server";
import { ArrowUpRight, Radar, Sparkles } from "lucide-react";
import type { BreakoutItem } from "@surge/shared";
import { AppShell, commercialUiEnabled, DataModeBadge, SectionHeading } from "../../components/app-shell";
import { SiteMark } from "../../components/site-mark";
import { Sparkline } from "../../components/sparkline";
import { SponsoredBoostCard } from "../../components/sponsored-boost-card";
import { getPublicDataProvider } from "../../lib/server/public-provider";

export const metadata = { title: "Breakouts" };

function BreakoutCard({ site }: { site: BreakoutItem }) {
  const state = site.state ?? "watch";
  const strength = site.strength ?? "moderate";
  return <article className="breakout-card"><div className="breakout-card-top"><div className="breakout-site"><SiteMark site={{ name: site.name, domain: site.domain, slug: site.slug }} size="default" /><div><Link href={`/site/${site.slug}`}><h3>{site.name}</h3></Link><span>{site.domain} · {site.categoryName}</span></div></div><div><div className="multiple">{site.multiple.toFixed(1)}×</div><DataModeBadge isDemo={site.isDemo} compact /></div></div><div className="source-row"><span className="status-chip">{state.replaceAll("_", " ")}</span><span className="status-chip">{strength}</span><span className="ownership-note">{site.scoreState ?? "unverified"}</span><span className="ownership-note">{site.verification}</span></div><p className="breakout-explanation">{site.explanation}</p><div className="breakout-detail-grid"><div><small>current</small><strong>{site.currentVolume.toLocaleString()}</strong></div><div><small>baseline</small><strong>{site.baselineVolume.toLocaleString()}</strong></div><div><small>lift</small><strong>{site.absoluteLift == null ? "—" : `+${site.absoluteLift.toLocaleString()}`}</strong></div><div><small>duration</small><strong>{site.durationSeconds == null ? "—" : `${Math.round(site.durationSeconds / 60)}m`}</strong></div></div><div className="breakout-footer"><div><small>confidence</small><strong>{site.confidence}{site.dataConfidence == null ? "" : ` · ${Math.round(site.dataConfidence * 100)}%`}</strong></div><div><small>detected</small><strong>{new Date(site.detectedAt).toLocaleString()}</strong></div><div className="breakout-chart"><Sparkline values={site.sparkline} width={105} height={32} /><small>attention trend</small></div><Link className="row-arrow" href={`/site/${site.slug}`} aria-label={`View ${site.name}`}><ArrowUpRight size={16} /></Link></div></article>;
}

function BreakoutSection({ title, description, sites }: { title: string; description: string; sites: BreakoutItem[] }) {
  return <section className="breakout-section"><SectionHeading title={title} description={description} />{sites.length ? <div className="breakout-grid">{sites.map((site) => <BreakoutCard key={site.siteId} site={site} />)}</div> : <div className="empty-state"><h3>No persisted signals here</h3><p>Breakout events appear after fresh accepted traffic passes the multi-signal persistence rules.</p></div>}</section>;
}

export default async function BreakoutsPage() {
  await connection();
  const provider = getPublicDataProvider();
  const breakouts = await provider.getBreakouts();
  const surging = breakouts.filter((site) => site.state === "surging" || site.state === "breaking_out");
  const watch = breakouts.filter((site) => site.state === "watch");
  const cooling = breakouts.filter((site) => site.state === "cooling");
  return <AppShell><div className="container page-hero"><div className="page-hero-grid"><div><div className="eyebrow">BREAKOUT SIGNALS</div><h1>Small sparks, getting bigger.</h1><p>Breakouts combine relative lift, absolute valid traffic, live acceleration where supported, freshness, confidence, and persistence. They are signals—not claims about why attention moved.</p></div><div className="page-hero-aside"><span>public signals now</span><strong>{breakouts.length}</strong><DataModeBadge isDemo={provider.source === "demo"} compact /></div></div><div className="section-tight"><div className="window-tabs"><Link className="window-tab window-tab-active" href="/breakouts">All</Link><Link className="window-tab" href="/breakouts?state=surging">Surging</Link><Link className="window-tab" href="/breakouts?state=cooling">Cooling</Link><Link className="window-tab" href="/rankings">Organic rank</Link></div><div className="breakout-page-status"><span className="tracker-status"><Radar size={15} /> evaluated every 5 minutes</span><span className="ownership-note">unverified and fraud-review traffic cannot publish a breakout</span></div><BreakoutSection title="Surging now" description="Persistent breakouts with the strongest live evidence." sites={surging} /><BreakoutSection title="New breakouts" description="Watch signals that have crossed entry conditions and are building persistence." sites={watch} /><BreakoutSection title="Cooling" description="Previously active events below the entry threshold but above the resolution threshold." sites={cooling} /><BreakoutSection title="Recently resolved" description="Resolved events remain in the audit trail and return here when historical event browsing is enabled." sites={[]} />{commercialUiEnabled ? <section className="breakout-section"><SectionHeading eyebrow="SPONSORED DISTRIBUTION" title="A separate breakout sponsor" description="This labeled card sits beside signal content and is excluded from breakout eligibility and explanations." /><SponsoredBoostCard placement="breakout_sponsor" routeContext="/breakouts" /></section> : null}{provider.source === "demo" ? <div className="method-note"><Sparkles size={13} /> Breakout logic compares each site with its own baseline and applies small-base protection. It does not use paid spend.</div> : null}</div></div></AppShell>;
}
