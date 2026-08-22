"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, ChevronRight, Radio, Search, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";
import type { CategoryInfo } from "@surge/shared";
import type { DemoSite } from "../lib/demo-data";
import { getLeaderboard } from "../lib/demo-data";
import { LeaderboardCard } from "./leaderboard-card";
import { SourceBadge, SectionHeading } from "./app-shell";
import { SubmitForm } from "./submit-form";

const windows = [
  { value: "live", label: "Live" },
  { value: "24h", label: "24H" },
  { value: "7d", label: "7D" },
  { value: "breakout", label: "Breakout" },
  { value: "new", label: "New" },
];

function SignalChart() {
  return <div className="signal-chart" aria-label="Illustrative attention trend in demo mode">
    <svg viewBox="0 0 520 170" preserveAspectRatio="none" role="img">
      <defs><linearGradient id="signal-fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#ef7359" stopOpacity=".28" /><stop offset="1" stopColor="#ef7359" stopOpacity="0" /></linearGradient></defs>
      <path d="M0 148 C37 144, 46 126, 76 132 S110 103, 137 119 S177 90, 201 106 S230 73, 254 87 S282 62, 310 71 S337 92, 358 67 S389 54, 410 61 S432 31, 455 44 S480 22, 520 13 L520 170 L0 170Z" fill="url(#signal-fill)" />
      <path d="M0 148 C37 144, 46 126, 76 132 S110 103, 137 119 S177 90, 201 106 S230 73, 254 87 S282 62, 310 71 S337 92, 358 67 S389 54, 410 61 S432 31, 455 44 S480 22, 520 13" fill="none" stroke="#df6249" strokeWidth="3" strokeLinecap="round" />
      <circle cx="455" cy="44" r="5" fill="#fffdfb" stroke="#df6249" strokeWidth="3" />
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

export function HomeClient({ initialSites, categories, initialWindow = "live", initialCategory = "all", initialQuery = "" }: { initialSites: DemoSite[]; categories: CategoryInfo[]; initialWindow?: string; initialCategory?: string; initialQuery?: string }) {
  const router = useRouter();
  const [activeWindow, setActiveWindow] = useState(initialWindow);
  const [activeCategory, setActiveCategory] = useState(initialCategory);
  const query = initialQuery;
  const sites = useMemo(() => activeWindow === "live" && activeCategory === "all" && !query ? initialSites : getLeaderboard(activeWindow, activeCategory, query), [activeCategory, activeWindow, initialSites, query]);
  const topSites = sites.slice(0, 3);

  function setFilter(nextWindow: string, nextCategory = activeCategory) {
    setActiveWindow(nextWindow); setActiveCategory(nextCategory);
    const params = new URLSearchParams(); if (nextWindow !== "live") params.set("window", nextWindow); if (nextCategory !== "all") params.set("category", nextCategory); if (query) params.set("q", query); router.replace(`/?${params.toString()}`, { scroll: false });
  }

  return <>
    <section className="hero"><div className="container hero-grid">
      <div className="hero-copy"><div className="eyebrow">LIVE INTERNET ATTENTION</div><h1>Watch websites go viral in real time.</h1><p className="hero-lede">Discover fast-growing websites through verified traffic, live activity, and transparent attention metrics.</p><div className="hero-actions"><Link className="button button-coral" href="#rankings">Explore live rankings <ArrowRight size={16} /></Link><Link className="button button-quiet" href="/submit">Submit your site</Link></div><div className="hero-proof"><div className="proof-avatars"><span className="proof-avatar">LP</span><span className="proof-avatar">PF</span><span className="proof-avatar">QN</span><span className="proof-avatar">+</span></div><span>Signals from <strong>24 demo sites</strong> · fresh every few minutes</span></div></div>
      <div className="hero-live-panel"><div className="live-panel-label"><span>Attention pulse</span><span className="live-panel-status"><span className="live-dot" /> updating now</span></div><SignalChart /><div className="signal-chart-caption"><span>08:00</span><span>09:00</span><span>10:30</span></div><div className="live-panel-sites"><div className="live-mini-site"><div><strong>LaunchPilot</strong><span className="mini-rise">+218%</span></div><small>842 online · AI Tools</small></div><div className="live-mini-site"><div><strong>QueryNest</strong><span className="mini-rise">+188%</span></div><small>377 online · Dev Tools</small></div></div></div>
    </div><div className="container"><HomeSearch categoryOptions={categories} /><div className="demo-ribbon"><Sparkles size={13} /> Numbers in this preview are clearly marked <SourceBadge source="demo" compact /> <span>Production data will only appear with a connected source.</span></div></div></section>

    <section className="section" id="rankings"><div className="container"><SectionHeading eyebrow="THE LIVE BOARD" title="What is gaining attention right now?" description="Organic rank is earned from verified traffic and growth. Use the controls to change the lens, not the rules." action={<Link className="text-link" href="/rankings">View full rankings <ChevronRight size={15} /></Link>} />
      <div className="window-tabs" role="tablist" aria-label="Ranking windows">{windows.map((item) => <button className={`window-tab ${activeWindow === item.value ? "window-tab-active" : ""}`} key={item.value} onClick={() => setFilter(item.value)} role="tab" aria-selected={activeWindow === item.value}>{item.label}</button>)}</div>
      <div className="category-scroll" aria-label="Filter by category"><button className={`category-pill ${activeCategory === "all" ? "category-pill-active" : ""}`} onClick={() => setFilter(activeWindow, "all")}>All</button>{categories.map((category) => <button className={`category-pill ${activeCategory === category.slug ? "category-pill-active" : ""}`} key={category.slug} onClick={() => setFilter(activeWindow, category.slug)}>{category.name}</button>)}</div>
      {query ? <div className="search-result-note"><Search size={14} /> Showing results for <strong>{query}</strong> <button onClick={() => router.push("/")}>Clear</button></div> : null}
      {topSites.length ? <div className="featured-grid">{topSites.map((site) => <LeaderboardCard key={site.siteId} site={site} featured />)}</div> : <div className="empty-state"><span className="empty-icon"><Search size={18} /></span><h3>No sites match that search.</h3><p>Try a domain, site name, or another category. New websites can be submitted even before traffic is connected.</p><Link className="button button-quiet" href="/submit">Submit a site</Link></div>}
      <div className="activity-strip"><div className="activity-strip-label"><Radio size={15} /> Activity feed</div><div className="activity-strip-copy"><strong>LaunchPilot</strong> <span>is surging 5.4× above its usual baseline</span></div><div className="activity-strip-time">2 min ago · <SourceBadge source="demo" compact /></div></div>
    </div></section>

    <section className="section section-tight"><div className="container"><SectionHeading eyebrow="THE CASE FOR PROVENANCE" title="Earn the rank. Buy the reach." description="SurgeIndex keeps organic attention and paid distribution in separate lanes, so a spotlight can never masquerade as momentum." /><div className="signal-principle"><h2>People should be able to tell what they’re looking at.</h2><div className="signal-principle-copy"><p>Every metric has a source. Every sponsored placement says so. Every Heat Score is computed from the site’s own attention signals—not a budget.</p><div className="principle-points"><div className="principle-point"><strong>Organic</strong><span>Verified traffic, growth, and confidence earn the rank.</span></div><div className="principle-point"><strong>Boosted</strong><span>Paid exposure is useful, transparent, and never rank-changing.</span></div></div></div></div></div></section>

    <section className="section"><div className="container"><SubmitForm /></div></section>
  </>;
}
