import { describe, expect, it, vi } from "vitest";
import type { NormalizedTrackerEvent } from "@surge/shared";
import worker from "../src/index.js";

function event(id = "55555555-5555-4555-8555-555555555555"): NormalizedTrackerEvent {
  return {
    eventId: id,
    eventType: "pageview",
    siteId: "66666666-6666-4666-8666-666666666666",
    visitorHash: "a".repeat(64),
    sessionHash: "b".repeat(64),
    pathname: "/",
    referrerHost: null,
    receivedAt: new Date().toISOString(),
    occurredAt: new Date().toISOString(),
    clientOccurredAt: new Date().toISOString(),
    visible: true,
    engagedSeconds: null,
    trackerVersion: "3.0.0",
    attributionTokenHash: null,
    attributionClickId: null,
    trackerPublicKey: "pk_test_queue",
    originHost: "fixture.example.com",
    country: null,
    device: "desktop",
    decision: "valid",
    fraudScore: 0,
    fraudReasonCodes: [],
    fraudRuleVersion: "v1",
    collectorRequestId: "queue-test",
    isDemo: false,
  };
}

function message(body: NormalizedTrackerEvent, attempts = 1) {
  return { body, attempts, ack: vi.fn(), retry: vi.fn() };
}

describe("Cloudflare queue consumer contract", () => {
  it("deduplicates a batch and marks successful delivery", async () => {
    const first = event();
    const second = event("77777777-7777-4777-8777-777777777777");
    const messages = [message(first), message(first), message(second)];
    const kv = { get: vi.fn().mockResolvedValue(null), put: vi.fn().mockResolvedValue(undefined) };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 202 })));
    await worker.queue({ messages } as never, { ANALYTICS_PROVIDER: "postgres", INTERNAL_INGEST_URL: "https://app.test/internal", INTERNAL_SERVICE_TOKEN: "secret", PROCESSED_EVENT_IDS: kv } as never);
    expect(fetch).toHaveBeenCalledTimes(1);
    const request = vi.mocked(fetch).mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(String(request.body)).events).toHaveLength(2);
    expect(messages.every((item) => item.ack.mock.calls.length === 1)).toBe(true);
    expect(kv.put).toHaveBeenCalledTimes(2);
  });

  it("retries transient analytics failures so Cloudflare can move exhausted messages to the configured DLQ", async () => {
    const item = message(event(), 2);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("temporary failure", { status: 503 })));
    await worker.queue({ messages: [item] } as never, { ANALYTICS_PROVIDER: "postgres", INTERNAL_INGEST_URL: "https://app.test/internal", INTERNAL_SERVICE_TOKEN: "secret" } as never);
    expect(item.retry).toHaveBeenCalledWith({ delaySeconds: 20 });
    expect(item.ack).not.toHaveBeenCalled();
  });
});
