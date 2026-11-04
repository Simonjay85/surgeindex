import Link from "next/link";
import { ArrowLeft, ArrowRight, ArrowUpRight, CalendarDays } from "lucide-react";
import { formatLongDate, formatShortDate, formatUtcTime } from "../../lib/trends/format";
import { TREND_SOURCES, type SourceMeta, type TrendBoard } from "../../lib/trends/types";
import { RegionScope, RegionToggle } from "./client";
import { PlatformIcon } from "./platform-icon";
import { boardMeta, BoardSourceNote, brandStyle, ComingSoon, FullRow, StatusChip } from "./ui";

const ORDER_EXPLANATION: Partial<Record<SourceMeta["key"], string>> = {
  "google-trends": "SurgeIndex sorts Google Trends entries by the reported search-volume bucket, then recency.",
  news: "SurgeIndex groups related articles and sorts stories by the number of outlets and recency.",
  youtube: "Positions follow YouTube's Most Popular chart for the selected region.",
  wikipedia: "Positions follow the Wikimedia most-read list after non-article pages and obvious bot spikes are filtered.",
  reddit: "Positions follow Reddit's r/all hot listing.",
  hackernews: "Positions follow the Hacker News top-stories listing.",
  github: "Positions follow GitHub's daily trending list.",
  amazon: "Positions combine Amazon department charts: Movers & Shakers by rank gain when available, otherwise Best Sellers interleaved by department rank.",
  ebay: "Positions follow eBay's Trending Deals page.",
  "tiktok-shop": "SurgeIndex ranks by units sold over approximately 24 hours when enough history exists; otherwise it ranks by cumulative units sold. See the source note below the board for the current basis. Affiliate commission does not affect the order.",
};

export interface SourceViewProps {
  meta: SourceMeta;
  boards: TrendBoard[];
  generatedAt: string | null;
  archiveDates: string[];
  /** When set, the page is the archive for this UTC date. */
  archiveDate?: string;
  prevDate?: string | null;
  nextDate?: string | null;
}

export function SourceView({ meta, boards, generatedAt, archiveDates, archiveDate, prevDate, nextDate }: SourceViewProps) {
  const multi = meta.regions.length > 1 && boards.length > 1;
  const title = archiveDate ? (
    <>
      Top 10 on {meta.name},
      <br />
      <em>{formatLongDate(archiveDate)}</em>
    </>
  ) : (
    <>
      Latest Top 10 on <em>{meta.name}</em>
    </>
  );
  return (
    <RegionScope>
      <section className="t-src-hero" style={brandStyle(meta.color)}>
        <div className="t-src-glow" aria-hidden="true" />
        <span className="t-src-watermark" aria-hidden="true">
          <PlatformIcon source={meta.key} size={420} />
        </span>
        <div className="t-wrap">
          <nav className="t-crumbs" aria-label="Breadcrumb">
            <Link href="/">SurgeIndex</Link>
            <span aria-hidden="true">/</span>
            <Link href="/top-10">Top 10</Link>
            <span aria-hidden="true">/</span>
            {archiveDate ? (
              <>
                <Link href={`/top-10/${meta.key}`}>{meta.name}</Link>
                <span aria-hidden="true">/</span>
                <span aria-current="page">{archiveDate}</span>
              </>
            ) : (
              <span aria-current="page">{meta.name}</span>
            )}
          </nav>
          <div className="t-src-head">
            <span className="t-src-icon">
              <PlatformIcon source={meta.key} size={34} />
            </span>
            <div>
              <span className="t-kicker">{archiveDate ? "Daily archive" : meta.tagline}</span>
              <h1 className="t-src-title">{title}</h1>
            </div>
          </div>
          <p className="t-lede is-narrow">{meta.description}</p>
          <div className="t-src-meta">
            {archiveDate ? (
              <span className="t-pill">
                <CalendarDays size={14} aria-hidden="true" /> Final snapshot of the day{generatedAt ? ` · ${formatUtcTime(generatedAt)}` : ""}
              </span>
            ) : null}
            {boards.map((b) => (
              <span key={b.id} data-only={multi ? b.region : undefined}>
                <StatusChip board={b} showTime archive={Boolean(archiveDate)} />
              </span>
            ))}
            {multi ? <RegionToggle /> : null}
          </div>
        </div>
      </section>

      <div className="t-wrap t-src-layout">
        <div className="t-src-main">
          {boards.map((b) => (
            <div key={b.id} data-only={multi ? b.region : undefined}>
              {multi ? <h2 className="t-src-region">{meta.regionLabels[b.region]}</h2> : null}
              {b.items.length ? (
                <ol className="t-flist" style={brandStyle(meta.color)}>
                  {b.items.map((item) => (
                    <FullRow key={item.id} item={item} meta={boardMeta(meta, b)} />
                  ))}
                </ol>
              ) : b.status === "soon" ? (
                <ComingSoon meta={meta} note={b.note} />
              ) : (
                <div className="t-soon" style={brandStyle(meta.color)}>
                  <strong>No data for this board {archiveDate ? "on this day" : "yet"}</strong>
                  <p>{archiveDate ? "This board was not available when the day closed." : `The last refresh could not reach ${meta.name}. It retries every hour.`}</p>
                </div>
              )}
              {b.status === "stale" && b.fetchedAt ? <p className="t-board-note">The latest refresh failed; showing the last successful snapshot.</p> : null}
              <BoardSourceNote meta={meta} board={b} />
            </div>
          ))}
          {archiveDate ? (
            <nav className="t-daynav" aria-label="Archive navigation">
              {prevDate ? (
                <Link href={`/top-10/${meta.key}/${prevDate}`}>
                  <ArrowLeft size={15} aria-hidden="true" /> {formatShortDate(prevDate)}
                </Link>
              ) : (
                <span />
              )}
              <Link href={`/top-10/${meta.key}`} className="is-center">
                Live board
              </Link>
              {nextDate ? (
                <Link href={`/top-10/${meta.key}/${nextDate}`}>
                  {formatShortDate(nextDate)} <ArrowRight size={15} aria-hidden="true" />
                </Link>
              ) : (
                <span />
              )}
            </nav>
          ) : null}
        </div>

        <aside className="t-src-side">
          <div className="t-side-card">
            <h2>How this board is ranked</h2>
            <p>{ORDER_EXPLANATION[meta.key] ?? "This board's positions follow the available source data."}</p>
            <p>Heat Score is separate from position. It combines position, rank movement and an available source-specific growth signal or proxy. When the source has no growth signal, the score uses position and movement only.</p>
            <Link href="/methodology" className="t-side-link">
              Methodology <ArrowUpRight size={13} aria-hidden="true" />
            </Link>
          </div>
          {archiveDates.length ? (
            <div className="t-side-card">
              <h2>Daily archive</h2>
              <ul className="t-archive">
                {archiveDates.slice(0, 14).map((d) => (
                  <li key={d}>
                    <Link href={`/top-10/${meta.key}/${d}`} aria-current={d === archiveDate ? "page" : undefined}>
                      <span>{formatShortDate(d)}</span>
                      <span className="t-archive-year">{d.slice(0, 4)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <div className="t-side-card">
            <h2>Other boards</h2>
            <ul className="t-otherboards">
              {TREND_SOURCES.filter((s) => s.key !== meta.key && !s.comingSoon).map((s) => (
                <li key={s.key}>
                  <Link href={`/top-10/${s.key}`} style={brandStyle(s.color)}>
                    <PlatformIcon source={s.key} size={14} /> {s.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </aside>
      </div>
    </RegionScope>
  );
}
