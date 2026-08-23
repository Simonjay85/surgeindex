import { describe, expect, it } from "vitest";
import { assertBoostTransition, buildBoostReport, deliveryPacing, forecastInventory, qualifiesViewability } from "../src";

describe("Boost domain contracts", () => {
  it("rejects invalid state transitions", () => {
    expect(() => assertBoostTransition("draft", "active")).toThrow("invalid_boost_transition");
    expect(() => assertBoostTransition("paid", "scheduled")).not.toThrow();
  });

  it("keeps price and delivery calculations separate from ranking", () => {
    const forecast = forecastInventory({ estimatedOpportunities: 100_000, qualifiedViewabilityRate: 0.6, reservedImpressions: 10_000, requestedImpressions: 40_000, safetyMargin: 0.1 });
    expect(forecast.status).toBe("available");
    const report = buildBoostReport({ targetQualifiedImpressions: 40_000, qualifiedImpressions: 20_000, renderedImpressions: 25_000, invalidImpressions: 2_000, clicks: 500, validClicks: 450, uniqueClicks: 400, attributedVisits: null, attributedEngagedVisits: null, amountPaidCents: 14900, currency: "USD" });
    expect(report.ctr).toBeCloseTo(0.0225);
    expect(report.effectiveCostPerAttributedVisitCents).toBeNull();
  });

  it("requires configured viewability and paces ahead campaigns", () => {
    expect(qualifiesViewability({ visiblePercent: 50, visibleMilliseconds: 1000, requiredPercent: 50, requiredMilliseconds: 1000 })).toBe(true);
    const result = deliveryPacing({ targetQualifiedImpressions: 100, qualifiedImpressionsDelivered: 90, startsAt: new Date("2026-01-01T00:00:00Z"), endsAt: new Date("2026-01-02T00:00:00Z"), now: new Date("2026-01-01T06:00:00Z"), maxOverdeliveryPercent: 5 });
    expect(result.state).toBe("ahead");
    expect(result.allowedDelivery).toBe(false);
  });
});
