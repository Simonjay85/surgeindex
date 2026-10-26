import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight, Gauge, History, Radar } from "lucide-react";
import { RegionScope, RegionToggle, PlatformTabs, UpdatedPulse } from "../components/trends/client";
import { PlatformIcon } from "../components/trends/platform-icon";
import { BoardCard, brandStyle, HeatMeter, JsonLd, Ticker, TrendShell, type TickerEntry } from "../components/trends/ui";
import { formatUtcTime } from "../lib/trends/format";
import { findBoard, getLatestSnapshot, hottestAcross } from "../lib/trends/read";
import { getSourceMeta, TREND_SOURCES, type TrendBoard } from "../lib/trends/types";

export const revalidate = 300;

const TITLE = "SurgeIndex — The internet's Top 10, updated every hour";
const DESCRIPTION = "What is hot on the internet right now: hourly Top 10s from Google Trends, YouTube, Reddit, Hacker News and GitHub, ranked by Heat Score — how fast each item is surging.";

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  alternates: { canonical: "/" },
  openGraph: { title: TITLE, description: DESCRIPTION, type: "website", url: "/", images: [{ url: "/opengraph-image", width: 1200, height: 630 }] },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION, images: ["/opengraph-image"] },
};

export default async function HomePage() {
  const snapshot = await getLatestSnapshot();
  const generatedAt = snapshot?.generatedAt ?? null;
  const boards = snapshot?.boards ?? [];
  const liveBoards = boards.filter((b) => (b.status === "live" || b.status === "stale") && b.items.length);
  const liveSources = new Set(liveBoards.map((b) => b.source));
  const tracked = liveBoards.reduce((n, b) => n + b.items.length, 0);

  // Ticker: the top three of every board (global and Vietnam), interleaved by rank.
  const ticker: TickerEntry[] = [];
  for (let rank = 0; rank < 3; rank++) {
    for (const meta of TREND_SOURCES) {
      for (const region of meta.regions) {
        const item = findBoard(snapshot, meta.key, region)?.items[rank];
        if (item) ticker.push({ item, source: meta.key, region });
      }
    }
  }
  const leaders = TREND_SOURCES.map((meta) => ({ meta, board: findBoard(snapshot, meta.key) })).filter((l) => l.board && l.board.items.length);
  const hottest = hottestAcross(snapshot, 3);

  const tabs = TREND_SOURCES.map((s) => ({ id: `board-${s.key}`, label: s.short, color: s.color, icon: <PlatformIcon source={s.key} size={14} /> }));

  return (
    <TrendShell generatedAt={generatedAt}>
      <JsonLd data={{ "@context": "https://schema.org", "@type": "WebSite", name: "SurgeIndex", url: process.env.NEXT_PUBLIC_APP_URL ?? "https://surgeindex.lol", description: DESCRIPTION }} />
      <section className="t-hero">
        <div className="t-wrap t-hero-grid">
          <div className="t-hero-copy">
          <div className="t-eyebrow">
            <span className="t-pulse-dot" aria-hidden="true" />
            Live · {liveSources.size} platforms · hourly
          </div>
          <h1 className="t-display">
            The internet&apos;s <em>Top&nbsp;10</em>,
            <br />
            every hour.
          </h1>
          <p className="t-lede">One glance at what is surging on Google, YouTube, Reddit, Hacker News and GitHub — ranked by how fast it is moving, not just how big it already is.</p>
          </div>
          {leaders.length ? (
            <aside className="t-leaders" aria-labelledby="leaders-title">
              <div className="t-leaders-head">
                <span id="leaders-title">
                  <span className="t-pulse-dot" aria-hidden="true" /> #1 on every platform
                </span>
                <span className="t-leaders-time">{generatedAt ? formatUtcTime(generatedAt) : ""}</span>
              </div>
              <ol>
                {leaders.map(({ meta, board }) => {
                  const top = board!.items[0]!;
                  return (
                    <li key={meta.key} style={brandStyle(meta.color)}>
                      <span className="t-leaders-icon">
                        <PlatformIcon source={meta.key} size={15} />
                      </span>
                      <div className="t-leaders-body">
                        <span className="t-leaders-src">{meta.name}</span>
                        <a href={top.url} target="_blank" rel="noopener noreferrer nofollow">
                          {top.title}
                        </a>
                      </div>
                      <HeatMeter value={top.heat} />
                    </li>
                  );
                })}
              </ol>
              <Link href="/top-10" className="t-leaders-foot">
                Every board <ArrowUpRight size={13} aria-hidden="true" />
              </Link>
            </aside>
          ) : null}
          <dl className="t-hero-stats">
            <div>
              <dt>Trends tracked</dt>
              <dd>{tracked}</dd>
            </div>
            <div>
              <dt>Live boards</dt>
              <dd>
                {liveSources.size}
                <span>/{TREND_SOURCES.length}</span>
              </dd>
            </div>
            <div>
              <dt>Regions</dt>
              <dd className="is-text">Global + Vietnam</dd>
            </div>
            <div>
              <dt>Last refresh</dt>
              <dd className="is-text">
                <UpdatedPulse at={generatedAt} label="" fallback={generatedAt ? formatUtcTime(generatedAt) : "pending"} />
              </dd>
            </div>
          </dl>
        </div>
      </section>

      <Ticker entries={ticker} />

      {hottest.length ? (
        <section className="t-wrap t-section" aria-labelledby="spotlight-title">
          <div className="t-section-head">
            <div>
              <span className="t-kicker">Surge spotlight</span>
              <h2 id="spotlight-title" className="t-h2">
                Moving fastest <em>right now</em>
              </h2>
            </div>
            <p className="t-section-note">The single hottest item on each platform, ranked against each other by Heat Score.</p>
          </div>
          <div className="t-spotlight">
            {hottest.map(({ item, board }, index) => (
              <SpotlightCard key={board.id} board={board} index={index} itemId={item.id} />
            ))}
          </div>
        </section>
      ) : null}

      <RegionScope className="t-section">
        <PlatformTabs tabs={tabs}>
          <RegionToggle compact />
        </PlatformTabs>
        <div className="t-wrap">
          <div className="t-section-head is-tight">
            <div>
              <span className="t-kicker">Every board</span>
              <h2 className="t-h2">
                Ten per platform. <em>No filler.</em>
              </h2>
            </div>
            <p className="t-section-note">Switch to Vietnam to see local Google searches and YouTube charts. Boards without a local chart stay global.</p>
          </div>
          <div className="t-boards">
            {TREND_SOURCES.map((meta) => {
              const bs = meta.regions.map((r) => findBoard(snapshot, meta.key, r)).filter((b): b is TrendBoard => Boolean(b));
              const fallback: TrendBoard[] = bs.length ? bs : [{ id: meta.key, source: meta.key, region: "global", status: meta.comingSoon ? "soon" : "unavailable", fetchedAt: null, items: [] }];
              return <BoardCard key={meta.key} meta={meta} boards={fallback} />;
            })}
          </div>
        </div>
      </RegionScope>

      <section className="t-wrap t-section" aria-labelledby="how-title">
        <div className="t-how">
          <div className="t-how-intro">
            <span className="t-kicker">How it works</span>
            <h2 id="how-title" className="t-h2">
              Heat, <em>not hype.</em>
            </h2>
            <p>Every hour we read each platform&apos;s own public chart, compare it with the hour before and score how fast each item is climbing on its home turf.</p>
            <Link href="/methodology" className="t-button">
              Read the methodology <ArrowUpRight size={15} aria-hidden="true" />
            </Link>
          </div>
          <ul className="t-how-grid">
            <li>
              <Radar size={20} aria-hidden="true" />
              <strong>Real charts only</strong>
              <span>Official APIs and public feeds. If a source is down, the board says so — we never invent rows.</span>
            </li>
            <li>
              <Gauge size={20} aria-hidden="true" />
              <strong>Velocity-weighted</strong>
              <span>Heat Score blends growth per hour, chart position and momentum, normalized per platform.</span>
            </li>
            <li>
              <History size={20} aria-hidden="true" />
              <strong>Daily archive</strong>
              <span>Every board keeps a dated archive so you can see what the internet cared about on any day.</span>
            </li>
          </ul>
        </div>
      </section>
    </TrendShell>
  );
}

function SpotlightCard({ board, index, itemId }: { board: TrendBoard; index: number; itemId: string }) {
  const meta = getSourceMeta(board.source)!;
  const item = board.items.find((i) => i.id === itemId)!;
  return (
    <article className={`t-spot ${index === 0 ? "is-lead" : ""}`} style={brandStyle(meta.color)}>
      {item.thumbnail ? (
        // eslint-disable-next-line @next/next/no-img-element -- remote thumbnail rendered directly to keep the server light
        <img className="t-spot-bg" src={item.thumbnail} alt="" loading={index === 0 ? "eager" : "lazy"} decoding="async" referrerPolicy="no-referrer" />
      ) : null}
      <div className="t-spot-shade" aria-hidden="true" />
      <div className="t-spot-top">
        <span className="t-chip">
          <PlatformIcon source={meta.key} size={13} /> {meta.name}
        </span>
        <span className="t-spot-rank">#{item.rank} on the board</span>
      </div>
      <span className="t-spot-numeral" aria-hidden="true">
        {item.heat}
      </span>
      <div className="t-spot-body">
        <h3>
          <a href={item.url} target="_blank" rel="noopener noreferrer nofollow">
            {item.title}
          </a>
        </h3>
        <p>{item.why}</p>
        <div className="t-spot-foot">
          <HeatMeter value={item.heat} large />
          <Link href={`/top-10/${meta.key}`} className="t-spot-link">
            {meta.short} Top 10 <ArrowUpRight size={13} aria-hidden="true" />
          </Link>
        </div>
      </div>
    </article>
  );
}
