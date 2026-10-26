/**
 * Shared types and the source registry for the SurgeIndex Top 10 boards.
 * This module is pure (no fs, no server-only) so the hourly ingest script and
 * the Next.js pages share one contract.
 */

export type TrendSource = "google-trends" | "youtube" | "reddit" | "hackernews" | "github" | "x";
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
  tagline: string;
  description: string;
  homepage: string;
  /** True when the board is announced but not yet ingested (paid API etc.). */
  comingSoon?: boolean;
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
    tagline: "What the world is typing right now",
    description: "The fastest-rising Google searches from the official daily trending feed, ranked by approximate search volume and how recently the spike began.",
    homepage: "https://trends.google.com/trending",
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

export function getSourceMeta(key: string): SourceMeta | undefined {
  return TREND_SOURCES.find((s) => s.key === key);
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
