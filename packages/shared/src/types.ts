/** Core domain types shared between server and client. */

export type TimeWindow = "live" | "24h" | "7d";

/** Ranking view tabs: time windows plus special views. */
export type RankingView = TimeWindow | "breakout" | "new";

export type VerificationStatus = "tracker" | "ga4" | "unverified";
export type OwnershipStatus = "unclaimed" | "claimed";
export type SiteStatus = "pending" | "active" | "suspended" | "rejected";

/** Provenance label for any displayed number. Mirrors spec section 29. */
export type DataSource =
  | "tracker"
  | "ga4"
  | "surgeindex"
  | "sponsored"
  | "demo"
  | "unverified";

export type BoostStatus =
  | "draft"
  | "pending_payment"
  | "scheduled"
  | "active"
  | "paused"
  | "completed"
  | "cancelled"
  | "refunded";

export type BoostPlacement =
  | "homepage"
  | "category"
  | "ranking_feed"
  | "profile_recommendation"
  | "breakout_feed";

export type ClaimMethod = "meta_tag" | "html_file" | "dns_txt" | "tracker" | "ga4";

export type ActivityType =
  | "site_submitted"
  | "site_verified"
  | "entered_top_10"
  | "rank_up"
  | "surging"
  | "boost_started"
  | "boost_completed"
  | "badge_earned";

export type FraudDecision = "valid" | "suspected" | "invalid" | "review_required";

export type SortKey =
  | "heat"
  | "active_now"
  | "visitors"
  | "growth"
  | "rank_movement"
  | "referrals"
  | "newest";

export interface LeaderboardEntry {
  siteId: string;
  slug: string;
  domain: string;
  name: string;
  description: string;
  categorySlug: string;
  categoryName: string;
  verification: VerificationStatus;
  ownership: OwnershipStatus;
  status: SiteStatus;
  rank: number;
  previousRank: number | null;
  rankMovement: number;
  heatScore: number;
  /** null when the data source cannot report live users. */
  activeNow: number | null;
  activeSource: DataSource | null;
  /** Unique visitors for the selected window; null when unverified. */
  visitors: number | null;
  growthPct: number | null;
  surgeReferrals: number;
  sparkline: number[];
  lastUpdatedAt: string;
  isDemo: boolean;
}

export interface PlatformStats {
  sitesTracked: number;
  peopleActiveNow: number;
  breakoutSignalsToday: number;
  verifiedSites: number;
  isDemo: boolean;
}

export interface ActivityItem {
  id: string;
  type: ActivityType;
  siteSlug: string | null;
  siteName: string | null;
  domain: string | null;
  detail: string | null;
  occurredAt: string;
  isDemo: boolean;
}

export interface BreakoutItem {
  siteId: string;
  slug: string;
  domain: string;
  name: string;
  categoryName: string;
  categorySlug: string;
  verification: VerificationStatus;
  /** current volume vs baseline, e.g. 4.2 means 4.2x */
  multiple: number;
  currentVolume: number;
  baselineVolume: number;
  detectedAt: string;
  confidence: "low" | "medium" | "high";
  explanation: string;
  sparkline: number[];
  isDemo: boolean;
}

export interface SponsoredCard {
  campaignId: string;
  siteSlug: string;
  domain: string;
  name: string;
  description: string;
  categoryName: string;
  verification: VerificationStatus;
  organicRank: number | null;
  heatScore: number;
  headline: string;
  placement: BoostPlacement;
  isDemo: boolean;
}

export interface TimeseriesPoint {
  t: string;
  value: number;
}

export interface CategoryInfo {
  id: string;
  slug: string;
  name: string;
  description: string;
  siteCount: number;
}
