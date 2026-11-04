import { describe, expect, it } from "vitest";
import { evaluateBreakout, type PreviousBreakout } from "../src/index.js";

const baseInput = {
  baselineVisitors: 100,
  activeNow: 20,
  typicalActiveNow: 10,
  dataConfidence: 0.9,
  freshness: "fresh" as const,
  suspicionRatio: 0,
  validTraffic: true,
};

describe("breakout state machine", () => {
  it("requires persistence before publishing a breakout", () => {
    const start = new Date("2026-08-23T12:00:00.000Z");
    const watch = evaluateBreakout({ ...baseInput, currentVisitors: 300 }, null, start);
    expect(watch.state).toBe("watch");
    expect(watch.shouldPublish).toBe(false);

    const previous: PreviousBreakout = { state: watch.state, activeSince: watch.activeSince, lastEvaluatedAt: start, cooldownUntil: null };
    const active = evaluateBreakout({ ...baseInput, currentVisitors: 300 }, previous, new Date(start.getTime() + 15 * 60_000));
    expect(active.state).toBe("breaking_out");
    expect(active.shouldPublish).toBe(true);
    expect(active.reasonCodes).toContain("persistence_met");
  });

  it("distinguishes exceptional surges and then enters cooling", () => {
    const start = new Date("2026-08-23T12:00:00.000Z");
    const previous: PreviousBreakout = { state: "breaking_out", activeSince: new Date(start.getTime() - 30 * 60_000), lastEvaluatedAt: start, cooldownUntil: null };
    const surge = evaluateBreakout({ ...baseInput, currentVisitors: 1_000, activeNow: 25 }, previous, new Date(start.getTime() + 5 * 60_000));
    expect(surge.state).toBe("surging");
    expect(surge.strength).toBe("exceptional");

    const cooling = evaluateBreakout({ ...baseInput, currentVisitors: 200 }, { ...previous, state: "surging", lastEvaluatedAt: start }, new Date(start.getTime() + 5 * 60_000));
    expect(cooling.state).toBe("cooling");
    expect(cooling.reasonCodes).toContain("below_entry_threshold");
  });

  it("invalidates a live breakout when traffic quality or freshness fails", () => {
    const result = evaluateBreakout({ ...baseInput, currentVisitors: 500, freshness: "offline", validTraffic: false }, { state: "breaking_out", activeSince: "2026-08-23T11:00:00.000Z", lastEvaluatedAt: "2026-08-23T12:00:00.000Z", cooldownUntil: null }, new Date("2026-08-23T12:05:00.000Z"));
    expect(result.state).toBe("invalidated");
    expect(result.shouldPublish).toBe(false);
    expect(result.reasonCodes).toContain("insufficient_valid_traffic");
  });

  it("does not re-alert during the resolved-event cooldown", () => {
    const now = new Date("2026-08-23T12:30:00.000Z");
    const result = evaluateBreakout({ ...baseInput, currentVisitors: 400 }, { state: "resolved", activeSince: null, lastEvaluatedAt: "2026-08-23T12:00:00.000Z", cooldownUntil: "2026-08-23T13:00:00.000Z" }, now);
    expect(result.state).toBe("resolved");
    expect(result.shouldPublish).toBe(false);
    expect(result.reasonCodes).toContain("cooldown_active");
  });
});
