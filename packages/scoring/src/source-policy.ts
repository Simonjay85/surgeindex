import type { FreshnessState } from "./config";

export type RankingSource = "tracker" | "ga4";

export interface RankingMetricBucket {
  bucketStart: Date;
  bucketEnd: Date;
  trafficVolume: number | null;
  sessionVolume: number | null;
  pageviewVolume: number | null;
  recentActivity: number | null;
}

export interface RankingMetricBundle {
  source: RankingSource;
  trafficVolume: number | null;
  sessionVolume: number | null;
  pageviewVolume: number | null;
  engagementRate: number | null;
  recentActivity: number | null;
  historicalBuckets: RankingMetricBucket[];
  freshness: FreshnessState;
  confidence: number;
  definitionVersion: string;
}

export interface RankingSourcePolicy {
  primarySource: RankingSource;
  rankingSourceVersion: string;
  rankingSourceStartedAt: Date;
  rankingSourceLockedUntil: Date | null;
  previousRankingSource: RankingSource | null;
  sourceSwitchReason: string | null;
  provisionalUntil: Date | null;
  baselineCompatible: boolean;
}

export function canSwitchRankingSource(input: { now: Date; current: RankingSourcePolicy; next: RankingSource; reason: string }): { allowed: boolean; code: "same_source" | "locked" | "reason_required" | "allowed" } {
  if (input.current.primarySource === input.next) return { allowed: true, code: "same_source" };
  if (!input.reason.trim()) return { allowed: false, code: "reason_required" };
  if (input.current.rankingSourceLockedUntil && input.current.rankingSourceLockedUntil.getTime() > input.now.getTime()) return { allowed: false, code: "locked" };
  return { allowed: true, code: "allowed" };
}

/** A score receives exactly one source bundle. There is deliberately no sum operation. */
export function selectPrimaryBundle(source: RankingSource, bundles: RankingMetricBundle[]): RankingMetricBundle | null {
  return bundles.find((bundle) => bundle.source === source) ?? null;
}

export function rejectDoubleCountedBundles(bundles: RankingMetricBundle[]): void {
  const sources = new Set(bundles.map((bundle) => bundle.source));
  if (sources.size > 1) throw new Error("ranking_source_double_count");
}

export function sourceDefinitionLabel(source: RankingSource): string {
  return source === "ga4" ? "GA4 imported metrics" : "Tracker measured metrics";
}
