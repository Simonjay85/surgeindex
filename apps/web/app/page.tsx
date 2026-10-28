import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight, Gauge, History, Radar } from "lucide-react";
import { RegionScope, RegionToggle, PlatformTabs, UpdatedPulse } from "../components/trends/client";
import { PlatformIcon } from "../components/trends/platform-icon";
import { LiveSourceCount } from "../components/trends/freshness";
import { BoardCard, brandStyle, HeatMeter, JsonLd, StatusChip, Ticker, TrendShell, type TickerEntry } from "../components/trends/ui";
import { formatUtcTime } from "../lib/trends/format";
import { findBoard, getLatestSnapshot, hottestAcross } from "../lib/trends/read";
import { boardId, externalRel, getSourceMeta, primaryRegion, TREND_SOURCES, type TrendBoard } from "../lib/trends/types";

export const revalidate = 300;

const TITLE = "SurgeIndex — The internet's Top 10, updated every hour";
const DESCRIPTION = "Explore Top 10 boards from public charts and feeds, with source-specific rankings and a separate Heat Score based on available signals.";

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
  const primaryBoards = TREND_SOURCES.map((meta) => findBoard(snapshot, meta.key, primaryRegion(meta))).filter((b): b is TrendBoard => Boolean(b));
  const activePrimaryBoards = primaryBoards.filter((b) => b.items.length).map(({ status, fetchedAt }) => ({ status, fetchedAt }));
  const tracked = liveBoards.reduce((n, b) => n + b.items.length, 0);

  // Ticker: the top three of every board (global and Vietnam), interleaved by rank.
  const ticker: TickerEntry[] = [];
  for (let rank = 0; rank < 3; rank++) {
    for (const meta of TREND_SOURCES) {
      for (const region of meta.regions) {
        const board = findBoard(snapshot, meta.key, region);
        const item = board?.items[rank];
        if (board && item) ticker.push({ item, source: meta.key, region, board });
      }
    }
  }
  const leaders = TREND_SOURCES.map((meta) => ({ meta, board: findBoard(snapshot, meta.key, primaryRegion(meta)) })).filter((l) => l.board && l.board.items.length);
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
            Hourly snapshots · <LiveSourceCount boards={activePrimaryBoards} /> live platforms
          </div>
          <h1 className="t-display">
            The internet&apos;s <em>Top&nbsp;10</em>,
            <br />
            every hour.
          </h1>
          <p className="t-lede">Explore public charts and feeds from Google, YouTube, Wikipedia, Reddit, Hacker News, GitHub, Amazon and eBay. Each board has its own order; Heat Score adds a separate signal.</p>
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
                        <div className="t-leaders-meta">
                          <span className="t-leaders-src">{meta.name}</span>
                          <StatusChip board={board!} showTime compact />
                        </div>
                        <a href={top.url} target="_blank" rel={externalRel(meta)}>
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
              <dt>Live platforms</dt>
              <dd>
                <LiveSourceCount boards={activePrimaryBoards} />
                <span>/{TREND_SOURCES.length}</span>
              </dd>
            </div>
            <div>
              <dt>Regions</dt>
              <dd className="is-text">Global + Vietnam</dd>
            </div>
            <div>
              <dt>Snapshot assembled</dt>
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
                Spotlight by <em>Heat Score</em>
              </h2>
            </div>
            <p className="t-section-note">The highest-scoring item from selected global boards. Scores use different source signals and are not direct comparisons of growth across platforms.</p>
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
            <p className="t-section-note">Switch to Vietnam to see local Google searches, YouTube charts and Vietnamese Wikipedia. Boards without a local chart stay global.</p>
          </div>
          <div className="t-boards">
            {TREND_SOURCES.map((meta) => {
              const bs: TrendBoard[] = meta.regions.map((region) => findBoard(snapshot, meta.key, region) ?? {
                id: boardId(meta.key, region), source: meta.key, region, status: meta.comingSoon ? "soon" : "unavailable", fetchedAt: null, items: [],
              });
              return <BoardCard key={meta.key} meta={meta} boards={bs} />;
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
            <p>We check public charts and feeds hourly and compare available snapshots. Each board explains how its positions are determined.</p>
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
              <strong>Signals, with context</strong>
              <span>Heat Score combines position, movement and available growth signals or proxies. Some sources lack growth data.</span>
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
        <StatusChip board={board} showTime />
      </div>
      <span className="t-spot-numeral" aria-hidden="true">
        {item.heat}
      </span>
      <div className="t-spot-body">
        <h3>
          <a href={item.url} target="_blank" rel={externalRel(meta)}>
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
