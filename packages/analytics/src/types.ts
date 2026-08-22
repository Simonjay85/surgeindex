/** Shared analytics provider contract (spec §18). */

export type MetricWindow = "live" | "24h" | "7d" | "30d" | "90d";

export interface AnalyticsEvent {
  eventId: string;
  siteId: string;
  eventType: "pageview" | "session_start" | "heartbeat" | "engaged" | "session_end";
  sessionId: string;
  visitorHash: string;
  pathname: string;
  referrerHost?: string | null;
  country?: string | null;
  device?: string | null;
  /** Server-assigned trusted timestamp. */
  occurredAt: string;
  decision?: "valid" | "suspected" | "invalid" | "review_required";
  reasons?: string[];
  isDemo?: boolean;
}

export interface LeaderboardQuery {
  window: MetricWindow;
  categorySlug?: string | null;
  limit?: number;
  offset?: number;
}

export interface LeaderboardSiteMetrics {
  siteId: string;
  visitors: number;
  pageviews: number;
  activeNow: number;
  engagementRate: number | null;
  avgEngagementSeconds: number | null;
}

export interface LeaderboardResult {
  sites: LeaderboardSiteMetrics[];
  generatedAt: string;
  source: "demo" | "tinybird";
}

export interface SiteMetrics {
  siteId: string;
  visitors: number;
  pageviews: number;
  activeNow: number;
  activeLast30m: number;
  engagementRate: number | null;
  avgEngagementSeconds: number | null;
  generatedAt: string;
}

export interface TimeSeriesQuery {
  window: MetricWindow;
  metric: "visitors" | "active" | "pageviews" | "referrals";
  /** Bucket size in minutes; providers may adjust to sensible values. */
  bucketMinutes?: number;
}

export interface TimeSeriesPoint {
  t: string;
  value: number;
}

export interface AnalyticsProvider {
  ingest(events: AnalyticsEvent[]): Promise<void>;
  getLeaderboard(input: LeaderboardQuery): Promise<LeaderboardResult>;
  getSiteMetrics(siteId: string, window: MetricWindow): Promise<SiteMetrics>;
  getTimeSeries(siteId: string, input: TimeSeriesQuery): Promise<TimeSeriesPoint[]>;
}
