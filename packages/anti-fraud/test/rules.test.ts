import { describe, expect, it } from "vitest";
import {
  checkOutboundClick,
  checkTrackerEvent,
  fraudPenaltyFor,
  type FraudCheckInput,
} from "../src/index.js";

function input(overrides: Partial<FraudCheckInput> = {}): FraudCheckInput {
  return {
    eventType: "pageview",
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) SurgeTest/1.0",
    originHost: "launchpilot.example",
    refererHost: null,
    allowedDomains: ["launchpilot.example"],
    claimedOccurredAt: new Date().toISOString(),
    serverNow: new Date(),
    msSinceLastHeartbeat: null,
    visitorEventsLastMinute: null,
    sessionEventsLastMinute: null,
    duplicateEventId: false,
    sessionDurationMs: null,
    viewport: "1440x900",
    datacenterSignal: null,
    ...overrides,
  };
}

describe("checkTrackerEvent", () => {
  it("accepts a normal event as valid", () => {
    const v = checkTrackerEvent(input());
    expect(v.decision).toBe("valid");
    expect(v.score).toBe(0);
    expect(v.reasons).toEqual([]);
  });

  it("flags known bot user agents as invalid", () => {
    const v = checkTrackerEvent(
      input({ userAgent: "Mozilla/5.0 (compatible; AcmeBot/1.0; +https://acme.example/bot)" }),
    );
    expect(v.decision).toBe("invalid");
    expect(v.reasons).toContain("bot_user_agent");
  });

  it("flags headless automation UAs", () => {
    const v = checkTrackerEvent(input({ userAgent: "HeadlessChrome/122.0.0.0" }));
    expect(v.decision).toBe("invalid");
  });

  it("flags events whose origin does not match the site domains", () => {
    const v = checkTrackerEvent(input({ originHost: "evil.example" }));
    expect(v.reasons).toContain("invalid_site_origin");
    expect(v.decision).toBe("invalid");
  });

  it("allows subdomains of the registered domain", () => {
    const v = checkTrackerEvent(input({ originHost: "app.launchpilot.example" }));
    expect(v.decision).toBe("valid");
  });

  it("flags duplicate event ids (replay attacks)", () => {
    const v = checkTrackerEvent(input({ duplicateEventId: true }));
    expect(v.reasons).toContain("duplicate_event_id");
    expect(v.decision).toBe("invalid");
  });

  it("flags impossible heartbeat timing", () => {
    const v = checkTrackerEvent(
      input({ eventType: "heartbeat", msSinceLastHeartbeat: 3_000 }),
    );
    expect(v.reasons).toContain("impossible_heartbeat_timing");
    expect(v.decision).toBe("invalid");
  });

  it("accepts realistic heartbeat timing", () => {
    const v = checkTrackerEvent(
      input({ eventType: "heartbeat", msSinceLastHeartbeat: 31_000 }),
    );
    expect(v.decision).toBe("valid");
  });

  it("flags excessive visitor event frequency", () => {
    const v = checkTrackerEvent(input({ visitorEventsLastMinute: 40 }));
    expect(v.reasons).toContain("visitor_rate_exceeded");
    expect(v.decision).toBe("invalid");
  });

  it("flags client timestamp skew", () => {
    const past = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    const v = checkTrackerEvent(input({ claimedOccurredAt: past }));
    expect(v.reasons).toContain("timestamp_skew");
  });

  it("routes datacenter signals to review rather than invalid", () => {
    const v = checkTrackerEvent(input({ datacenterSignal: true }));
    expect(v.decision).toBe("review_required");
  });

  it("flags impossibly short sessions", () => {
    const v = checkTrackerEvent(
      input({ eventType: "session_end", sessionDurationMs: 400 }),
    );
    expect(v.reasons).toContain("impossible_session_duration");
  });

  it("records explicit key, replay, engagement, and referrer reason codes", () => {
    const v = checkTrackerEvent(input({
      invalidTrackerKey: true,
      revokedTrackerKey: true,
      replayedBatch: true,
      attributionTokenReplay: true,
      invalidEngagement: true,
      suspiciousReferrer: true,
    }));
    expect(v.decision).toBe("invalid");
    expect(v.reasons).toEqual(expect.arrayContaining([
      "invalid_tracker_key",
      "revoked_tracker_key",
      "replayed_batch",
      "attribution_token_replay",
      "invalid_engagement_duration",
      "suspicious_referrer",
    ]));
  });
});

describe("checkOutboundClick", () => {
  it("accepts a human click", () => {
    expect(checkOutboundClick({ userAgent: "Mozilla/5.0 Firefox/125.0", visitorClicksLast10m: 2 }).decision).toBe("valid");
  });

  it("flags bot clicks", () => {
    expect(checkOutboundClick({ userAgent: "curl/8.1", visitorClicksLast10m: 0 }).decision).toBe("invalid");
  });

  it("flags click flooding", () => {
    const v = checkOutboundClick({
      userAgent: "Mozilla/5.0 Firefox/125.0",
      visitorClicksLast10m: 30,
    });
    expect(v.reasons).toContain("click_rate_exceeded");
  });
});

describe("fraudPenaltyFor", () => {
  it("maps decisions to Heat Score penalties", () => {
    expect(fraudPenaltyFor("valid")).toBe(0);
    expect(fraudPenaltyFor("suspected")).toBe(0.25);
    expect(fraudPenaltyFor("review_required")).toBe(0.5);
    expect(fraudPenaltyFor("invalid")).toBe(1);
  });
});
