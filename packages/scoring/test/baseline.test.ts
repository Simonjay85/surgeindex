import { describe, expect, it } from "vitest";
import { buildHistoricalBaseline, median, medianAbsoluteDeviation } from "../src/index.js";

const now = new Date("2026-08-23T12:00:00.000Z");

describe("historical baseline", () => {
  it("uses the median and stays robust to one historical spike", () => {
    const baseline = buildHistoricalBaseline([
      { capturedAt: "2026-08-16T12:00:00.000Z", visitors: 100, activeNow: 8 },
      { capturedAt: "2026-08-09T12:00:00.000Z", visitors: 110, activeNow: 9 },
      { capturedAt: "2026-08-02T12:00:00.000Z", visitors: 10_000, activeNow: 500 },
    ], now);
    expect(baseline.method).toBe("same_weekday_hour");
    expect(baseline.expectedVisitors).toBe(110);
    expect(baseline.upperBound).toBeLessThan(1_000);
    expect(baseline.typicalActiveNow).toBe(9);
  });

  it("falls back from same weekday/hour to same hour and then recent observations", () => {
    const sameHour = buildHistoricalBaseline([
      { capturedAt: "2026-08-22T12:00:00.000Z", visitors: 80 },
      { capturedAt: "2026-08-21T12:00:00.000Z", visitors: 90 },
      { capturedAt: "2026-08-20T12:00:00.000Z", visitors: 100 },
      { capturedAt: "2026-08-19T12:00:00.000Z", visitors: 110 },
    ], now);
    expect(sameHour.method).toBe("same_hour");
    expect(sameHour.expectedVisitors).toBe(95);

    const recent = buildHistoricalBaseline([
      { capturedAt: "2026-08-23T08:00:00.000Z", visitors: 20 },
      { capturedAt: "2026-08-22T08:00:00.000Z", visitors: 30 },
      { capturedAt: "2026-08-21T08:00:00.000Z", visitors: 40 },
    ], now);
    expect(recent.method).toBe("rolling_recent");
    expect(recent.expectedVisitors).toBe(30);
  });

  it("does not fabricate a baseline when history is insufficient", () => {
    const baseline = buildHistoricalBaseline([{ capturedAt: "2026-08-23T11:00:00.000Z", visitors: 50 }], now);
    expect(baseline.status).toBe("building_baseline");
    expect(baseline.expectedVisitors).toBeNull();
    expect(baseline.confidence).toBe(0);
  });

  it("keeps the robust statistics deterministic", () => {
    expect(median([5, 1, 3, 100])).toBe(4);
    expect(medianAbsoluteDeviation([5, 1, 3, 100], 4)).toBe(2);
  });
});
