import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { closeDb, getPostgresDb, outboundClick, site, trackerKey, trackerEvent, siteMetricCurrent } from "@surge/db";
import { PostgresEventStoreProvider } from "../src/postgres-provider.js";
import type { NormalizedTrackerEvent } from "@surge/shared";

const enabled = process.env.RUN_DB_TESTS === "1" && Boolean(process.env.DATABASE_URL);
const suffix = Date.now().toString(36);
const siteKey = `pk_test_${suffix}`;
const clickId = "33333333-3333-4333-8333-333333333333";
const now = new Date();
let siteId = "";

function event(input: Partial<NormalizedTrackerEvent> & Pick<NormalizedTrackerEvent, "eventId" | "eventType" | "visitorHash" | "sessionHash">): NormalizedTrackerEvent {
  return {
    siteId,
    pathname: "/home",
    referrerHost: null,
    receivedAt: now.toISOString(),
    occurredAt: now.toISOString(),
    clientOccurredAt: now.toISOString(),
    visible: true,
    engagedSeconds: null,
    trackerVersion: "3.0.0",
    attributionTokenHash: null,
    attributionClickId: null,
    trackerPublicKey: siteKey,
    originHost: "fixture.example.com",
    country: null,
    device: "desktop",
    decision: "valid",
    fraudScore: 0,
    fraudReasonCodes: [],
    fraudRuleVersion: "v1",
    collectorRequestId: `request-${suffix}`,
    isDemo: false,
    ...input,
  };
}

describe.skipIf(!enabled)("Postgres traffic event store", () => {
  beforeAll(async () => {
    const db = getPostgresDb();
    const [created] = await db.insert(site).values({ slug: `traffic-${suffix}`, domain: `fixture-${suffix}.example.com`, name: "Traffic fixture", status: "active", ownership: "claimed", isDemo: false }).returning({ id: site.id });
    siteId = created.id;
    await db.insert(trackerKey).values({ siteId, publicKey: siteKey, allowedDomains: ["fixture.example.com"], status: "active", environment: "test", activatedAt: now });
    await db.insert(outboundClick).values({ id: clickId, siteId, visitorHash: "click-visitor-hash", valid: true, decision: "valid", placement: "organic" });
  });

  afterAll(async () => {
    const db = getPostgresDb();
    if (siteId) await db.delete(site).where(eq(site.id, siteId));
    await closeDb();
  });

  it("deduplicates, excludes invalid events, updates active sessions, and attributes a landing", async () => {
    const provider = new PostgresEventStoreProvider();
    const events = [
      event({ eventId: "44444444-4444-4444-8444-444444444401", eventType: "session_start", visitorHash: "visitor-a", sessionHash: "session-a" }),
      event({ eventId: "44444444-4444-4444-8444-444444444402", eventType: "pageview", visitorHash: "visitor-a", sessionHash: "session-a", attributionTokenHash: "token-hash-a", attributionClickId: clickId }),
      event({ eventId: "44444444-4444-4444-8444-444444444403", eventType: "heartbeat", visitorHash: "visitor-a", sessionHash: "session-a" }),
      event({ eventId: "44444444-4444-4444-8444-444444444404", eventType: "session_start", visitorHash: "visitor-a", sessionHash: "session-b" }),
      event({ eventId: "44444444-4444-4444-8444-444444444405", eventType: "session_start", visitorHash: "visitor-b", sessionHash: "session-c" }),
      event({ eventId: "44444444-4444-4444-8444-444444444406", eventType: "engaged", visitorHash: "visitor-a", sessionHash: "session-a", engagedSeconds: 10 }),
      event({ eventId: "44444444-4444-4444-8444-444444444407", eventType: "pageview", visitorHash: "visitor-b", sessionHash: "session-c", decision: "invalid", fraudScore: 100, fraudReasonCodes: ["disallowed_origin"], originHost: "evil.example" }),
    ];
    const first = await provider.ingest(events);
    expect(first.inserted).toBe(7);
    expect(first.rejected).toBe(1);
    expect(first.duplicates).toBe(0);

    const duplicate = await provider.ingest(events);
    expect(duplicate.inserted).toBe(0);
    expect(duplicate.duplicates).toBe(7);

    const db = getPostgresDb();
    const [current] = await db.select().from(siteMetricCurrent).where(eq(siteMetricCurrent.siteId, siteId));
    expect(current?.visitors24h).toBe(2);
    expect(current?.sessions24h).toBe(3);
    expect(current?.pageviews24h).toBe(1);
    expect(current?.engagedSessions24h).toBe(1);
    expect(current?.activeNow).toBe(2);
    expect(current?.activeSessions).toBe(3);
    expect(current?.surgeAttributedVisits24h).toBe(1);
    expect(current?.surgeAttributedEngagedVisits24h).toBe(1);

    const stored = await db.select({ eventId: trackerEvent.eventId, visitorHash: trackerEvent.visitorHash, decision: trackerEvent.decision, pathname: trackerEvent.pathname, referrerHost: trackerEvent.referrerHost }).from(trackerEvent).where(eq(trackerEvent.siteId, siteId));
    expect(stored).toHaveLength(7);
    expect(stored.some((row) => row.decision === "invalid")).toBe(true);
    expect(stored.every((row) => row.visitorHash !== "192.0.2.10" && !row.pathname.includes("?"))).toBe(true);
  });
});
