/**
 * Shared types and the source registry for the SurgeIndex Top 10 boards.
 * This module is pure (no fs, no server-only) so the hourly ingest script and
 * the Next.js pages share one contract.
 */

export type TrendSource = "google-trends" | "news" | "youtube" | "wikipedia" | "reddit" | "hackernews" | "github" | "amazon" | "ebay" | "shopee" | "tiktok-shop" | "x";
export type TrendRegion = "global" | "vn";
export type Movement = "up" | "down" | "same" | "new" | "none";
export type BoardStatus = "live" | "stale" | "unavailable" | "soon";

export interface SourceMeta {
  key: TrendSource;
  name: string;
  short: string;
  /** Brand accent used for borders, glows and chips. */
  color: string;
  regions: TrendRegion[];
  regionLabels: Partial<Record<TrendRegion, string>>;
  metricLabel: string;
  /** Rendered around the metric value, e.g. "+" and "%" for a rank gain. */
  metricPrefix?: string;
  metricSuffix?: string;
  /** Label for the secondary link when an item has a discussionUrl. */
  discussionLabel?: string;
  tagline: string;
  description: string;
  homepage: string;
  /** True when the board is announced but not yet ingested (paid API etc.). */
  comingSoon?: boolean;
  /** Item links are affiliate links: rendered rel="sponsored nofollow" with a disclosure. */
  affiliate?: boolean;
  /** Language of the board's own copy (notes, labels), when not English. */
  lang?: "vi";
}

export const TREND_SOURCES: SourceMeta[] = [
  {
    key: "google-trends",
    name: "Google Trends",
    short: "Google",
    color: "#4c8dff",
    regions: ["global", "vn"],
    regionLabels: { global: "United States", vn: "Vietnam" },
    metricLabel: "searches",
    metricSuffix: "+",
    discussionLabel: "Explore trend",
    tagline: "What the world is typing right now",
    description: "The fastest-rising Google searches from the official daily trending feed, ranked by approximate search volume and how recently the spike began.",
    homepage: "https://trends.google.com/trending",
  },
  {
    key: "news",
    name: "Báo VN đang nóng",
    short: "Báo VN",
    color: "#ffb23f",
    regions: ["vn"],
    regionLabels: { vn: "Báo chí Việt Nam" },
    metricLabel: "đầu báo",
    discussionLabel: "Nguồn",
    tagline: "Tin cùng lúc nhiều đầu báo cùng đưa",
    description: "Mỗi giờ SurgeIndex đọc RSS của VnExpress, Tuổi Trẻ, Thanh Niên, Dân Trí, VietNamNet, Znews và Google News Việt Nam, gom các bài cùng một sự kiện và xếp hạng theo số đầu báo cùng đưa tin, giảm dần theo thời gian.",
    homepage: "https://news.google.com/home?hl=vi&gl=VN&ceid=VN:vi",
  },
  {
    key: "youtube",
    name: "YouTube",
    short: "YouTube",
    color: "#ff2d46",
    regions: ["global", "vn"],
    regionLabels: { global: "United States", vn: "Vietnam" },
    metricLabel: "views",
    tagline: "The most popular videos on the planet",
    description: "YouTube's official Most Popular chart, re-ranked by view velocity so you see what is accelerating, not just what is big.",
    homepage: "https://www.youtube.com/feed/trending",
  },
  {
    key: "wikipedia",
    name: "Wikipedia",
    short: "Wikipedia",
    color: "#c8ccd4",
    regions: ["global", "vn"],
    regionLabels: { global: "English Wikipedia", vn: "Vietnamese Wikipedia" },
    metricLabel: "views/day",
    discussionLabel: "Pageviews",
    tagline: "What people are reading up on",
    description: "The most-read Wikipedia articles of the last full day from the official Wikimedia pageviews API, with site pages and obvious bot spikes filtered out.",
    homepage: "https://pageviews.wmcloud.org/topviews/",
  },
  {
    key: "reddit",
    name: "Reddit",
    short: "Reddit",
    color: "#ff5a1f",
    regions: ["global"],
    regionLabels: { global: "r/all" },
    metricLabel: "upvotes",
    tagline: "The front page of the internet, distilled",
    description: "The hottest posts on r/all, with upvote velocity, comment depth and movement since the last hour.",
    homepage: "https://www.reddit.com/r/all/",
  },
  {
    key: "hackernews",
    name: "Hacker News",
    short: "HN",
    color: "#ff8a1f",
    regions: ["global"],
    regionLabels: { global: "Front page" },
    metricLabel: "points",
    tagline: "What builders are reading",
    description: "The Hacker News front page from the official API, scored by points per hour and discussion depth.",
    homepage: "https://news.ycombinator.com/",
  },
  {
    key: "github",
    name: "GitHub Trending",
    short: "GitHub",
    color: "#3fdc7a",
    regions: ["global"],
    regionLabels: { global: "All languages" },
    metricLabel: "stars today",
    tagline: "The repos developers are starring today",
    description: "GitHub's daily trending repositories, ranked by stars gained today and how fast that pace is holding.",
    homepage: "https://github.com/trending",
  },
  {
    key: "amazon",
    name: "Amazon Best Sellers",
    short: "Amazon",
    color: "#ff9900",
    regions: ["global"],
    regionLabels: { global: "Amazon.com (US)" },
    metricLabel: "sales rank, 24h",
    metricPrefix: "+",
    metricSuffix: "%",
    tagline: "What America is adding to cart",
    description: "Amazon.com's public charts: the biggest Movers & Shakers in sales rank over 24 hours when Amazon publishes them, otherwise the #1 Best Sellers across departments.",
    homepage: "https://www.amazon.com/gp/movers-and-shakers",
  },
  {
    key: "ebay",
    name: "eBay Trending Deals",
    short: "eBay",
    color: "#e53238",
    regions: ["global"],
    regionLabels: { global: "eBay.com (US)" },
    metricLabel: "off",
    metricSuffix: "%",
    tagline: "The deals shoppers are piling into",
    description: "eBay's public Trending Deals page, in eBay's own order, with price and discount for every listing.",
    homepage: "https://www.ebay.com/deals/trending",
  },
  {
    key: "tiktok-shop",
    name: "TikTok Shop",
    short: "TikTok Shop",
    color: "#25f4ee",
    regions: ["vn"],
    regionLabels: { vn: "TikTok Shop Việt Nam" },
    metricLabel: "đã bán",
    tagline: "Sản phẩm bán chạy trên TikTok Shop Việt Nam",
    description: "Sản phẩm bán chạy nhất trên TikTok Shop Việt Nam từ feed affiliate chính thức (TikTok Shop qua AccessTrade), đọc mỗi giờ. Khi đủ khoảng 20 giờ dữ liệu, board xếp theo số lượng bán thêm trong 24 giờ; trước đó xếp theo tổng đã bán (lũy kế) và ghi rõ.",
    homepage: "https://shop.tiktok.com/",
    affiliate: true,
    lang: "vi",
  },
  {
    key: "shopee",
    name: "Shopee",
    short: "Shopee",
    color: "#ee4d2d",
    regions: ["vn"],
    regionLabels: { vn: "Shopee Vietnam" },
    metricLabel: "sold",
    tagline: "Vietnam's top-selling products",
    description: "Shopee Vietnam has no public best-seller feed we can read reliably. This board is planned and will never show placeholder data.",
    homepage: "https://shopee.vn/",
    comingSoon: true,
  },
  {
    key: "x",
    name: "X",
    short: "X",
    color: "#d9dde3",
    regions: ["global"],
    regionLabels: { global: "Worldwide" },
    metricLabel: "posts",
    tagline: "Real-time conversation",
    description: "X trends require the paid X API. This board is planned for a later phase and will never show placeholder data.",
    homepage: "https://x.com/explore",
    comingSoon: true,
  },
];

export const SOURCE_KEYS = TREND_SOURCES.map((s) => s.key);

/** "+1.2K%" style metric text for a source (no label). */
export function formatMetricValue(meta: Pick<SourceMeta, "metricPrefix" | "metricSuffix">, compact: string): string {
  return `${meta.metricPrefix ?? ""}${compact}${meta.metricSuffix ?? ""}`;
}

/** The region a single-region source lives in (Shopee is Vietnam-only). */
export function primaryRegion(meta: Pick<SourceMeta, "regions">): TrendRegion {
  return meta.regions.includes("global") ? "global" : meta.regions[0] ?? "global";
}

export function getSourceMeta(key: string): SourceMeta | undefined {
  return TREND_SOURCES.find((s) => s.key === key);
}

/**
 * Single-region sources can also be addressed by their board id
 * (`/top-10/tiktok-shop-vn`, `/top-10/news-vn`); the canonical URL stays `/top-10/<key>`.
 */
export function getSourceMetaByBoardId(id: string): SourceMeta | undefined {
  return TREND_SOURCES.find((s) => s.regions.length === 1 && boardId(s.key, s.regions[0]!) === id && id !== s.key);
}

/** rel for outbound item links; affiliate boards add "sponsored". */
export function externalRel(meta: Pick<SourceMeta, "affiliate"> | undefined): string {
  return meta?.affiliate ? "sponsored nofollow noopener noreferrer" : "noopener noreferrer nofollow";
}

/** One outlet's article inside a news cluster (news board only). */
export interface NewsSourceLink {
  outlet: string;
  url: string;
  title: string;
  publishedAt?: string;
}

/** Raw item as returned by a source fetcher, before ranking and scoring. */
export interface RawTrendItem {
  id: string;
  title: string;
  url: string;
  discussionUrl?: string;
  subtitle?: string;
  author?: string;
  thumbnail?: string;
  metric: number | null;
  /** Lifetime-average growth per hour, used when no earlier snapshot exists. */
  velocityHint?: number | null;
  publishedAt?: string;
  comments?: number | null;
  tags?: string[];
  context?: string;
  contextUrl?: string;
  /** News board: the original articles of every outlet covering the story. */
  sources?: NewsSourceLink[];
}

export interface TrendItem extends RawTrendItem {
  rank: number;
  prevRank: number | null;
  movement: Movement;
  /** Up to the last 24 hourly ranks, oldest first. 11 = off the board. */
  rankHistory: number[];
  velocityPerHour: number | null;
  /** True when velocity was measured between two snapshots. */
  velocityMeasured: boolean;
  heat: number;
  why: string;
}

export interface TrendBoard {
  id: string;
  source: TrendSource;
  region: TrendRegion;
  status: BoardStatus;
  fetchedAt: string | null;
  via?: string;
  note?: string;
  /** Overrides the source's metricLabel for this board (e.g. "Bán thêm 24h" vs "Tổng đã bán (lũy kế)"). */
  metricLabel?: string;
  /** Short source line shown under the board, e.g. "TikTok Shop qua AccessTrade". */
  attribution?: string;
  items: TrendItem[];
}

export interface TrendSnapshot {
  version: 1;
  generatedAt: string;
  boards: TrendBoard[];
}

export function boardId(source: TrendSource, region: TrendRegion): string {
  return region === "global" ? source : `${source}-${region}`;
}

/* ───────────────────────────── Public API ───────────────────────────── */

export type CompactTrendItem = Pick<TrendItem, "id" | "rank" | "prevRank" | "movement" | "title" | "url" | "metric" | "velocityPerHour" | "heat">;

export interface CompactTrendBoard extends Omit<TrendBoard, "items"> {
  items: CompactTrendItem[];
}

export interface CompactTrendSnapshot extends Omit<TrendSnapshot, "boards"> {
  format: "compact";
  /** Path of the full snapshot (thumbnails, why-lines, rank history, tags). */
  full: string;
  boards: CompactTrendBoard[];
}

/**
 * The default /api/trends payload: every board and item, without the heavy
 * presentation fields. Keeps the response small (well under 64 KB with every
 * board live) so cheap `curl | head` health checks and clients stay fast.
 */
export function compactSnapshot(snapshot: TrendSnapshot, fullPath = "/api/trends/full"): CompactTrendSnapshot {
  return {
    version: snapshot.version,
    generatedAt: snapshot.generatedAt,
    format: "compact",
    full: fullPath,
    boards: snapshot.boards.map(({ items, ...board }) => ({
      ...board,
      items: items.map((i) => ({ id: i.id, rank: i.rank, prevRank: i.prevRank, movement: i.movement, title: i.title, url: i.url, metric: i.metric, velocityPerHour: i.velocityPerHour, heat: i.heat })),
    })),
  };
}
