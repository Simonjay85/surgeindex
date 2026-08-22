import { describe, expect, it } from "vitest";
import { pruneRealtimeSessions, snapshotRealtimeSessions, type RealtimeSessionState } from "../src/realtime.js";

describe("site-level realtime state", () => {
  it("deduplicates active visitors while counting sessions/tabs", () => {
    const sessions = new Map<string, RealtimeSessionState>([
      ["tab-a", { visitorHash: "visitor-a", lastSeen: 1_000, visible: true }],
      ["tab-b", { visitorHash: "visitor-a", lastSeen: 1_000, visible: true }],
      ["browser-b", { visitorHash: "visitor-b", lastSeen: 1_000, visible: true }],
    ]);
    const snapshot = snapshotRealtimeSessions("site-1", sessions, 1_500);
    expect(snapshot.activeVisitors).toBe(2);
    expect(snapshot.activeSessions).toBe(3);
  });

  it("expires hidden and idle sessions without retaining visitor presence", () => {
    const sessions = new Map<string, RealtimeSessionState>([
      ["hidden", { visitorHash: "visitor-a", lastSeen: 9_500, visible: false }],
      ["expired", { visitorHash: "visitor-b", lastSeen: 1_000, visible: true }],
      ["fresh", { visitorHash: "visitor-c", lastSeen: 9_900, visible: true }],
    ]);
    pruneRealtimeSessions(sessions, 10_000, 1_000);
    expect([...sessions.keys()]).toEqual(["fresh"]);
  });
});
