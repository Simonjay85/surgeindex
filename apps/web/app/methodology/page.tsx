import type { Metadata } from "next";
import Link from "next/link";
import { ProsePage } from "../../components/trends/prose-page";
import { TREND_VELOCITY_REFERENCE, TREND_HEAT_WEIGHTS } from "@surge/scoring";
import { formatCompact } from "../../lib/trends/format";
import { isProductsBoardPublished, PRODUCTS_BOARD_PATH } from "../../lib/products";

export const metadata: Metadata = {
  title: "Methodology — how the Top 10 and Heat Score work",
  description: "Where each SurgeIndex Top 10 comes from, how its order is determined, and how Heat Score uses available signals.",
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
  { key: "news", name: "Báo VN đang nóng", unit: "outlets × recency (score / hour)", source: "Public RSS of VnExpress, Tuổi Trẻ, Thanh Niên, Dân Trí, VietNamNet and Znews plus Google News Vietnam, read hourly. Articles from the last 36 hours are grouped into one story when their diacritic-free headline tokens overlap (Jaccard ≥ 0.5) or Google News already groups them; a story needs at least two distinct outlets. Score = distinct outlets × 0.5^(hours since the latest article ÷ 6). Every row links to the original articles." },
  { key: "tiktok-shop", name: "TikTok Shop (VN)", unit: "units sold / hour (24h window)", source: "Official TikTok Shop affiliate product feed via AccessTrade (BEST_SELLERS, 50 products, hourly). The feed only exposes cumulative units sold, so SurgeIndex stores an hourly sample per product and ranks by units sold in the last 24 hours once about 20 hours of history exist; until then it ranks by cumulative units sold and labels it “Tổng đã bán (lũy kế)”. Product links are affiliate links (rel=\"sponsored\"); commission never affects the order." },
  { key: "ebay", name: "eBay", unit: "— (position and momentum only)", source: "ebay.com/deals/trending in eBay's own order. Discounts are shown but are not a growth signal, so velocity is left out and the other weights are renormalized." },
];

export default function MethodologyPage() {
  return (
    <ProsePage kicker="Methodology" title={<>Heat, <em>not hype.</em></>} lede="We collect public charts and feeds on an hourly schedule. Each board has its own ordering; Heat Score is a separate indicator based on the signals available for that source.">
      <section>
        <h2>1 · The boards</h2>
        <p>Board position and Heat Score are different. Reddit, YouTube, Hacker News, GitHub and eBay retain the source&apos;s order. Google Trends is sorted by reported search-volume bucket and recency; Wikipedia uses its filtered most-read list; Báo VN groups and scores reports by outlets and recency. Amazon combines department lists as described below, and TikTok Shop uses measured sales growth when enough history exists, otherwise cumulative sales. Heat Score does not reorder these boards.</p>
        <p>We do not invent or pad rows. If a source cannot be reached, the board keeps its last good snapshot and is marked <strong>Delayed</strong>, or says <strong>Unavailable</strong>. Boards without a usable public source — X (paid API) and Shopee Vietnam (no public best-seller feed) — are shown as <strong>Coming soon</strong> with no data.</p>
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
        <p>A scheduled job attempts a refresh each hour. It reads sources one after another, compares available results with the previous snapshot, and writes a JSON snapshot. A failed source can remain delayed; its displayed timestamp is the last successful fetch. Hourly snapshots are kept for seven days; the last snapshot of each UTC day becomes that day&apos;s archive page.</p>
      </section>
      <section>
        <h2>3 · Heat Score (trend-v1)</h2>
        <p>Heat Score runs from 0 to 99 and blends three signals:</p>
        <ul>
          <li><strong>Velocity or source-specific proxy — {Math.round(TREND_HEAT_WEIGHTS.velocity * 100)}%.</strong> For running totals such as YouTube views, Reddit votes and Hacker News points, a comparable previous snapshot can provide a per-hour change. Otherwise, where available, the source supplies a rate or an estimate such as a lifetime average or daily count divided by 24. Google&apos;s search-volume bucket and the Báo VN outlets-and-recency score are proxies, not directly observed hourly growth. The signal is log-normalized against the source reference above and capped there.</li>
          <li><strong>Board position — {Math.round(TREND_HEAT_WEIGHTS.position * 100)}%.</strong> The item&apos;s position in this board, scaled by the number of items.</li>
          <li><strong>Momentum — {Math.round(TREND_HEAT_WEIGHTS.momentum * 100)}%.</strong> Places climbed or lost since the previous available snapshot. A new item receives a fixed newcomer signal; no prior position receives a neutral baseline.</li>
        </ul>
        <p>When the entire source read has no growth signal (for example Reddit RSS, Amazon Best Sellers, eBay deals, or TikTok Shop before enough sales history exists), velocity is omitted and position and momentum are rescaled. A score can therefore be shown without measured growth; it is not a growth rate or a guarantee that an item is accelerating. If a particular item lacks a usable rate while its board has one, the velocity component for that item is zero.</p>
        <p>Scores use different source metrics, assumptions and fallback rules. They are useful as a rough signal, not a direct comparison of audience size or growth across platforms. A delayed board&apos;s score reflects its last successful snapshot.</p>
      </section>
      <section>
        <h2>4 · Movement and history</h2>
        <p>▲ and ▼ show places gained or lost since the previous refresh; <strong>NEW</strong> marks an item that was not on the board an hour ago. The sparkline shows the item&apos;s rank over its last 24 refreshes, with the top line representing #1.</p>
      </section>
      <section>
        <h2>5 · “Why it&apos;s hot”</h2>
        <p>The one-line explanation under each item is generated from the data alone — velocity, comments, age, stars today, the headline Google attaches to a search spike — with no AI writing involved.</p>
      </section>
      {isProductsBoardPublished() ? (
        <section id="san-pham-dang-len" lang="vi">
          <h2>6 · Sản phẩm đang lên (thử nghiệm)</h2>
          <p>
            Board <Link href={PRODUCTS_BOARD_PATH}>Sản phẩm đang lên</Link> cập nhật mỗi tuần, không theo giờ. Thứ hạng xếp theo mức tăng mức quan tâm tìm kiếm tại Việt Nam trên Google Trends (geo=VN), so sánh trung bình 7 ngày gần nhất với 7 ngày trước đó; khi có, cộng thêm tín hiệu tăng hạng từ TikTok Creative Center Top Products VN (snapshot thủ công, ghi rõ ngày). Mỗi sản phẩm cần ít nhất một tín hiệu đo được kèm link nguồn; không có tín hiệu thì không vào board. Chúng tôi không thu thập dữ liệu trực tiếp từ Shopee hay TikTok Shop, không ghi giá nếu chưa kiểm tra, không ghi lượt bán.
          </p>
          <p>Một số link mua là link affiliate (Shopee, TikTok Shop): SurgeIndex có thể nhận hoa hồng, giá người mua trả không đổi, và hoa hồng không ảnh hưởng thứ hạng.</p>
        </section>
      ) : null}
    </ProsePage>
  );
}
