import { describe, expect, it } from "vitest";
import { candidateBelongsToScope, rankCandidates, rankMovement, type RankingCandidate } from "../src/index.js";

function candidate(overrides: Partial<RankingCandidate> = {}): RankingCandidate {
  return {
    siteId: "site-a",
    domain: "a.example",
    categorySlug: "tools",
    state: "eligible",
    league: "emerging",
    displayedScore: 80,
    smoothedScore: 79.5,
    dataConfidence: 0.9,
    visitors24h: 1_000,
    calculatedAt: "2026-08-23T12:00:00.000Z",
    freshness: "fresh",
    breakoutState: "none",
    ...overrides,
  };
}

describe("organic ranking", () => {
  it("filters fraud, stale, suspended, and unverified candidates from the eligible board", () => {
    const eligible = candidate();
    expect(candidateBelongsToScope(eligible, "global")).toBe(true);
    expect(candidateBelongsToScope(candidate({ state: "fraud_review" }), "global")).toBe(false);
    expect(candidateBelongsToScope(candidate({ state: "stale" }), "global")).toBe(false);
    expect(candidateBelongsToScope(candidate({ state: "unverified" }), "global")).toBe(false);
    expect(candidateBelongsToScope(candidate({ state: "suspended" }), "new")).toBe(false);
  });

  it("uses score, smoothed score, confidence, volume, time, domain, then id as deterministic tie-breakers", () => {
    const ranked = rankCandidates([
      candidate({ siteId: "site-b", domain: "b.example", smoothedScore: 80 }),
      candidate({ siteId: "site-a", domain: "a.example", smoothedScore: 80 }),
      candidate({ siteId: "site-c", domain: "c.example", displayedScore: 81 }),
    ], "global");
    expect(ranked.map((site) => site.siteId)).toEqual(["site-c", "site-a", "site-b"]);
  });

  it("keeps new and breakout views separate from the eligible global board", () => {
    expect(candidateBelongsToScope(candidate({ state: "building_baseline", league: "new" }), "new")).toBe(true);
    expect(candidateBelongsToScope(candidate({ state: "provisional", league: "emerging", breakoutState: "breaking_out" }), "breakout")).toBe(false);
    expect(candidateBelongsToScope(candidate({ breakoutState: "surging" }), "breakout")).toBe(true);
  });

  it("reports rank movement with positive values for upward movement", () => {
    expect(rankMovement(3, 8)).toBe(5);
    expect(rankMovement(8, 3)).toBe(-5);
    expect(rankMovement(1, null)).toBeNull();
  });
});
