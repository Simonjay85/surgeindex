import { describe, expect, it } from "vitest";
import { computeTrendHeat, normalizeVelocity } from "../src/trend-heat";

describe("trend heat", () => {
  it("normalizes velocity per platform on a log scale", () => {
    expect(normalizeVelocity("hackernews", 0)).toBe(0);
    expect(normalizeVelocity("hackernews", null)).toBe(0);
    expect(normalizeVelocity("hackernews", 150)).toBe(1);
    expect(normalizeVelocity("hackernews", 5_000)).toBe(1);
    const mid = normalizeVelocity("hackernews", 20);
    expect(mid).toBeGreaterThan(0.5);
    expect(mid).toBeLessThan(1);
  });

  it("treats the same raw rate differently on different platforms", () => {
    expect(normalizeVelocity("youtube", 150)).toBeLessThan(normalizeVelocity("hackernews", 150));
  });

  it("ranks a fast climber above a slow incumbent", () => {
    const fast = computeTrendHeat({ platform: "reddit", velocityPerHour: 3_000, rank: 5, boardSize: 10, rankDelta: 4, isNew: false });
    const slow = computeTrendHeat({ platform: "reddit", velocityPerHour: 50, rank: 2, boardSize: 10, rankDelta: -1, isNew: false });
    expect(fast.score).toBeGreaterThan(slow.score);
  });

  it("stays within 0..99", () => {
    const top = computeTrendHeat({ platform: "github", velocityPerHour: 1e9, rank: 1, boardSize: 10, rankDelta: 9, isNew: false });
    expect(top.score).toBeLessThanOrEqual(99);
    const bottom = computeTrendHeat({ platform: "github", velocityPerHour: null, rank: 10, boardSize: 10, rankDelta: -9, isNew: false });
    expect(bottom.score).toBeGreaterThanOrEqual(0);
  });

  it("renormalizes when a source exposes no metric", () => {
    const first = computeTrendHeat({ platform: "reddit", velocityPerHour: null, rank: 1, boardSize: 10, rankDelta: null, isNew: false, velocityAvailable: false });
    expect(first.score).toBeGreaterThan(70);
  });

  it("builds heat from position and momentum for platforms without a growth metric", () => {
    expect(normalizeVelocity("ebay", 1_000)).toBe(0);
    const first = computeTrendHeat({ platform: "ebay", velocityPerHour: 50, rank: 1, boardSize: 10, rankDelta: null, isNew: false });
    const last = computeTrendHeat({ platform: "ebay", velocityPerHour: 50, rank: 10, boardSize: 10, rankDelta: null, isNew: false });
    expect(first.score).toBeGreaterThan(70);
    expect(first.score).toBeGreaterThan(last.score);
  });

  it("normalizes Wikipedia and Amazon velocity on their own scales", () => {
    expect(normalizeVelocity("wikipedia", 25_000)).toBe(1);
    expect(normalizeVelocity("amazon", 400)).toBe(1);
    expect(normalizeVelocity("wikipedia", 400)).toBeLessThan(normalizeVelocity("amazon", 400));
  });
});
