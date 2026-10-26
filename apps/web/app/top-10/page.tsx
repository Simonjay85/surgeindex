import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { PlatformIcon } from "../../components/trends/platform-icon";
import { brandStyle, StatusChip, TrendShell } from "../../components/trends/ui";
import { formatCompact } from "../../lib/trends/format";
import { findBoard, getLatestSnapshot } from "../../lib/trends/read";
import { formatMetricValue, primaryRegion, TREND_SOURCES } from "../../lib/trends/types";

export const revalidate = 300;

export const metadata: Metadata = {
  title: "Every Top 10 board",
  description: "All SurgeIndex Top 10 boards in one place: Google Trends, YouTube, Wikipedia, Reddit, Hacker News, GitHub, Amazon, eBay and more, refreshed every hour.",
  alternates: { canonical: "/top-10" },
  openGraph: { title: "Every Top 10 board · SurgeIndex", description: "All SurgeIndex Top 10 boards in one place, refreshed every hour.", url: "/top-10", type: "website", images: [{ url: "/opengraph-image", width: 1200, height: 630 }] },
};

export default async function BoardsIndexPage() {
  const snapshot = await getLatestSnapshot();
  return (
    <TrendShell generatedAt={snapshot?.generatedAt ?? null}>
      <section className="t-hero is-compact">
        <div className="t-wrap">
          <span className="t-kicker">All boards</span>
          <h1 className="t-display is-medium">
            Pick a <em>platform.</em>
          </h1>
          <p className="t-lede">Each board is a live Top 10 from that platform&apos;s own chart, re-scored every hour by Heat Score.</p>
        </div>
      </section>
      <div className="t-wrap t-index-grid">
        {TREND_SOURCES.map((meta) => {
          const board = findBoard(snapshot, meta.key, primaryRegion(meta));
          const top = board?.items.slice(0, 3) ?? [];
          return (
            <Link key={meta.key} href={`/top-10/${meta.key}`} className="t-index-card" style={brandStyle(meta.color)}>
              <div className="t-board-glow" aria-hidden="true" />
              <div className="t-index-head">
                <span className="t-board-icon">
                  <PlatformIcon source={meta.key} size={20} />
                </span>
                {board ? <StatusChip board={board} /> : <span className="t-status is-soon">Coming soon</span>}
              </div>
              <h2>{meta.name}</h2>
              <p>{meta.tagline}</p>
              {top.length ? (
                <ol>
                  {top.map((i) => (
                    <li key={i.id}>
                      <span className="t-index-rank">{i.rank}</span>
                      <span className="t-index-title">{i.title}</span>
                      {i.metric !== null ? <span className="t-index-metric">{formatMetricValue(meta, formatCompact(i.metric))}</span> : null}
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="t-index-empty">{meta.comingSoon ? "Planned for a later phase." : board?.status === "soon" ? "Coming soon — the official chart is not connected yet." : "Waiting for the first refresh."}</p>
              )}
              <span className="t-index-cta">
                Open board <ArrowUpRight size={14} aria-hidden="true" />
              </span>
            </Link>
          );
        })}
      </div>
    </TrendShell>
  );
}
