/* eslint-disable @next/next/no-img-element -- remote thumbnails are rendered directly (lazy, sized) so the VPS never runs the image optimizer */
import Link from "next/link";
import { ArrowUpRight, Flame, MessageSquare } from "lucide-react";
import { formatCompact, formatFull, formatUtcTime } from "../../lib/trends/format";
import { getSourceMeta, TREND_SOURCES, type SourceMeta, type TrendBoard, type TrendItem, type TrendSource } from "../../lib/trends/types";
import { PlatformIcon } from "./platform-icon";
import { UpdatedPulse } from "./client";

const EXT = { target: "_blank", rel: "noopener noreferrer nofollow" } as const;

export function brandStyle(color: string): React.CSSProperties {
  return { "--brand": color } as React.CSSProperties;
}

/* ───────────────────────────── Shell ───────────────────────────── */

export function Logo() {
  return (
    <svg width="26" height="26" viewBox="0 0 32 32" aria-hidden="true">
      <defs>
        <linearGradient id="si-g" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor="#ff5a1f" />
          <stop offset=".55" stopColor="#ff2d6f" />
          <stop offset="1" stopColor="#8b6bff" />
        </linearGradient>
      </defs>
      <rect x="1" y="1" width="30" height="30" rx="9" fill="url(#si-g)" />
      <path d="M7 21.5 12.2 16l3.6 3.4L24.5 10" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="24.5" cy="10" r="2.2" fill="#fff" />
    </svg>
  );
}

export function TrendHeader({ generatedAt }: { generatedAt?: string | null }) {
  return (
    <header className="t-header">
      <div className="t-header-inner">
        <Link href="/" className="t-brand" aria-label="SurgeIndex home">
          <Logo />
          <span className="t-brand-word">SurgeIndex</span>
        </Link>
        <nav className="t-nav" aria-label="Primary">
          <Link href="/">Live</Link>
          <Link href="/top-10">All boards</Link>
          {TREND_SOURCES.filter((s) => !s.comingSoon).map((s) => (
            <Link key={s.key} href={`/top-10/${s.key}`} className="t-nav-src" style={brandStyle(s.color)}>
              {s.short}
            </Link>
          ))}
          <Link href="/methodology">Methodology</Link>
        </nav>
        <div className="t-header-meta">
          {generatedAt !== undefined ? <UpdatedPulse at={generatedAt} fallback={generatedAt ? formatUtcTime(generatedAt) : "pending"} /> : null}
        </div>
      </div>
    </header>
  );
}

export function TrendFooter() {
  return (
    <footer className="t-footer">
      <div className="t-wrap t-footer-grid">
        <div>
          <Link href="/" className="t-brand">
            <Logo />
            <span className="t-brand-word">SurgeIndex</span>
          </Link>
          <p className="t-footer-note">The internet&apos;s Top 10, refreshed every hour. Real public charts, re-ranked by how fast things are moving.</p>
        </div>
        <div className="t-footer-cols">
          <div>
            <span className="t-footer-label">Boards</span>
            {TREND_SOURCES.filter((s) => !s.comingSoon).map((s) => (
              <Link key={s.key} href={`/top-10/${s.key}`}>
                Top 10 {s.name}
              </Link>
            ))}
          </div>
          <div>
            <span className="t-footer-label">SurgeIndex</span>
            <Link href="/top-10">All boards</Link>
            <Link href="/methodology">Methodology</Link>
            <Link href="/privacy">Privacy</Link>
            <Link href="/terms">Terms</Link>
          </div>
        </div>
      </div>
      <div className="t-wrap t-footer-bottom">
        <span>© {new Date().getFullYear()} SurgeIndex</span>
        <span>Data from public Google Trends, YouTube, Reddit, Hacker News and GitHub charts. Not affiliated with any platform.</span>
      </div>
    </footer>
  );
}

export function TrendShell({ children, generatedAt }: { children: React.ReactNode; generatedAt?: string | null }) {
  return (
    <div className="t-root">
      <div className="t-bg" aria-hidden="true">
        <span className="t-orb t-orb-a" />
        <span className="t-orb t-orb-b" />
        <span className="t-orb t-orb-c" />
        <span className="t-grid" />
        <span className="t-noise" />
      </div>
      <a className="t-skip" href="#main">
        Skip to content
      </a>
      <TrendHeader generatedAt={generatedAt} />
      <main id="main" className="t-main">
        {children}
      </main>
      <TrendFooter />
    </div>
  );
}

/* ───────────────────────────── Atoms ───────────────────────────── */

export function Movement({ item }: { item: TrendItem }) {
  if (item.movement === "new") return <span className="t-move is-new" title="New on the board since the last refresh">NEW</span>;
  if (item.movement === "up" && item.prevRank) return <span className="t-move is-up" title={`Up from #${item.prevRank}`}><span aria-hidden="true">▲</span>{item.prevRank - item.rank}<span className="sr-only"> places up</span></span>;
  if (item.movement === "down" && item.prevRank) return <span className="t-move is-down" title={`Down from #${item.prevRank}`}><span aria-hidden="true">▼</span>{item.rank - item.prevRank}<span className="sr-only"> places down</span></span>;
  if (item.movement === "same") return <span className="t-move is-same" title="Same position as last refresh"><span aria-hidden="true">–</span><span className="sr-only">No change</span></span>;
  return null;
}

export function Sparkline({ history, width = 84, height = 26 }: { history: number[]; width?: number; height?: number }) {
  const pts = history.length ? history : [];
  const pad = 3;
  const x = (i: number) => (pts.length <= 1 ? width - pad : pad + (i * (width - pad * 2)) / (pts.length - 1));
  const y = (r: number) => pad + ((Math.min(Math.max(r, 1), 11) - 1) / 10) * (height - pad * 2);
  const d = pts.map((r, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(r).toFixed(1)}`).join(" ");
  const last = pts[pts.length - 1];
  const label = pts.length > 1 ? `Rank over the last ${pts.length} refreshes: ${pts.map((r) => (r > 10 ? "off" : `#${r}`)).join(", ")}` : "First appearance on this board";
  return (
    <svg className="t-spark" width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label}>
      <line x1={pad} x2={width - pad} y1={y(1)} y2={y(1)} className="t-spark-top" />
      {pts.length > 1 ? (
        <>
          <path d={`${d} L${x(pts.length - 1).toFixed(1)} ${height} L${x(0).toFixed(1)} ${height} Z`} className="t-spark-fill" />
          <path d={d} className="t-spark-line" />
        </>
      ) : null}
      {last !== undefined ? <circle cx={x(pts.length - 1)} cy={y(last)} r="2.6" className="t-spark-dot" /> : null}
    </svg>
  );
}

export function HeatMeter({ value, large = false }: { value: number; large?: boolean }) {
  const tier = value >= 80 ? "blazing" : value >= 60 ? "hot" : value >= 40 ? "warm" : "mild";
  return (
    <span className={`t-heat is-${tier} ${large ? "is-large" : ""}`} title={`Heat Score ${value}/99 — growth velocity normalized for this platform`}>
      <Flame size={large ? 15 : 12} aria-hidden="true" />
      <span className="t-heat-num">{value}</span>
      <span className="t-heat-bar" aria-hidden="true">
        <span style={{ width: `${Math.max(4, value)}%` }} />
      </span>
      <span className="sr-only">Heat Score</span>
    </span>
  );
}

export function Thumb({ item, meta, size = "sm" }: { item: TrendItem; meta: SourceMeta; size?: "sm" | "md" | "lg" }) {
  if (item.thumbnail) {
    return (
      <span className={`t-thumb is-${size}`}>
        <img src={item.thumbnail} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" width={size === "lg" ? 176 : size === "md" ? 112 : 48} height={size === "lg" ? 99 : size === "md" ? 63 : 48} />
      </span>
    );
  }
  const label = (item.subtitle ?? item.title).replace(/^r\//, "").replace(/^www\./, "");
  return (
    <span className={`t-thumb is-${size} is-mono`} style={brandStyle(meta.color)} aria-hidden="true">
      <PlatformIcon source={meta.key} size={size === "sm" ? 14 : 18} />
      {size !== "sm" ? <span>{label.slice(0, 18)}</span> : null}
    </span>
  );
}

function metricText(item: TrendItem, meta: SourceMeta): { value: string; label: string } | null {
  if (item.metric === null) return item.comments ? { value: formatCompact(item.comments), label: "comments" } : null;
  const plus = meta.key === "google-trends" ? "+" : "";
  return { value: `${formatCompact(item.metric)}${plus}`, label: meta.metricLabel };
}

/* ───────────────────────────── Rows ───────────────────────────── */

export function CompactRow({ item, meta }: { item: TrendItem; meta: SourceMeta }) {
  const metric = metricText(item, meta);
  return (
    <li className="t-crow" style={{ "--i": item.rank } as React.CSSProperties}>
      <span className={`t-crank ${item.rank <= 3 ? "is-podium" : ""}`}>{item.rank}</span>
      <Thumb item={item} meta={meta} />
      <div className="t-crow-body">
        <a className="t-crow-title" href={item.url} {...EXT}>
          {item.title}
        </a>
        <span className="t-crow-why">{item.why}</span>
      </div>
      <div className="t-crow-side">
        {metric ? (
          <span className="t-metric">
            <strong>{metric.value}</strong>
            <span>{metric.label}</span>
          </span>
        ) : null}
        <span className="t-crow-sub">
          <Movement item={item} />
          <Sparkline history={item.rankHistory} width={56} height={18} />
        </span>
      </div>
    </li>
  );
}

export function FullRow({ item, meta }: { item: TrendItem; meta: SourceMeta }) {
  const metric = metricText(item, meta);
  const longSubtitle = (item.subtitle?.length ?? 0) > 48;
  return (
    <li className="t-frow" id={`rank-${item.rank}`} style={{ "--i": item.rank } as React.CSSProperties}>
      <div className="t-frow-rank">
        <span className={`t-numeral ${item.rank === 1 ? "is-first" : ""}`}>{String(item.rank).padStart(2, "0")}</span>
        <Movement item={item} />
      </div>
      <Thumb item={item} meta={meta} size="lg" />
      <div className="t-frow-body">
        <div className="t-frow-kicker">
          {item.subtitle && !longSubtitle ? <span>{item.subtitle}</span> : null}
          {item.author && item.author !== item.subtitle ? <span>{item.author}</span> : null}
        </div>
        <h3 className="t-frow-title">
          <a href={item.url} {...EXT}>
            {item.title}
            <ArrowUpRight size={16} aria-hidden="true" className="t-ext" />
          </a>
        </h3>
        {longSubtitle ? <p className="t-desc">{item.subtitle}</p> : null}
        <p className="t-why">
          <Flame size={13} aria-hidden="true" />
          <span>{item.why}</span>
        </p>
        {item.context ? (
          <p className="t-context">
            In the news:{" "}
            {item.contextUrl ? (
              <a href={item.contextUrl} {...EXT}>
                {item.context}
              </a>
            ) : (
              item.context
            )}
          </p>
        ) : null}
        <div className="t-frow-foot">
          {(item.tags ?? []).slice(0, 3).map((t) => (
            <span key={t} className="t-tag">
              {t}
            </span>
          ))}
          {item.discussionUrl && item.discussionUrl !== item.url ? (
            <a className="t-tag is-link" href={item.discussionUrl} {...EXT}>
              <MessageSquare size={12} aria-hidden="true" /> {item.comments ? `${formatCompact(item.comments)} comments` : meta.key === "google-trends" ? "Explore trend" : "Discussion"}
            </a>
          ) : null}
        </div>
      </div>
      <div className="t-frow-stats">
        {metric ? (
          <span className="t-metric is-large" title={item.metric !== null ? `${formatFull(item.metric)} ${meta.metricLabel}` : undefined}>
            <strong>{metric.value}</strong>
            <span>{metric.label}</span>
          </span>
        ) : null}
        <HeatMeter value={item.heat} large />
        <Sparkline history={item.rankHistory} />
      </div>
    </li>
  );
}

/* ───────────────────────────── Boards ───────────────────────────── */

export function StatusChip({ board }: { board: TrendBoard }) {
  if (board.status === "live") return <span className="t-status is-live">Live</span>;
  if (board.status === "stale") return <span className="t-status is-stale" title={board.note}>Delayed</span>;
  if (board.status === "soon") return <span className="t-status is-soon">Coming soon</span>;
  return <span className="t-status is-down" title={board.note}>Unavailable</span>;
}

export function ComingSoon({ meta, note }: { meta: SourceMeta; note?: string }) {
  return (
    <div className="t-soon" style={brandStyle(meta.color)}>
      <span className="t-soon-icon">
        <PlatformIcon source={meta.key} size={28} />
      </span>
      <strong>{meta.name} Top 10 is coming soon</strong>
      <p>{meta.key === "x" ? "Real-time X trends need the paid X API. We will switch this board on in a later phase — no placeholder data in the meantime." : "We are connecting the official chart. Until then this board stays empty rather than showing anything made up."}</p>
      {note && meta.key !== "x" ? <span className="t-soon-note">{note}</span> : null}
    </div>
  );
}

export function BoardCard({ meta, boards }: { meta: SourceMeta; boards: TrendBoard[] }) {
  const multi = meta.regions.length > 1;
  return (
    <section id={`board-${meta.key}`} className="t-board" style={brandStyle(meta.color)} aria-labelledby={`board-${meta.key}-title`}>
      <div className="t-board-glow" aria-hidden="true" />
      <header className="t-board-head">
        <span className="t-board-icon">
          <PlatformIcon source={meta.key} size={18} />
        </span>
        <div className="t-board-titles">
          <h2 id={`board-${meta.key}-title`}>{meta.name}</h2>
          {boards.map((b) => (
            <span key={b.id} className="t-board-region" data-only={multi ? b.region : undefined}>
              {meta.regionLabels[b.region] ?? "Global"}
              {!multi ? <span className="t-global-hint"> · global only</span> : null}
            </span>
          ))}
        </div>
        <div className="t-board-status">
          {boards.map((b) => (
            <span key={b.id} data-only={multi ? b.region : undefined}>
              <StatusChip board={b} />
            </span>
          ))}
        </div>
      </header>
      {boards.map((b) => (
        <div key={b.id} data-only={multi ? b.region : undefined} className="t-board-body">
          {b.items.length ? (
            <ol className="t-clist">
              {b.items.slice(0, 10).map((item) => (
                <CompactRow key={item.id} item={item} meta={meta} />
              ))}
            </ol>
          ) : b.status === "soon" ? (
            <ComingSoon meta={meta} note={b.note} />
          ) : (
            <div className="t-soon" style={brandStyle(meta.color)}>
              <strong>This board is catching its breath</strong>
              <p>The last refresh could not reach {meta.name}. It will retry at the next hourly run.</p>
            </div>
          )}
          {b.status === "stale" && b.fetchedAt ? <p className="t-board-note">Showing the last good snapshot from {formatUtcTime(b.fetchedAt)}.</p> : null}
        </div>
      ))}
      {!meta.comingSoon ? (
        <footer className="t-board-foot">
          <Link href={`/top-10/${meta.key}`} className="t-board-link">
            Full {meta.short} Top 10 with heat &amp; history <ArrowUpRight size={14} aria-hidden="true" />
          </Link>
        </footer>
      ) : null}
    </section>
  );
}

/* ───────────────────────────── Ticker ───────────────────────────── */

export interface TickerEntry {
  item: TrendItem;
  source: TrendSource;
  region: string;
}

export function Ticker({ entries }: { entries: TickerEntry[] }) {
  if (!entries.length) return null;
  const track = (hidden: boolean) => (
    <ul className="t-ticker-track" aria-hidden={hidden || undefined}>
      {entries.map(({ item, source, region }) => {
        const meta = getSourceMeta(source)!;
        return (
          <li key={`${source}-${region}-${item.id}`} style={brandStyle(meta.color)}>
            <span className="t-ticker-src">
              <PlatformIcon source={source} size={13} />
              {meta.short}
              {region !== "global" ? <em>{region.toUpperCase()}</em> : null}
            </span>
            <span className="t-ticker-one">#{item.rank}</span>
            <a href={item.url} tabIndex={hidden ? -1 : undefined} {...EXT}>
              {item.title}
            </a>
            {item.metric !== null ? <span className="t-ticker-metric">{formatCompact(item.metric)}{source === "google-trends" ? "+" : ""} {meta.metricLabel}</span> : null}
          </li>
        );
      })}
    </ul>
  );
  return (
    <div className="t-ticker" role="region" aria-label="Top three right now on every platform">
      <span className="t-ticker-label">
        <span className="t-pulse-dot" aria-hidden="true" /> Trending now
      </span>
      <div className="t-ticker-viewport">
        <div className="t-ticker-move">
          {track(false)}
          {track(true)}
        </div>
      </div>
    </div>
  );
}

/* ───────────────────────────── SEO ───────────────────────────── */

export function JsonLd({ data }: { data: unknown }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }} />;
}

export function itemListJsonLd(name: string, url: string, items: TrendItem[]) {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name,
    url,
    numberOfItems: items.length,
    itemListOrder: "https://schema.org/ItemListOrderAscending",
    itemListElement: items.map((i) => ({ "@type": "ListItem", position: i.rank, name: i.title, url: i.url })),
  };
}
