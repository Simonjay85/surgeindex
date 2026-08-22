/**
 * SurgeIndex tracker — a lightweight, privacy-first browser script.
 *
 * Design constraints (spec §16):
 *  - Loaded with `defer`, never render-blocking.
 *  - No cookies, no personal data, no page content, no full IPs.
 *  - Anonymous rotating visitor id (localStorage, rotated every 24h).
 *  - Heartbeat ~30s while visible; paused when hidden.
 *  - SPA navigation via history API patching.
 *  - sendBeacon with keepalive fetch fallback and conservative retry.
 *  - Explicit opt-out respected (localStorage flag + DNT policy documented).
 */

interface TrackerConfig {
  siteKey: string;
  endpoint: string;
  heartbeatMs?: number;
  /** Overridable for tests. */
  storage?: StorageLike;
  send?: SendFn;
  now?: () => number;
}

interface StorageLike {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
  removeItem(k: string): void;
}

type SendFn = (url: string, body: string, useBeacon: boolean) => boolean | void;

const VISITOR_KEY = "si_vid";
const OPT_OUT_KEY = "si_opt_out";
const VISITOR_TTL_MS = 24 * 60 * 60 * 1000;
const HEARTBEAT_MS = 30_000;
const RETRY_DELAYS = [1000, 5000, 15000];

export type TrackerEventType =
  | "pageview"
  | "session_start"
  | "heartbeat"
  | "engaged"
  | "session_end";

interface TrackerEvent {
  eventId: string;
  eventType: TrackerEventType;
  siteKey: string;
  visitorId: string;
  sessionId: string;
  pathname: string;
  referrerHost?: string;
  occurredAt: string;
  viewport?: string;
  locale?: string;
}

function randomId(): string {
  const c = globalThis.crypto;
  if (c && "randomUUID" in c) return c.randomUUID();
  // Fallback for exotic environments
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    const v = ch === "x" ? r : (r & 0x3) | 0x8;
  return v.toString(16);
  });
}

function getVisitorId(storage: StorageLike, now: number): string {
  try {
    const raw = storage.getItem(VISITOR_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as { id: string; ts: number };
      if (now - parsed.ts < VISITOR_TTL_MS) {
        return parsed.id;
      }
    }
  } catch {
    // corrupted entry — rotate
  }
  const id = randomId();
  try {
    storage.setItem(VISITOR_KEY, JSON.stringify({ id, ts: now }));
  } catch {
    // storage unavailable (private mode) — ephemeral id is acceptable
  }
  return id;
}

export function createTracker(config: TrackerConfig) {
  const heartbeatMs = config.heartbeatMs ?? HEARTBEAT_MS;
  const storage: StorageLike =
    config.storage ??
    (typeof localStorage !== "undefined"
      ? localStorage
      : { getItem: () => null, setItem: () => {}, removeItem: () => {} });
  const now = config.now ?? (() => Date.now());
  const send: SendFn =
    config.send ??
    ((url, body, useBeacon) => {
      const nav = navigator as Navigator & { sendBeacon?: (u: string, d?: BodyInit) => boolean };
      if (useBeacon && typeof nav.sendBeacon === "function") {
        try {
          return nav.sendBeacon(url, body);
        } catch {
          // fall through to fetch
        }
      }
      void fetch(url, {
        method: "POST",
        body,
        keepalive: true,
        headers: { "Content-Type": "application/json" },
      }).catch(() => {});
      return true;
    });

  let sessionId = randomId();
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  let engaged = false;
  let started = false;
  let lastHeartbeatAt = 0;
  let lastSendFailed = false;
  const queue: Array<{ event: TrackerEvent; attempt: number }> = [];
  let retryTimer: ReturnType<typeof setTimeout> | null = null;

  function isOptedOut(): boolean {
    try {
      return storage.getItem(OPT_OUT_KEY) === "1";
    } catch {
      return false;
    }
  }

  function buildEvent(eventType: TrackerEventType): TrackerEvent {
    return {
      eventId: randomId(),
      eventType,
      siteKey: config.siteKey,
      visitorId: getVisitorId(storage, now()),
      sessionId,
      pathname: typeof location !== "undefined" ? location.pathname : "/",
      referrerHost:
        typeof document !== "undefined" && document.referrer
          ? new URL(document.referrer).host
          : undefined,
      occurredAt: new Date(now()).toISOString(),
      viewport:
        typeof screen !== "undefined" ? `${screen.width}x${screen.height}` : undefined,
      locale: typeof navigator !== "undefined" ? navigator.language : undefined,
    };
  }

  function emit(eventType: TrackerEventType, useBeacon = false): TrackerEvent {
    const event = buildEvent(eventType);
    const body = JSON.stringify(event);
    const ok = send(config.endpoint, body, useBeacon);
    if (ok === false) {
      lastSendFailed = true;
      queue.push({ event, attempt: 0 });
      scheduleRetry();
    } else {
      lastSendFailed = false;
    }
    return event;
  }

  function scheduleRetry() {
    if (retryTimer !== null) return;
    retryTimer = setTimeout(() => {
      retryTimer = null;
      // Conservative backoff: re-send queued events, dropping them after
      // the final attempt rather than looping forever.
      for (let i = queue.length - 1; i >= 0; i--) {
        const item = queue[i]!;
        if (item.attempt >= RETRY_DELAYS.length) {
          queue.splice(i, 1);
          continue;
        }
        const delay = RETRY_DELAYS[item.attempt] ?? RETRY_DELAYS[RETRY_DELAYS.length - 1] ?? 1000;
        queue.splice(i, 1);
        setTimeout(() => {
          const ok = send(config.endpoint, JSON.stringify(item.event), false);
          if (ok === false) {
            item.attempt += 1;
            queue.push(item);
            scheduleRetry();
          }
        }, delay);
      }
    }, 2000);
  }

  function startHeartbeat() {
    stopHeartbeat();
    lastHeartbeatAt = now();
    heartbeatTimer = setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") {
        return; // paused while hidden — spec §16
      }
      lastHeartbeatAt = now();
      emit("heartbeat");
    }, heartbeatMs);
  }

  function stopHeartbeat() {
    if (heartbeatTimer !== null) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
  }

  function armEngagement() {
    if (engaged || typeof document === "undefined") return;
    const markEngaged = () => {
      if (!engaged) {
        engaged = true;
        emit("engaged");
      }
    };
    const events = ["keydown", "mousedown", "touchstart", "scroll"] as const;
    for (const ev of events) {
      document.addEventListener(ev, markEngaged, { once: true, passive: true, capture: true });
    }
  }

  function trackNavigation() {
    emit("pageview");
    armEngagement();
  }

  function patchHistory() {
    const wrap = (name: "pushState" | "replaceState") => {
      const original = history[name];
      if (typeof original !== "function") return;
      history[name] = function (this: History, ...args: Parameters<typeof original>) {
        const result = original.apply(this, args);
        trackNavigation();
        return result;
      };
    };
    wrap("pushState");
    wrap("replaceState");
    window.addEventListener("popstate", trackNavigation);
  }

  return {
    start() {
      if (started) return; // duplicate initialization guard
      started = true;
      if (isOptedOut()) return;
      emit("session_start");
      if (lastSendFailed) {
        // Keep the initial pageview with the same retry window when the first
        // delivery already proved the connection is unavailable.
        queue.push({ event: buildEvent("pageview"), attempt: 0 });
        scheduleRetry();
        armEngagement();
      } else {
        trackNavigation();
      }
      startHeartbeat();
      patchHistory();
      const onVisible = () => {
        if (document.visibilityState === "visible") {
          // Restart heartbeat cadence after returning to the tab.
          startHeartbeat();
        } else {
          stopHeartbeat();
          lastHeartbeatAt = now();
        }
      };
      document.addEventListener("visibilitychange", onVisible);
      window.addEventListener("pagehide", () => {
        stopHeartbeat();
        emit("session_end", true);
      });
    },
    /** Exposed for the host page / tests. */
    optOut() {
      try {
        storage.setItem(OPT_OUT_KEY, "1");
      } catch {
        // ignore
      }
      stopHeartbeat();
    },
    get sessionId_() {
      return sessionId;
    },
    get pendingRetryCount() {
      return queue.length;
    },
    forceHeartbeat() {
      lastHeartbeatAt = now();
      return emit("heartbeat");
    },
  };
}

/** Auto-initialize from the script tag's data-site attribute. */
export function autoInit(endpoint: string) {
  const script =
    document.currentScript instanceof HTMLScriptElement ? document.currentScript : null;
  const siteKey = script?.dataset.site;
  if (!siteKey) {
    console.warn("[surgeindex] tracker loaded without data-site key");
    return;
  }
  createTracker({ siteKey, endpoint }).start();
}
