import Link from "next/link";
import { ArrowDownRight, ArrowUpRight, ExternalLink, Minus, MoveUpRight } from "lucide-react";
import type { DemoSite } from "../lib/demo-data";
import { formatCount, formatPct } from "@surge/shared";
import { SiteMark } from "./site-mark";
import { DataModeBadge, SourceBadge } from "./app-shell";
import { Sparkline } from "./sparkline";

function RankMove({ movement }: { movement: number }) {
  if (!movement) return <span className="rank-move rank-flat"><Minus size={12} /> flat</span>;
  const up = movement > 0;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return <span className={`rank-move ${up ? "rank-up" : "rank-down"}`}><Icon size={13} />{Math.abs(movement)}</span>;
}

export function RankSummary({ site, featured = false }: { site: DemoSite; featured?: boolean }) {
  const hasScore = site.isDemo || site.heatScore > 0;
  return <div className={`rank-summary ${featured ? "rank-summary-featured" : ""}`}><div className="rank-number">{site.rank > 0 && hasScore ? `#${site.rank}` : "—"}</div><RankMove movement={hasScore ? site.rankMovement : 0} /><SiteMark site={site} size={featured ? "large" : "default"} /><div className="rank-summary-copy"><Link href={`/site/${site.slug}`} className="site-name-link">{site.name}</Link><span>{site.domain}</span></div><span className="category-chip">{site.categoryName}</span><div className="summary-score"><span>Heat</span><strong>{hasScore ? site.heatScore : "—"}</strong></div></div>;
}

export function LeaderboardCard({ site, featured = false }: { site: DemoSite; featured?: boolean }) {
  const source = site.verification === "unverified" ? "unverified" : site.verification;
  const hasScore = site.isDemo || site.heatScore > 0;
  return <article className={`leaderboard-card ${featured ? "leaderboard-card-featured" : ""}`}>
    <div className="leaderboard-card-top"><div className="rank-label"><span>{site.rank > 0 && hasScore ? `#${site.rank}` : "—"}</span><RankMove movement={hasScore ? site.rankMovement : 0} /></div><span className="freshness"><span className="freshness-dot" /> {site.isDemo ? "updated 3m ago" : site.lastAcceptedEventAt ? "tracker measured" : "building baseline"}</span></div>
    <div className="leaderboard-site-head"><SiteMark site={site} size={featured ? "large" : "default"} /><div className="leaderboard-site-title"><Link href={`/site/${site.slug}`}><h3>{site.name}</h3></Link><span>{site.domain}</span></div><span className="category-chip">{site.categoryName}</span></div>
    <p className="leaderboard-description">{site.description}</p>
    <div className="source-row"><SourceBadge source={source} />{site.isDemo ? <DataModeBadge isDemo compact /> : null}<span className="ownership-note">{site.ownership === "claimed" ? "Claimed" : "Unclaimed"}</span></div>
    <div className="leaderboard-metrics">
      <div className="score-metric"><span>Heat score</span><strong>{hasScore ? site.heatScore : "—"}</strong><div className="score-meter"><span style={{ width: `${hasScore ? site.heatScore : 0}%` }} /></div></div>
      <div className="compact-metric"><span>{site.activeNow !== null ? "Online now" : "Visitors / 24H"}</span><strong>{site.activeNow !== null ? formatCount(site.activeNow) : formatCount(site.visitors)}</strong><small>{site.activeNow !== null ? source === "tracker" ? "Tracker signal" : "Not live data" : source === "unverified" ? "Not connected" : "Verified window"}</small></div>
      <div className="compact-metric"><span>Growth / 24H</span><strong className={site.growthPct && site.growthPct > 0 ? "metric-positive" : ""}>{site.growthPct === null ? "—" : formatPct(site.growthPct)}</strong><small>{site.growthPct === null ? "Needs verification" : "vs own baseline"}</small></div>
      <div className="spark-metric"><span>Attention trend</span><Sparkline values={site.sparkline} /><small>last 12 points</small></div>
    </div>
    <div className="leaderboard-card-bottom"><span className="referrals"><MoveUpRight size={14} /> {formatCount(site.surgeReferrals)} referrals <em>SurgeIndex Referral</em></span><div className="card-actions"><Link className="text-link" href={`/site/${site.slug}`}>View profile <ArrowUpRight size={14} /></Link><Link className="visit-link" href={`/go/${site.slug}`} prefetch={false} target="_blank" rel="noreferrer">Visit <ExternalLink size={13} /></Link></div></div>
  </article>;
}

export function CompactRankingRow({ site }: { site: DemoSite }) {
  const source = site.verification === "unverified" ? "unverified" : site.verification;
  const hasScore = site.isDemo || site.heatScore > 0;
  return <article className="ranking-row"><div className="row-rank">{site.rank > 0 && hasScore ? `#${site.rank}` : "—"}</div><RankMove movement={hasScore ? site.rankMovement : 0} /><SiteMark site={site} size="small" /><div className="row-site"><Link href={`/site/${site.slug}`}>{site.name}</Link><span>{site.domain}</span></div><span className="category-chip row-category">{site.categoryName}</span><div className="row-stat"><small>Heat</small><strong>{hasScore ? site.heatScore : "—"}</strong></div><div className="row-stat row-visitors"><small>{site.activeNow !== null ? "Online" : "Visitors"}</small><strong>{site.activeNow !== null ? formatCount(site.activeNow) : formatCount(site.visitors)}</strong></div><div className="row-growth"><strong>{site.growthPct === null ? "—" : formatPct(site.growthPct)}</strong><small>{site.growthPct === null ? "Unverified" : "24H growth"}</small></div><SourceBadge source={source} compact /><Sparkline values={site.sparkline} width={76} height={30} /><Link className="row-arrow" href={`/site/${site.slug}`} aria-label={`View ${site.name}`}><ArrowUpRight size={17} /></Link></article>;
}
