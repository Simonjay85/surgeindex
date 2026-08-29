import { describe, expect, it } from "vitest";
import { getBreakouts, getLeaderboard, getSite, getTimeseries } from "../lib/demo-data";
import { isSafeInternalPath, safeDomain, safeInternalPath } from "../lib/utils";

describe("SurgeIndex demo index", () => {
  it("keeps ranking deterministic and applies the requested category", () => {
    const first = getLeaderboard("live");
    const second = getLeaderboard("live");
    expect(first.map((site) => site.slug)).toEqual(second.map((site) => site.slug));
    expect(getLeaderboard("live", "ai-tools").every((site) => site.categorySlug === "ai-tools")).toBe(true);
  });

  it("returns a computed profile rank and related time series", () => {
    const site = getSite("launchpilot-ai");
    expect(site?.rank).toBeGreaterThan(0);
    expect(getTimeseries("launchpilot-ai", "visitors")).toHaveLength(12);
  });

  it("surfaces breakout signals without pretending unverified volume is verified", () => {
    const breakout = getBreakouts();
    expect(breakout.length).toBeGreaterThan(0);
    expect(breakout.every((item) => item.isDemo)).toBe(true);
  });

  it("normalizes public domain input without accepting private hosts", () => {
    expect(safeDomain("https://LaunchPilot.ai/path")).toBe("launchpilot.ai");
    expect(safeDomain("localhost:3000")).toBeNull();
  });

  it("keeps authentication redirects on same-origin internal paths", () => {
    expect(safeInternalPath("/submit")).toBe("/submit");
    expect(safeInternalPath("/dashboard?tab=sites")).toBe("/dashboard?tab=sites");
    expect(safeInternalPath("//evil.example/login")).toBe("/dashboard");
    expect(safeInternalPath("/%2F%2Fevil.example/login")).toBe("/dashboard");
    expect(safeInternalPath("/\\\\evil.example/login")).toBe("/dashboard");
    expect(isSafeInternalPath("https://evil.example")).toBe(false);
    expect(isSafeInternalPath("/auth/sign-in")).toBe(true);
  });
});
