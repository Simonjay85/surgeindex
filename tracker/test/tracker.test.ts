import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { createTracker } from "../src/tracker.js";

function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
    clear: () => map.clear(),
    key: () => null,
    get length() {
      return map.size;
    },
  };
}

function setup({ failTimes = 0 } = {}) {
  const sent: Array<{ url: string; body: string; beacon: boolean }> = [];
  let failuresLeft = failTimes;
  const storage = memoryStorage();
  const send = (url: string, body: string, beacon: boolean) => {
    if (failuresLeft > 0) {
      failuresLeft--;
      return false;
    }
    sent.push({ url, body, beacon });
    return true;
  };
  let clock = 1_700_000_000_000;
  const tracker = createTracker({
    siteKey: "pk_test_site",
    endpoint: "/api/collect/v1/events",
    storage,
    send,
    now: () => clock,
    heartbeatMs: 30_000,
  });
  return { tracker, sent, storage, advance: (ms: number) => (clock += ms), setFailures: (n: number) => (failuresLeft = n) };
}

describe("SurgeIndex tracker", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("emits session_start + pageview on start", () => {
    const h = setup();
    h.tracker.start();
    expect(h.sent.length).toBeGreaterThanOrEqual(2);
    const types = h.sent.map((s) => (JSON.parse(s.body) as { eventType: string }).eventType);
    expect(types[0]).toBe("session_start");
    expect(types).toContain("pageview");
    expect((JSON.parse(h.sent[0]!.body) as { siteKey: string }).siteKey).toBe("pk_test_site");
  });

  it("sends heartbeats on the configured interval and pauses when hidden", () => {
    const h = setup();
    h.tracker.start();
    const before = h.sent.length;
    vi.advanceTimersByTime(30_000);
    expect(h.sent.length).toBe(before + 1);
    vi.stubGlobal("document", { visibilityState: "hidden" });
    vi.advanceTimersByTime(90_000);
    expect(h.sent.length).toBe(before + 1); // paused while hidden
    vi.unstubAllGlobals();
  });

  it("detects SPA navigation", () => {
    const h = setup();
    h.tracker.start();
    const before = h.sent.length;
    const push = history.pushState;
    history.pushState = function (this: History, ...args: Parameters<typeof push>) {
      const r = push.apply(this, args);
      window.dispatchEvent(new PopStateEvent("popstate"));
      return r;
    };
    try {
      window.dispatchEvent(new PopStateEvent("popstate"));
    } finally {
      history.pushState = push;
    }
    expect(h.sent.length).toBeGreaterThan(before);
  });

  it("does not initialize twice", () => {
    const h = setup();
    h.tracker.start();
    const count = h.sent.length;
    h.tracker.start();
    expect(h.sent.length).toBe(count);
  });

  it("stops emitting after opt-out", () => {
    const h = setup();
    h.tracker.start();
    h.tracker.optOut();
    const count = h.sent.length;
    vi.advanceTimersByTime(120_000);
    expect(h.sent.length).toBe(count);
  });

  it("queues and retries failed sends with backoff", async () => {
    const h = setup({ failTimes: 1 });
    h.tracker.start();
    expect(h.sent.length).toBe(0); // first send failed
    h.setFailures(0);
    await vi.advanceTimersByTimeAsync(3_000);
    expect(h.sent.length).toBeGreaterThanOrEqual(1);
    expect(h.tracker.pendingRetryCount).toBe(0);
  });

  it("rotates the anonymous visitor id after 24h", async () => {
    const h = setup();
    h.tracker.start();
    const first = JSON.parse(h.sent[0]!.body) as { visitorId: string };
    h.advance(25 * 60 * 60 * 1000);
    h.tracker.forceHeartbeat();
    const second = JSON.parse(h.sent.at(-1)!.body) as { visitorId: string };
    expect(second.visitorId).not.toBe(first.visitorId);
  });

  it("never stores cookies or personal data", () => {
    const h = setup();
    h.tracker.start();
    const event = JSON.parse(h.sent[0]!.body) as Record<string, unknown>;
    const keys = Object.keys(event);
    expect(keys).not.toContain("email");
    expect(keys).not.toContain("ip");
    expect(JSON.stringify(event)).not.toContain("@");
  });
});
