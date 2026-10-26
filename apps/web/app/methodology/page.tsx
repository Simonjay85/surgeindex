import type { Metadata } from "next";
import { ProsePage } from "../../components/trends/prose-page";
import { TREND_VELOCITY_REFERENCE, TREND_HEAT_WEIGHTS } from "@surge/scoring";
import { formatCompact } from "../../lib/trends/format";

export const metadata: Metadata = {
  title: "Methodology — how the Top 10 and Heat Score work",
  description: "Where every SurgeIndex Top 10 comes from, how often it refreshes, and exactly how Heat Score measures growth velocity per platform.",
  alternates: { canonical: "/methodology" },
};

const REF_ROWS: Array<{ key: keyof typeof TREND_VELOCITY_REFERENCE; name: string; unit: string; source: string }> = [
  { key: "google-trends", name: "Google Trends", unit: "searches / hour", source: "Official daily trending RSS (geo=US and geo=VN). Ranked by approximate search volume, then recency." },
  { key: "youtube", name: "YouTube", unit: "views / hour", source: "YouTube Data API v3 Most Popular chart (regionCode US and VN)." },
  { key: "reddit", name: "Reddit", unit: "upvotes / hour", source: "r/all hot listing. Uses the public JSON or OAuth API for vote counts; falls back to the public RSS feed, which has no counts." },
  { key: "hackernews", name: "Hacker News", unit: "points / hour", source: "Official Hacker News Firebase API, top stories." },
  { key: "github", name: "GitHub", unit: "stars / hour", source: "github.com/trending (daily, all languages). Stars gained today ÷ 24." },
  { key: "wikipedia", name: "Wikipedia", unit: "views / hour", source: "Official Wikimedia pageviews API, most-read articles of the last full UTC day on English (Global) and Vietnamese (Vietnam) Wikipedia. Main pages, non-article namespaces and obvious bot-driven adult spikes are removed. Daily views ÷ 24." },
  { key: "amazon", name: "Amazon", unit: "% sales-rank gain / hour", source: "Amazon.com Movers & Shakers (biggest 24-hour sales-rank gains across departments) when Amazon publishes it; otherwise the #1 Best Sellers of each department, interleaved by rank, with no growth metric." },
  { key: "ebay", name: "eBay", unit: "— (position and momentum only)", source: "ebay.com/deals/trending in eBay's own order. Discounts are shown but are not a growth signal, so velocity is left out and the other weights are renormalized." },
];

export default function MethodologyPage() {
  return (
    <ProsePage kicker="Methodology" title={<>Heat, <em>not hype.</em></>} lede="Every board is a real platform chart, refreshed hourly. Heat Score adds one thing the charts do not tell you: how fast each item is moving.">
      <section>
        <h2>1 · The boards</h2>
        <p>Each board is the platform&apos;s own Top 10 — we never invent, pad or estimate rows. If a platform cannot be reached, the board keeps its last good snapshot and is marked <strong>Delayed</strong>, or says <strong>Unavailable</strong>. Boards without a usable public source — X (paid API) and Shopee Vietnam (no public best-seller feed) — are shown as <strong>Coming soon</strong> with no data.</p>
        <div className="t-table-wrap">
          <table className="t-table">
            <thead>
              <tr>
                <th scope="col">Platform</th>
                <th scope="col">Source</th>
                <th scope="col">Velocity unit</th>
                <th scope="col">“Fully hot” at</th>
              </tr>
            </thead>
            <tbody>
              {REF_ROWS.map((r) => (
                <tr key={r.key}>
                  <th scope="row">{r.name}</th>
                  <td>{r.source}</td>
                  <td>{r.unit}</td>
                  <td className="is-num">{formatCompact(TREND_VELOCITY_REFERENCE[r.key])}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section>
        <h2>2 · Hourly refresh</h2>
        <p>A single lightweight job runs at the top of every hour. It reads each source one after another, compares the new chart with the previous hour, and writes a JSON snapshot. Hourly snapshots are kept for seven days; the last snapshot of each UTC day becomes that day&apos;s archive page.</p>
      </section>
      <section>
        <h2>3 · Heat Score (trend-v1)</h2>
        <p>Heat Score runs from 0 to 99 and blends three signals:</p>
        <ul>
          <li><strong>Growth velocity — {Math.round(TREND_HEAT_WEIGHTS.velocity * 100)}%.</strong> How fast the item&apos;s own metric is rising per hour. When we saw the item an hour ago, this is measured directly (for example, upvotes gained since the last refresh). For a first sighting we use its lifetime average rate (metric ÷ hours since it was posted). Velocity is log-normalized against the platform&apos;s “fully hot” rate above and capped there, so 300,000 YouTube views and 150 Hacker News points per hour both count as blazing on their own turf.</li>
          <li><strong>Chart position — {Math.round(TREND_HEAT_WEIGHTS.position * 100)}%.</strong> The platform&apos;s own ranking, from #1 (full credit) to #10.</li>
          <li><strong>Momentum — {Math.round(TREND_HEAT_WEIGHTS.momentum * 100)}%.</strong> Places climbed or lost since the previous hour. Newcomers get a strong momentum signal.</li>
        </ul>
        <p>Velocity is only measured between snapshots for running totals that keep growing through the hour (Reddit upvotes, Hacker News points, YouTube views). Daily figures such as Wikipedia&apos;s most-read counts or Amazon&apos;s 24-hour rank gain keep their own per-hour rate. When a source exposes no growth counts at all (Reddit&apos;s RSS fallback, Amazon Best Sellers, eBay deals), velocity is left out and the other two weights are rescaled, rather than pretending velocity is zero — so brand-new boards score sensibly from their very first refresh.</p>
      </section>
      <section>
        <h2>4 · Movement and history</h2>
        <p>▲ and ▼ show places gained or lost since the previous refresh; <strong>NEW</strong> marks an item that was not on the board an hour ago. The sparkline shows the item&apos;s rank over its last 24 refreshes, with the top line representing #1.</p>
      </section>
      <section>
        <h2>5 · “Why it&apos;s hot”</h2>
        <p>The one-line explanation under each item is generated from the data alone — velocity, comments, age, stars today, the headline Google attaches to a search spike — with no AI writing involved.</p>
      </section>
    </ProsePage>
  );
}
