import { describe, expect, it } from "vitest";
import { computeFanwardImpact, FANWARD_IMPACT_VERSION, type FanwardImpactInput } from "../src/fanward-impact";

const base: FanwardImpactInput = {
  eligible: true,
  verification: "tracker",
  rankingState: "eligible",
  sourceConfidence: 0.8,
  sourceVersion: "heat-v1",
  source: "tracker",
  updatedAt: "2026-08-30T00:00:00.000Z",
  components: {
    growthVelocity: { normalizedValue: 80, available: true },
    liveAcceleration: { normalizedValue: 50, available: true },
    trafficVolume: { normalizedValue: 70, available: true },
    engagementQuality: { normalizedValue: 60, available: true },
    trustConfidence: { normalizedValue: 90, available: true },
  },
};

describe("computeFanwardImpact", () => {
  it("derives the versioned score only from accepted site components", () => {
    const result = computeFanwardImpact(base);
    expect(result.version).toBe(FANWARD_IMPACT_VERSION);
    expect(result.components.attentionMomentum.score).toBe(68);
    expect(result.score).toBe(71.4);
    expect(result.confidence).toBe(0.8);
    expect(Object.values(result.components).reduce((sum, component) => sum + component.appliedWeight, 0)).toBeCloseTo(1);
  });

  it("renormalizes missing signals and lowers confidence by configured coverage", () => {
    const result = computeFanwardImpact({
      ...base,
      components: {
        trafficVolume: { normalizedValue: 80, available: true },
        growthVelocity: { normalizedValue: 50, available: true },
      },
    });
    expect(result.components.attentionMomentum.score).toBe(50);
    expect(result.score).toBe(65);
    expect(result.confidence).toBe(0.48);
    expect(result.components.verifiedReach).toMatchObject({ configuredWeight: 0.3, appliedWeight: 0.5 });
    expect(result.components.engagementQuality.appliedWeight).toBe(0);
  });

  it.each(["unverified", "building_baseline", "fraud_review", "suspended", "ineligible"] as const)(
    "fails closed for %s source state",
    (rankingState) => {
      const result = computeFanwardImpact({ ...base, rankingState });
      expect(result.score).toBeNull();
      expect(result.confidence).toBe(0);
    },
  );

  it("fails closed when exact site eligibility is false", () => {
    expect(computeFanwardImpact({ ...base, eligible: false }).score).toBeNull();
    expect(computeFanwardImpact({ ...base, verification: "unverified" }).score).toBeNull();
  });

  it("keeps provisional and stale displays bounded", () => {
    const high = {
      ...base,
      components: Object.fromEntries(Object.keys(base.components).map((key) => [key, { normalizedValue: 100, available: true }])),
    } as FanwardImpactInput;
    expect(computeFanwardImpact({ ...high, rankingState: "provisional" }).score).toBe(79);
    expect(computeFanwardImpact({ ...high, rankingState: "stale" }).score).toBe(60);
  });
});
