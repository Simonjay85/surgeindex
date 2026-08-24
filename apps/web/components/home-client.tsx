"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, ChevronRight, Gavel, HeartHandshake, Radio, Search, Sparkles } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { CategoryInfo, TimeseriesPoint } from "@surge/shared";
import type { DemoSite } from "../lib/demo-data";
import { getLeaderboard, getTimeseries } from "../lib/demo-data";
import { LeaderboardCard } from "./leaderboard-card";
import { RankMomentumShowcase } from "./rank-momentum-showcase";
import { DataModeBadge, SectionHeading, SourceBadge } from "./app-shell";
import { SubmitForm } from "./submit-form";
import { SponsoredBoostCard } from "./sponsored-boost-card";

const windows = [
  { value: "live", label: "Live" },
  { value: "24h", label: "24H" },
  { value: "7d", label: "7D" },
  { value: "breakout", label: "Breakout" },
  { value: "new", label: "New" },
];

function formatPulseTime(value: string) {
  if (!value.includes("T")) return value;
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return value;
  const date = new Date(timestamp);
  return `${String(date.getUTCHours()).padStart(2, "0")}:${String(date.getUTCMinutes()).padStart(2, "0")}`;
}

function getSignalChartGeometry(points: TimeseriesPoint[]) {
  const usable = points.filter((point) => Number.isFinite(point.value));
  if (usable.length < 2) return null;

  const width = 520;
  const height = 170;
  const padding = 13;
  const values = usable.map((point) => point.value);
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  const range = maximum - minimum || 1;
  const coordinates = usable.map((point, index) => ({
    x: (index / (usable.length - 1)) * width,
    y: padding + (1 - (point.value - minimum) / range) * (height - padding * 2),
  }));
  const line = coordinates
    .map((point, index) => `${index === 0 ? "M" : "L"}${point.x.toFixed(2)} ${point.y.toFixed(2)}`)
    .join(" ");
  return {
    line,
    area: `${line} L${width} ${height} L0 ${height} Z`,
    last: coordinates[coordinates.length - 1],
  };
}

function SignalChart({ points, isDemo }: { points: TimeseriesPoint[]; isDemo: boolean }) {
  const geometry = getSignalChartGeometry(points);
  if (!geometry) {
    return <div className="signal-chart signal-chart-empty" role="status">No measured attention series yet.</div>;
  }

  const gradientId = `signal-fill-${isDemo ? "demo" : "production"}`;
  return <div className="signal-chart" aria-label={`${isDemo ? "Demo" : "Persisted"} attention trend from the index`}>
    <svg viewBox="0 0 520 170" preserveAspectRatio="none" role="img" aria-label={`${isDemo ? "Demo" : "Persisted"} attention pulse`}>
      <defs><linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#ef7359" stopOpacity=".28" /><stop offset="1" stopColor="#ef7359" stopOpacity="0" /></linearGradient></defs>
      <path d={geometry.area} fill={`url(#${gradientId})`} />
      <path d={geometry.line} fill="none" stroke="#df6249" strokeWidth="3" strokeLinecap="round" />
      <circle cx={geometry.last.x} cy={geometry.last.y} r="5" fill="#fffdfb" stroke="#df6249" strokeWidth="3" />
    </svg>
  </div>;
}

function HomeSearch({ categoryOptions }: { categoryOptions: CategoryInfo[] }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  return <form className="search-submit-wrap" onSubmit={(event) => { event.preventDefault(); const params = new URLSearchParams(); if (query.trim()) params.set("q", query.trim()); if (category !== "all") params.set("category", category); router.push(`/?${params.toString()}`); }}>
    <label className="sr-only" htmlFor="homepage-search">Website URL or domain</label><input id="homepage-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Enter a website URL or search a site" />
    <label className="sr-only" htmlFor="homepage-category">Category</label><select id="homepage-category" value={category} onChange={(event) => setCategory(event.target.value)}><option value="all">All categories</option>{categoryOptions.map((item) => <option key={item.slug} value={item.slug}>{item.name}</option>)}</select>
    <button className="button button-coral" type="submit"><Search size={16} /> Find a site</button>
  </form>;
}

function ProductLanes() {
  return <section className="section section-product-lanes"><div className="container">
    <SectionHeading title="Two ways to take part in the moment." description="The public board shows earned attention. These product lanes make the next action visible without mixing paid reach into organic rank." />
    <div className="product-lanes-grid">
      <Link className="product-lane-card product-lane-card-featured" href="/bid-the-moment">
        <div className="product-lane-top"><span className="product-lane-icon"><Gavel size={20} /></span><span className="status-chip status-active">Preview now</span></div>
        <div><h3>Bid the Moment</h3><p>Reserve a transparent spotlight when the right audience is gathering. The existing Boost flow measures delivery separately and never changes organic rank.</p></div>
        <div className="product-lane-footer"><span>Open the preview</span><ArrowRight size={16} /></div>
      </Link>
      <Link className="product-lane-card" href="/fanward">
        <div className="product-lane-top"><span className="product-lane-icon product-lane-icon-muted"><HeartHandshake size={20} /></span><span className="status-chip status-completed">Coming soon</span></div>
        <div><h3>Fanward</h3><p>A future fan and creator layer for measurable attention. This surface stays in waitlist mode while the product rules are being finalized.</p></div>
        <div className="product-lane-footer"><span>See the preview</span><ArrowRight size={16} /></div>
      </Link>
    </div>
  </div></section>;
}

export function HomeClient({ initialSites, heroPulse, categories, isDemo, initialWindow = "live", initialCategory = "all", initialQuery = "" }: { initialSites: DemoSite[]; heroPulse: TimeseriesPoint[]; categories: CategoryInfo[]; isDemo: boolean; initialWindow?: string; initialCategory?: string; initialQuery?: string }) {
  const router = useRouter();
  const [activeWindow, setActiveWindow] = useState(initialWindow);
  const [activeCategory, setActiveCategory] = useState(initialCategory);
  const query = initialQuery;
  const [productionSites, setProductionSites] = useState<DemoSite[]>(initialSites);
  const [pulse, setPulse] = useState<TimeseriesPoint[]>(heroPulse);
  useEffect(() => {
    if (isDemo) return;
    const controller = new AbortController();
    const params = new URLSearchParams({ window: activeWindow, category: activeCategory, q: query });
    fetch(`/api/leaderboard?${params.toString()}`, { headers: { accept: "application/json" }, cache: "no-store", signal: controller.signal })
      .then((response) => response.ok ? response.json() as Promise<{ data: DemoSite[] }> : Promise.reject(new Error("leaderboard_request_failed")))
      .then((payload) => setProductionSites(payload.data))
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === "AbortError")) setProductionSites([]);
      });
    return () => controller.abort();
  }, [activeCategory, activeWindow, isDemo, query]);
  const sites = useMemo(() => isDemo ? (activeWindow === "live" && activeCategory === "all" && !query ? initialSites : getLeaderboard(activeWindow, activeCategory, query)) : productionSites, [activeCategory, activeWindow, initialSites, isDemo, productionSites, query]);
  const topSites = sites.slice(0, 3);
  const pulseSiteSlug = topSites[0]?.slug;
  const displayedPulse = isDemo
    ? (pulseSiteSlug ? getTimeseries(pulseSiteSlug, "visitors") : [])
    : (pulseSiteSlug ? pulse : []);

  useEffect(() => {
    if (isDemo || !pulseSiteSlug) return;
    const controller = new AbortController();
    fetch(`/api/sites/${encodeURIComponent(pulseSiteSlug)}/timeseries?metric=visitors`, {
      headers: { accept: "application/json" },
      cache: "no-store",
      signal: controller.signal,
    })
      .then((response) => response.ok ? response.json() as Promise<{ data: TimeseriesPoint[] }> : Promise.reject(new Error("timeseries_request_failed")))
      .then((payload) => setPulse(payload.data))
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === "AbortError")) setPulse([]);
      });
    return () => controller.abort();
  }, [isDemo, pulseSiteSlug]);

  function setFilter(nextWindow: string, nextCategory = activeCategory) {
    setActiveWindow(nextWindow); setActiveCategory(nextCategory);
    const params = new URLSearchParams(); if (nextWindow !== "live") params.set("window", nextWindow); if (nextCategory !== "all") params.set("category", nextCategory); if (query) params.set("q", query); router.replace(`/?${params.toString()}`, { scroll: false });
  }

  const initials = topSites.map((site) => site.name.trim().slice(0, 2).toUpperCase() || "?");
  const heroSites = topSites.slice(0, 2);
  const activitySite = sites.find((site) => site.rankMovement !== 0) ?? topSites[0];
  const activityDetail = activitySite
    ? `${activitySite.rankMovement > 0 ? "rank rise" : activitySite.rankMovement < 0 ? "rank drop" : "rank update"} recorded from the index`
    : "updates from persisted site events";

  return <>
    <section className="hero hero-cinematic"><div className="container hero-grid hero-grid-cinematic">
      <div className="hero-copy"><h1>Watch websites go viral in real time.</h1><p className="hero-lede">Discover fast-growing websites through verified traffic, live activity, and transparent attention metrics.</p><div className="hero-actions"><Link className="button button-coral" href="#rankings">Explore live rankings <ArrowRight size={16} /></Link><Link className="button button-quiet" href="/submit">Submit your site</Link></div><div className="hero-proof"><div className="proof-avatars" aria-hidden="true">{initials.length ? initials.map((initial, index) => <span className="proof-avatar" key={`${initial}-${index}`}>{initial}</span>) : null}<span className="proof-avatar">{initials.length ? `+${Math.max(0, sites.length - initials.length)}` : "—"}</span></div><span>{isDemo ? "Demo signals from fixture sites" : "Signals from persisted public sites"} · refreshed from the index</span></div></div>
      <div className="hero-live-panel"><div className="live-panel-label"><span>{topSites[0] ? `${topSites[0].name} attention pulse` : "Attention pulse"}</span><span className="live-panel-status"><span className="live-dot" /> {topSites[0] ? <SourceBadge source={topSites[0].verification === "unverified" ? "unverified" : topSites[0].verification} compact /> : <DataModeBadge isDemo={isDemo} compact />}</span></div><SignalChart points={displayedPulse} isDemo={isDemo} /><div className="signal-chart-caption">{displayedPulse.length ? [displayedPulse[0], displayedPulse[Math.floor((displayedPulse.length - 1) / 2)], displayedPulse[displayedPulse.length - 1]].filter((point, index, points) => points.findIndex((candidate) => candidate.t === point.t) === index).map((point) => <span key={point.t}>{formatPulseTime(point.t)}</span>) : <span>No measured timestamps</span>}</div><div className="live-panel-sites">{heroSites.length ? heroSites.map((site) => <div className="live-mini-site" key={site.siteId}><div><strong>{site.name}</strong><span className={`mini-rise ${site.rankMovement < 0 ? "is-down" : ""}`}>{site.growthPct == null ? "—" : `${site.growthPct > 0 ? "+" : ""}${site.growthPct.toFixed(1)}%`}</span></div><small>{site.activeNow == null ? "No live count" : `${new Intl.NumberFormat("en-US").format(site.activeNow)} active now`} · {site.categoryName} · {site.verification === "unverified" ? "unverified source" : site.verification.toUpperCase()}</small></div>) : <div className="live-mini-site"><div><strong>No sites in the public index yet.</strong></div><small>Measured attention will appear here when available.</small></div>}</div></div>
    </div><div className="container"><HomeSearch categoryOptions={categories} /><div className="demo-ribbon">{isDemo ? <><Sparkles size={13} /> Numbers in this preview are clearly marked <DataModeBadge isDemo compact /> <span>Production data will only appear with a connected source.</span></> : <><DataModeBadge isDemo={false} compact /> <span>Only persisted production records are shown.</span></>}</div></div></section>

    <section className="section" id="rankings"><div className="container"><div className="eyebrow">THE LIVE BOARD</div><SectionHeading title="What is gaining attention right now?" description="Organic rank is earned from verified traffic and growth. Use the controls to change the lens, not the rules." action={<Link className="text-link" href="/rankings">View full rankings <ChevronRight size={15} /></Link>} />
      <div className="window-tabs" role="tablist" aria-label="Ranking windows">{windows.map((item) => <button className={`window-tab ${activeWindow === item.value ? "window-tab-active" : ""}`} key={item.value} onClick={() => setFilter(item.value)} role="tab" aria-selected={activeWindow === item.value}>{item.label}</button>)}</div>
      <div className="category-scroll" aria-label="Filter by category"><button className={`category-pill ${activeCategory === "all" ? "category-pill-active" : ""}`} onClick={() => setFilter(activeWindow, "all")}>All</button>{categories.map((category) => <button className={`category-pill ${activeCategory === category.slug ? "category-pill-active" : ""}`} key={category.slug} onClick={() => setFilter(activeWindow, category.slug)}>{category.name}</button>)}</div>
      {query ? <div className="search-result-note"><Search size={14} /> Showing results for <strong>{query}</strong> <button onClick={() => router.push("/")}>Clear</button></div> : null}
      {topSites.length ? <div className="featured-grid">{topSites.map((site) => <LeaderboardCard key={site.siteId} site={site} featured />)}</div> : <div className="empty-state"><span className="empty-icon"><Search size={18} /></span>{query || activeCategory !== "all" ? <><h3>No sites match that search.</h3><p>Try a domain, site name, or another category. New websites can be submitted even before traffic is connected.</p></> : <><h3>The public board is getting started.</h3><p>{isDemo ? "This preview has no sites in the selected view yet. Try another ranking window, or submit a site to explore the workflow." : "No persisted sites are available yet. Submit a site to start the board; verified traffic can be connected after review."}</p></>}<Link className="button button-quiet" href="/submit">Submit a site</Link></div>}
      <div className="activity-strip"><div className="activity-strip-label"><Radio size={15} /> Activity feed</div><div className="activity-strip-copy"><strong>{activitySite?.name ?? "Public index"}</strong> <span>{activityDetail}</span></div><div className="activity-strip-time"><DataModeBadge isDemo={isDemo} compact /></div></div>
    </div></section>

    <RankMomentumShowcase sites={sites} isDemo={isDemo} />

    <section className="section section-tight" aria-label="Sponsored distribution"><div className="container"><SectionHeading title="Sponsored distribution" description="A separate paid lane. Qualified delivery is reported independently from the organic board." /><SponsoredBoostCard placement="homepage_boosted" /></div></section>

    <ProductLanes />

    <section className="section section-tight"><div className="container"><SectionHeading title="Earn the rank. Buy the reach." description="SurgeIndex keeps organic attention and paid distribution in separate lanes, so a spotlight can never masquerade as momentum." /><div className="signal-principle"><h2>People should be able to tell what they’re looking at.</h2><div className="signal-principle-copy"><p>Every metric has a source. Every sponsored placement says so. Every Heat Score is computed from the site’s own attention signals—not a budget.</p><div className="principle-points"><div className="principle-point"><strong>Organic</strong><span>Verified traffic, growth, and confidence earn the rank.</span></div><div className="principle-point"><strong>Boosted</strong><span>Paid exposure is useful, transparent, and never rank-changing.</span></div></div></div></div></div></section>

    <section className="section"><div className="container"><SubmitForm /></div></section>
  </>;
}
