import { describe, expect, it } from "vitest";
import {
  compareForRanking,
  computeHeatScore,
  SCORE_VERSION,
  type HeatScoreInput,
} from "../src/index.js";

function input(overrides: Partial<HeatScoreInput> = {}): HeatScoreInput {
  return {
    visitors24h: 10_000,
    baselineDailyVisitors: 6_000,
    activeNow: 400,
    typicalActiveNow: 250,
    engagementRate: 0.55,
    avgEngagementSeconds: 90,
    verification: "tracker",
    dataFreshnessSeconds: 60,
    fraudPenalty: 0,
    domainOwnershipVerified: true,
    ...overrides,
  };
}

describe("computeHeatScore", () => {
  it("returns a deterministic 0-100 score with a version", () => {
    const a = computeHeatScore(input());
    const b = computeHeatScore(input());
    expect(a.score).toBe(b.score);
    expect(a.version).toBe(SCORE_VERSION);
    expect(a.score).toBeGreaterThanOrEqual(0);
    expect(a.score).toBeLessThanOrEqual(100);
  });

  it("zero traffic scores near the floor", () => {
    const r = computeHeatScore(
      input({
        visitors24h: 0,
        baselineDailyVisitors: 0,
        activeNow: 0,
        typicalActiveNow: 0,
        engagementRate: 0,
        avgEngagementSeconds: 0,
        verification: "unverified",
        domainOwnershipVerified: false,
      }),
    );
    expect(r.score).toBeLessThanOrEqual(20);
    expect(r.league).toBe("new");
  });

  it("extreme small-base growth does not beat large-base growth", () => {
    const tiny = computeHeatScore(
      input({
        visitors24h: 20,
        baselineDailyVisitors: 1, // +1900% but from 1 visitor
        activeNow: 2,
        typicalActiveNow: 1,
      }),
    );
    const big = computeHeatScore(
      input({
        visitors24h: 90_000,
        baselineDailyVisitors: 50_000, // +80% from a large base
        activeNow: 3_500,
        typicalActiveNow: 2_000,
      }),
    );
    expect(big.score).toBeGreaterThan(tiny.score);
    expect(tiny.notes.some((n) => n.includes("minimum volume"))).toBe(true);
  });

  it("a stable high-volume site scores well on volume and trust", () => {
    const r = computeHeatScore(
      input({
        visitors24h: 120_000,
        baselineDailyVisitors: 118_000, // nearly flat growth
        activeNow: 4_000,
        typicalActiveNow: 3_900,
      }),
    );
    expect(r.breakdown.trafficVolume).toBeGreaterThan(85);
    expect(r.score).toBeGreaterThan(45);
    expect(r.league).toBe("established");
  });

  it("fraud penalty reduces the score but never below zero", () => {
    const clean = computeHeatScore(input());
    const flagged = computeHeatScore(input({ fraudPenalty: 1 }));
    expect(flagged.score).toBeLessThan(clean.score);
    expect(flagged.score).toBeGreaterThanOrEqual(0);
    expect(flagged.notes.some((n) => n.includes("Fraud"))).toBe(true);
  });

  it("missing engagement metrics apply a neutral subscore, not zero", () => {
    const r = computeHeatScore(input({ engagementRate: null, avgEngagementSeconds: null }));
    expect(r.breakdown.engagementQuality).toBe(50);
    expect(r.notes.some((n) => n.includes("Engagement metrics unavailable"))).toBe(true);
  });

  it("GA4-only data (no live users) is not punished on live acceleration", () => {
    const r = computeHeatScore(
      input({
        activeNow: null,
        typicalActiveNow: null,
        verification: "ga4",
      }),
    );
    expect(r.breakdown.liveAcceleration).toBe(35);
    expect(r.breakdown.trustConfidence).toBeGreaterThanOrEqual(80);
  });

  it("unverified traffic scores low on volume and trust", () => {
    const r = computeHeatScore(
      input({
        verification: "unverified",
        visitors24h: 500_000, // claimed but unverified
        baselineDailyVisitors: 400_000,
        domainOwnershipVerified: false,
      }),
    );
    expect(r.breakdown.trafficVolume).toBe(0);
    expect(r.breakdown.trustConfidence).toBeLessThanOrEqual(30);
  });

  it("stale data reduces trust", () => {
    const fresh = computeHeatScore(input({ dataFreshnessSeconds: 30 }));
    const stale = computeHeatScore(input({ dataFreshnessSeconds: 100_000 }));
    expect(stale.breakdown.trustConfidence).toBeLessThan(fresh.breakdown.trustConfidence);
  });

  it("paid spend is not an input — score depends only on organic signals", () => {
    // The function signature has no spend field; ensure boosts can't leak in
    // by contract: same organic inputs always produce identical output.
    const a = computeHeatScore(input({ visitors24h: 12_345 }));
    const b = computeHeatScore(input({ visitors24h: 12_345 }));
    expect(a).toEqual(b);
  });

  it("does not publish a score while the baseline is being built", () => {
    const r = computeHeatScore(input({ baselineDailyVisitors: null, baselineSampleCount: 1, baselineConfidence: 0, dataCompleteness: 0, completedDataDays: 1 }));
    expect(r.state).toBe("building_baseline");
    expect(r.displayedScore).toBe(0);
    expect(r.reasonCodes).toContain("baseline_insufficient");
  });

  it("requires enough history and volume for eligible ranking", () => {
    const provisional = computeHeatScore(input({ visitors7d: 300, completedDataDays: 14, baselineSampleCount: 14, baselineConfidence: 0.9, dataCompleteness: 0.9 }));
    const eligible = computeHeatScore(input({ visitors7d: 900, completedDataDays: 14, baselineSampleCount: 14, baselineConfidence: 0.9, dataCompleteness: 0.9 }));
    expect(provisional.state).toBe("provisional");
    expect(eligible.state).toBe("eligible");
  });

  it("moves a suspected source into fraud review instead of ranking it", () => {
    const r = computeHeatScore(input({ suspectedEvents24h: 30, acceptedEvents24h: 70, visitors7d: 900, completedDataDays: 14, baselineSampleCount: 14, baselineConfidence: 0.9, dataCompleteness: 0.9 }));
    expect(r.state).toBe("fraud_review");
    expect(r.displayedScore).toBeLessThanOrEqual(45);
  });
});

describe("compareForRanking tie-breaking", () => {
  const site = (o: Partial<Parameters<typeof compareForRanking>[0]>) => ({
    heatScore: 50,
    visitors24h: 1000,
    growthPct: 10,
    domain: "example.com",
    ...o,
  });

  it("breaks ties on visitors, then growth, then domain (deterministic)", () => {
    const a = site({ heatScore: 80, visitors24h: 5_000, growthPct: 5, domain: "a.com" });
    const b = site({ heatScore: 80, visitors24h: 5_000, growthPct: 5, domain: "b.com" });
    expect(compareForRanking(a, b)).toBeLessThan(0);
    const c = site({ heatScore: 80, visitors24h: 5_000, growthPct: 12, domain: "z.com" });
    expect(compareForRanking(c, a)).toBeLessThan(0);
    expect(compareForRanking(a, c)).toBeGreaterThan(0);
  });

  it("null visitors rank below verified visitors at equal score", () => {
    const unverified = site({ heatScore: 80, visitors24h: null, growthPct: 999 });
    const verified = site({ heatScore: 80, visitors24h: 10, growthPct: 0 });
    expect(compareForRanking(verified, unverified)).toBeLessThan(0);
  });

  it("higher score always wins regardless of other fields", () => {
    const low = site({ heatScore: 79, visitors24h: 1_000_000 });
    const high = site({ heatScore: 81, visitors24h: 1 });
    expect(compareForRanking(high, low)).toBeLessThan(0);
  });
});
