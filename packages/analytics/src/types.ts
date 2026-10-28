import type { NormalizedTrackerEvent, TrackerEventType, TrafficOrigin } from "@surge/shared";

/** Shared analytics provider contract (spec §18). */

export type MetricWindow = "live" | "24h" | "7d" | "30d" | "90d";

export interface AnalyticsEvent {
  eventId: string;
  siteId: string;
  eventType: TrackerEventType;
  sessionId: string;
  visitorHash: string;
  pathname: string;
  referrerHost?: string | null;
  country?: string | null;
  device?: string | null;
  trackerPublicKey?: string | null;
  /** Server-assigned trusted timestamp. */
  occurredAt: string;
  decision?: "valid" | "suspected" | "invalid" | "review_required";
  reasons?: string[];
  visible?: boolean;
  engagedSeconds?: number | null;
  trackerVersion?: string;
  attributionTokenHash?: string | null;
  originHost?: string | null;
  fraudScore?: number;
  fraudRuleVersion?: string;
  collectorRequestId?: string | null;
  trafficOrigin?: TrafficOrigin;
  attributionCampaignId?: string | null;
  isDemo?: boolean;
}

export interface IngestResult {
  inserted: number;
  duplicates: number;
  rejected: number;
}

/** Queue consumers depend on this small contract, not a concrete database. */
export interface EventStoreProvider {
  ingest(events: NormalizedTrackerEvent[]): Promise<IngestResult>;
  hasEvent(eventId: string): Promise<boolean>;
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
  source: "demo" | "postgres" | "tinybird";
}

export interface SiteMetrics {
  siteId: string;
  visitors: number;
  pageviews: number;
  activeNow: number;
  activeLast30m: number;
  sessions?: number;
  engagedSessions?: number;
  activeSessions?: number;
  attributedVisits?: number;
  attributedEngagedVisits?: number;
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
