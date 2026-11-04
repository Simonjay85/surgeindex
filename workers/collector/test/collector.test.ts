import { describe, expect, it, vi } from "vitest";
import type { NormalizedTrackerEvent } from "@surge/shared";
import worker, { type Env } from "../src/index";

const siteId = "11111111-1111-4111-8111-111111111111";
const siteKey = "pk_test_collector_provenance";
const domain = "owned.example.com";

function fixtureEvent(eventId = "22222222-2222-4222-8222-222222222222") {
  return {
    eventId,
    eventType: "pageview",
    siteKey,
    visitorId: "visitor-fixture-1",
    sessionId: "session-fixture-1",
    pathname: "/landing",
    trackerVersion: "3.0.0",
  };
}

function fixtureEnv(queued: NormalizedTrackerEvent[]): Env {
  return {
    EVENTS_QUEUE: {
      sendBatch: vi.fn(async (messages: Array<{ body: NormalizedTrackerEvent }>) => {
        queued.push(...messages.map((message) => message.body));
      }),
    } as unknown as Queue<NormalizedTrackerEvent>,
    REALTIME: {
      idFromName: vi.fn(),
      get: vi.fn(),
    } as unknown as DurableObjectNamespace,
    SITE_KEYS: {
      get: vi.fn(async () => ({ siteId, domains: [domain], status: "active", siteStatus: "active" })),
    } as unknown as KVNamespace,
    TRACKER_HASH_SECRET: "fixture-collector-hash-secret",
    TRACKER_SIGNING_SECRET: "fixture-collector-signing-secret",
  };
}

describe("collector provenance boundary", () => {
  it("classifies a wrong-Origin event at collection time before queue admission", async () => {
    const queued: NormalizedTrackerEvent[] = [];
    const request = new Request("https://collector.example.test/v1/events", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "https://evil.example",
        "user-agent": "Mozilla/5.0 (fixture browser)",
      },
      body: JSON.stringify(fixtureEvent()),
    });
    const response = await worker.fetch(request, fixtureEnv(queued), { waitUntil: vi.fn() } as unknown as ExecutionContext);
    const body = await response.json() as { accepted: number; rejected: number };

    expect(response.status).toBe(202);
    expect(body).toMatchObject({ accepted: 0, rejected: 1 });
    expect(queued).toHaveLength(1);
    expect(queued[0]).toMatchObject({ siteId, trackerPublicKey: siteKey, originHost: "evil.example", decision: "invalid", isDemo: false });
    expect(queued[0]?.fraudReasonCodes).toEqual(expect.arrayContaining(["invalid_site_origin", "disallowed_origin"]));
  });
});
