import { describe, expect, it } from "vitest";
import { canSwitchRankingSource, rejectDoubleCountedBundles, selectPrimaryBundle, type RankingMetricBundle } from "../src/source-policy";

const tracker: RankingMetricBundle = { source: "tracker", trafficVolume: 100, sessionVolume: 20, pageviewVolume: 200, engagementRate: 0.6, recentActivity: 4, historicalBuckets: [], freshness: "fresh", confidence: 1, definitionVersion: "tracker-v1" };
const ga4: RankingMetricBundle = { source: "ga4", trafficVolume: 80, sessionVolume: 18, pageviewVolume: 160, engagementRate: 0.5, recentActivity: 12, historicalBuckets: [], freshness: "fresh", confidence: 0.9, definitionVersion: "google-data-v1beta" };

describe("ranking source policy", () => {
  it("selects one bundle without combining values", () => {
    expect(selectPrimaryBundle("ga4", [tracker, ga4])).toBe(ga4);
    expect(selectPrimaryBundle("tracker", [tracker, ga4])).toBe(tracker);
  });

  it("rejects a mixed bundle so tracker plus GA4 cannot be scored", () => {
    expect(() => rejectDoubleCountedBundles([tracker, ga4])).toThrow("ranking_source_double_count");
  });

  it("requires an audit reason and respects a source lock", () => {
    const now = new Date("2026-08-23T00:00:00Z");
    const policy = { primarySource: "tracker" as const, rankingSourceVersion: "tracker-v1", rankingSourceStartedAt: now, rankingSourceLockedUntil: new Date("2026-08-30T00:00:00Z"), previousRankingSource: null, sourceSwitchReason: null, provisionalUntil: null, baselineCompatible: true };
    expect(canSwitchRankingSource({ now, current: policy, next: "ga4", reason: "" })).toEqual({ allowed: false, code: "reason_required" });
    expect(canSwitchRankingSource({ now, current: policy, next: "ga4", reason: "validated migration" })).toEqual({ allowed: false, code: "locked" });
    expect(canSwitchRankingSource({ now: new Date("2026-09-01T00:00:00Z"), current: policy, next: "ga4", reason: "validated migration" })).toEqual({ allowed: true, code: "allowed" });
  });
});
