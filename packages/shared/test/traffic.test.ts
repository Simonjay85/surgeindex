import { describe, expect, it } from "vitest";
import {
  flattenTrackerBatch,
  normalizePathname,
  normalizeReferrerHost,
  trackerBatchSchema,
  trackerEventSchema,
} from "../src/traffic.js";

const event = {
  eventId: "11111111-1111-4111-8111-111111111111",
  eventType: "pageview" as const,
  siteKey: "pk_test_fixture_site",
  visitorId: "visitor-12345678",
  sessionId: "session-12345678",
  pathname: "/pricing?email=should-not-persist#plans",
  referrerHost: "https://www.example.com/landing?private=value",
  occurredAt: "2026-08-23T00:00:00.000Z",
  trackerVersion: "3.0.0",
};

describe("normalized tracker contract", () => {
  it("accepts only the bounded first-party event shape", () => {
    const parsed = trackerEventSchema.parse(event);
    expect(parsed.eventType).toBe("pageview");
    expect(trackerEventSchema.safeParse({ ...event, email: "private@example.com" }).success).toBe(false);
  });

  it("supports single events and bounded batches", () => {
    expect(flattenTrackerBatch(trackerBatchSchema.parse(event))).toHaveLength(1);
    expect(flattenTrackerBatch(trackerBatchSchema.parse({ events: [event, { ...event, eventId: "22222222-2222-4222-8222-222222222222" }] }))).toHaveLength(2);
    expect(trackerBatchSchema.safeParse({ events: Array.from({ length: 21 }, (_, index) => ({ ...event, eventId: `11111111-1111-4111-8111-${String(index).padStart(12, "0")}` })) }).success).toBe(false);
  });

  it("strips query strings, fragments, control characters, and duplicate slashes", () => {
    expect(normalizePathname("offers//spring?customer=email@example.com#checkout\u0000")).toBe("/offers/spring");
    expect(normalizePathname("")).toBe("/");
  });

  it("keeps only a normalized referrer hostname", () => {
    expect(normalizeReferrerHost("https://www.Example.com/path?email=private@example.com")).toBe("example.com");
    expect(normalizeReferrerHost("https://user:pass@example.com")).toBeNull();
    expect(normalizeReferrerHost("localhost:3000")).toBeNull();
  });
});
