/**
 * SurgeIndex first-party tracker.
 *
 * The browser only sends a site public key, anonymous first-party IDs,
 * pathname, referrer hostname, timing fields, and an optional opaque
 * attribution token. It never reads form values, page text, document titles,
 * cookies, or full URLs beyond the one attribution parameter.
 */

export type TrackerEventType = "pageview" | "session_start" | "heartbeat" | "engaged" | "session_end";

export interface TrackerEvent {
  eventId: string;
  eventType: TrackerEventType;
  siteKey: string;
  visitorId: string;
  sessionId: string;
  pathname: string;
  referrerHost?: string;
  occurredAt: string;
  visible?: boolean;
  engagedSeconds?: number;
  trackerVersion: string;
  attributionToken?: string;
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export type SendFn = (url: string, body: string, useBeacon: boolean) => boolean | void;

export interface TrackerConfig {
  siteKey: string;
  endpoint: string;
  heartbeatMs?: number;
  engagedAfterMs?: number;
  trackerVersion?: string;
  consentRequired?: boolean;
  consentGranted?: boolean;
  storage?: StorageLike;
  sessionStorage?: StorageLike;
  send?: SendFn;
  now?: () => number;
}

const VISITOR_TTL_MS = 24 * 60 * 60 * 1000;
const DEFAULT_HEARTBEAT_MS = 30_000;
const DEFAULT_ENGAGED_AFTER_MS = 10_000;
const RETRY_DELAYS = [1000, 5000, 15_000];
const ATTRIBUTION_PARAM = "_si_at";
const OPT_OUT_KEY = "si_opt_out";
const CONSENT_KEY = "si_consent";
const TRACKER_VERSION = "3.0.0";

const noopStorage: StorageLike = { getItem: () => null, setItem: () => {}, removeItem: () => {} };

function randomId(): string {
  const c = globalThis.crypto;
  if (c && "randomUUID" in c) return c.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    const v = ch === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function browserStorage(name: "localStorage" | "sessionStorage"): StorageLike {
  try {
    const value = globalThis[name];
    return value && typeof value.getItem === "function" ? value : noopStorage;
  } catch {
    return noopStorage;
  }
}

function getVisitorId(storage: StorageLike, siteKey: string, now: number): string {
  const key = `si_vid:${siteKey}`;
  try {
      const value = storage.getItem(key);
    if (value) {
      const parsed = JSON.parse(value) as { id?: string; ts?: number };
      if (parsed.id && typeof parsed.ts === "number" && now - parsed.ts < VISITOR_TTL_MS) return parsed.id;
    }
  } catch {
    // Rotate a corrupt identifier below.
  }
  const id = randomId();
  try {
    storage.setItem(key, JSON.stringify({ id, ts: now }));
  } catch {
    // Private browsing may reject storage; an ephemeral ID is still safe.
  }
  return id;
}

function pathname(): string {
  if (typeof location === "undefined") return "/";
  const raw = location.pathname || "/";
  const segments = raw
    .replace(/^\/+/, "")
    .split(/\/+/)
    .filter(Boolean)
    .map((segment) => {
      // Keep useful route labels while replacing common user/order identifiers.
      // The server-side integration separately blocks account and checkout paths.
      if (
        segment.length > 64 ||
        /@/.test(segment) ||
        /^\d{1,32}$/.test(segment) ||
        /^[0-9a-f]{16,}$/i.test(segment) ||
        /^[0-9a-f]{8}-[0-9a-f-]{8,}$/i.test(segment) ||
        /^[A-Za-z0-9_-]{24,}$/.test(segment)
      ) return ":id";
      return segment.replace(/[^A-Za-z0-9._~-]/g, "-").slice(0, 64) || ":id";
    });
  return `/${segments.join("/")}`.slice(0, 512) || "/";
}

function referrerHost(): string | undefined {
  if (typeof document === "undefined" || !document.referrer) return undefined;
  try {
    const host = new URL(document.referrer).hostname.toLowerCase().replace(/^www\./, "");
    return /^[a-z0-9.-]{1,253}$/.test(host) ? host : undefined;
  } catch {
    return undefined;
  }
}

function captureAttributionToken(): string | undefined {
  if (typeof location === "undefined") return undefined;
  try {
    const url = new URL(location.href);
    const token = url.searchParams.get(ATTRIBUTION_PARAM) ?? undefined;
    if (!token || !/^[A-Za-z0-9._~-]{16,512}$/.test(token)) return undefined;
    url.searchParams.delete(ATTRIBUTION_PARAM);
    if (typeof history !== "undefined" && typeof history.replaceState === "function") {
      history.replaceState(history.state, document.title, `${url.pathname}${url.search}${url.hash}`);
    }
    return token;
  } catch {
    return undefined;
  }
}

export function createTracker(config: TrackerConfig) {
  const heartbeatMs = Math.max(10_000, config.heartbeatMs ?? DEFAULT_HEARTBEAT_MS);
  const engagedAfterMs = Math.max(1000, config.engagedAfterMs ?? DEFAULT_ENGAGED_AFTER_MS);
  const storage = config.storage ?? browserStorage("localStorage");
  // Never fall back to localStorage for a tab/session identifier. A local
  // storage fallback would make two tabs look like one active session.
  const sessionStorage = config.sessionStorage ?? browserStorage("sessionStorage");
  const now = config.now ?? (() => Date.now());
  const send: SendFn = config.send ?? ((url, body, useBeacon) => {
    const nav = typeof navigator !== "undefined" ? (navigator as Navigator & { sendBeacon?: (u: string, d?: BodyInit) => boolean }) : null;
    if (useBeacon && nav?.sendBeacon) {
      try {
        if (nav.sendBeacon(url, body)) return true;
      } catch {
        // Fall through to keepalive fetch.
      }
    }
    if (typeof fetch === "function") {
      void fetch(url, { method: "POST", body, keepalive: true, headers: { "Content-Type": "application/json" } }).catch(() => {});
    }
    return true;
  });

  let visitorId = getVisitorId(storage, config.siteKey, now());
  let sessionId = readOrCreateSession(sessionStorage, config.siteKey);
  let attributionToken: string | undefined;
  let started = false;
  let active = false;
  let waitingForConsent = Boolean(config.consentRequired && !config.consentGranted && readConsent(storage) !== "granted");
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  let engagementTimer: ReturnType<typeof setTimeout> | null = null;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  const retryTimers = new Set<ReturnType<typeof setTimeout>>();
  let retryGeneration = 0;
  let engaged = false;
  let visibleSince = 0;
  let visibleAccumulatedMs = 0;
  let lastSendFailed = false;
  const retryQueue: Array<{ event: TrackerEvent; attempt: number }> = [];
  const originalHistory: { pushState?: History["pushState"]; replaceState?: History["replaceState"] } = {};

  function optedOut(): boolean {
    try {
      return storage.getItem(OPT_OUT_KEY) === "1" || (typeof window !== "undefined" && (window as Window & { __SURGEINDEX_OPTOUT__?: boolean }).__SURGEINDEX_OPTOUT__ === true);
    } catch {
      return false;
    }
  }

  function canSend(): boolean {
    return active && !waitingForConsent && !optedOut();
  }

  function buildEvent(eventType: TrackerEventType): TrackerEvent {
    visitorId = getVisitorId(storage, config.siteKey, now());
    const event: TrackerEvent = {
      eventId: randomId(),
      eventType,
      siteKey: config.siteKey,
      visitorId,
      sessionId,
      pathname: pathname(),
      occurredAt: new Date(now()).toISOString(),
      trackerVersion: config.trackerVersion ?? TRACKER_VERSION,
    };
    const host = referrerHost();
    if (host) event.referrerHost = host;
    if (eventType !== "session_end") event.visible = typeof document === "undefined" || document.visibilityState !== "hidden";
    if (eventType === "engaged") event.engagedSeconds = Math.max(1, Math.round(Math.max(visibleAccumulatedMs, engagedAfterMs) / 1000));
    if (attributionToken) event.attributionToken = attributionToken;
    return event;
  }

  function emit(eventType: TrackerEventType, useBeacon = false): TrackerEvent {
    const event = buildEvent(eventType);
    if (!canSend()) return event;
    const ok = send(config.endpoint, JSON.stringify(event), useBeacon);
    if (ok === false) {
      lastSendFailed = true;
      retryQueue.push({ event, attempt: 0 });
      scheduleRetry();
    } else {
      lastSendFailed = false;
    }
    return event;
  }

  function scheduleRetry() {
    if (retryTimer !== null || retryQueue.length === 0) return;
    const generation = retryGeneration;
    retryTimer = setTimeout(() => {
      retryTimer = null;
      if (generation !== retryGeneration || !canSend()) return;
      const pending = retryQueue.splice(0, retryQueue.length);
      for (const item of pending) {
        const delay = RETRY_DELAYS[Math.min(item.attempt, RETRY_DELAYS.length - 1)] ?? 1000;
        const timer = setTimeout(() => {
          retryTimers.delete(timer);
          if (generation !== retryGeneration || !canSend()) return;
          const ok = send(config.endpoint, JSON.stringify(item.event), false);
          if (ok === false && item.attempt < RETRY_DELAYS.length) {
            item.attempt += 1;
            retryQueue.push(item);
            scheduleRetry();
          }
        }, delay);
        retryTimers.add(timer);
      }
    }, 100);
  }

  function clearRetryQueue() {
    retryGeneration += 1;
    if (retryTimer !== null) {
      clearTimeout(retryTimer);
      retryTimer = null;
    }
    for (const timer of retryTimers) clearTimeout(timer);
    retryTimers.clear();
    retryQueue.length = 0;
    lastSendFailed = false;
  }

  function clearEngagementTimer() {
    if (engagementTimer !== null) {
      clearTimeout(engagementTimer);
      engagementTimer = null;
    }
  }

  function armEngagement() {
    clearEngagementTimer();
    if (!canSend() || engaged || typeof document === "undefined" || document.visibilityState === "hidden") return;
    visibleSince = now();
    const remaining = Math.max(0, engagedAfterMs - visibleAccumulatedMs);
    engagementTimer = setTimeout(() => {
      engagementTimer = null;
      if (document.visibilityState === "hidden" || engaged || optedOut()) return;
      visibleAccumulatedMs += Math.max(0, now() - visibleSince);
      engaged = true;
      emit("engaged");
    }, remaining);
  }

  function pauseVisibility() {
    if (visibleSince) visibleAccumulatedMs += Math.max(0, now() - visibleSince);
    visibleSince = 0;
    clearEngagementTimer();
    stopHeartbeat();
  }

  function resumeVisibility() {
    if (!canSend() || (typeof document !== "undefined" && document.visibilityState === "hidden")) return;
    startHeartbeat();
    armEngagement();
  }

  function startHeartbeat() {
    stopHeartbeat();
    heartbeatTimer = setInterval(() => {
      if (!canSend() || (typeof document !== "undefined" && document.visibilityState === "hidden")) return;
      emit("heartbeat");
    }, heartbeatMs);
  }

  function stopHeartbeat() {
    if (heartbeatTimer !== null) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
  }

  function trackNavigation() {
    if (!started || !canSend()) return;
    emit("pageview");
    engaged = false;
    visibleAccumulatedMs = 0;
    armEngagement();
  }

  function patchHistory() {
    if (typeof history === "undefined") return;
    for (const name of ["pushState", "replaceState"] as const) {
      const original = history[name];
      if (typeof original !== "function") continue;
      originalHistory[name] = original;
      history[name] = function (this: History, ...args: Parameters<typeof original>) {
        const result = original.apply(this, args);
        trackNavigation();
        return result;
      };
    }
    window.addEventListener("popstate", trackNavigation);
  }

  function begin() {
    if (started || waitingForConsent || optedOut()) return;
    active = true;
    started = true;
    visitorId = getVisitorId(storage, config.siteKey, now());
    sessionId = readOrCreateSession(sessionStorage, config.siteKey);
    attributionToken = captureAttributionToken();
    emit("session_start");
    if (lastSendFailed) {
      retryQueue.push({ event: buildEvent("pageview"), attempt: 0 });
      scheduleRetry();
    } else {
      emit("pageview");
    }
    armEngagement();
    startHeartbeat();
    patchHistory();
    if (typeof document !== "undefined") document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") pauseVisibility();
      else resumeVisibility();
    });
    if (typeof window !== "undefined") window.addEventListener("pagehide", () => {
      stopHeartbeat();
      clearEngagementTimer();
      if (!optedOut()) emit("session_end", true);
    }, { once: true });
  }

  return {
    start() { begin(); },
    grantConsent() {
      try { storage.removeItem(OPT_OUT_KEY); } catch { /* storage optional */ }
      try { storage.setItem(CONSENT_KEY, "granted"); } catch { /* storage optional */ }
      waitingForConsent = false;
      if (!started) {
        begin();
        return;
      }
      active = true;
      engaged = false;
      visibleAccumulatedMs = 0;
      visibleSince = 0;
      emit("session_start");
      emit("pageview");
      armEngagement();
      startHeartbeat();
    },
    optOut() {
      try { storage.setItem(OPT_OUT_KEY, "1"); } catch { /* storage optional */ }
      active = false;
      stopHeartbeat();
      clearEngagementTimer();
      clearRetryQueue();
      engaged = false;
      visibleSince = 0;
      visibleAccumulatedMs = 0;
    },
    get sessionId_() { return sessionId; },
    get visitorId_() { return visitorId; },
    get pendingRetryCount() { return retryQueue.length; },
    get awaitingConsent() { return waitingForConsent; },
    forceHeartbeat() { return !started || !canSend() ? null : emit("heartbeat"); },
    destroy() {
      active = false;
      stopHeartbeat();
      clearEngagementTimer();
      clearRetryQueue();
      if (typeof history !== "undefined") {
        if (originalHistory.pushState) history.pushState = originalHistory.pushState;
        if (originalHistory.replaceState) history.replaceState = originalHistory.replaceState;
      }
    },
  };
}

export function autoInit(defaultEndpoint: string) {
  if (typeof document === "undefined") return;
  const script = document.currentScript instanceof HTMLScriptElement
    ? document.currentScript
    : Array.from(document.scripts).find((candidate) => candidate.src.includes("tracker.js"));
  const siteKey = script?.dataset.site;
  if (!siteKey) {
    console.warn("[surgeindex] tracker loaded without data-site key");
    return;
  }
  const globalWindow = window as Window & { __surgeindexTracker?: ReturnType<typeof createTracker> };
  if (globalWindow.__surgeindexTracker) return;
  const tracker = createTracker({
    siteKey,
    endpoint: script?.dataset.collector ?? defaultEndpoint,
    consentRequired: script?.dataset.consentRequired === "true",
    consentGranted: script?.dataset.consent === "granted",
    heartbeatMs: script?.dataset.heartbeatSeconds ? Number(script.dataset.heartbeatSeconds) * 1000 : undefined,
  });
  globalWindow.__surgeindexTracker = tracker;
  tracker.start();
}

function readConsent(storage: StorageLike): string | null {
  try { return storage.getItem(CONSENT_KEY); } catch { return null; }
}

function readOrCreateSession(storage: StorageLike, siteKey: string): string {
  const key = `si_sid:${siteKey}`;
  try {
    const existing = storage.getItem(key);
    if (existing && /^[A-Za-z0-9._:-]{8,128}$/.test(existing)) return existing;
  } catch {
    // Create an ephemeral session below.
  }
  const id = randomId();
  try { storage.setItem(key, id); } catch { /* storage optional */ }
  return id;
}
