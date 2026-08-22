/** Dedicated Cloudflare Collector Worker for the first-party tracker. */
import { checkTrackerEvent, FRAUD_RULE_VERSION } from "@surge/anti-fraud";
import {
  flattenTrackerBatch,
  normalizeDevice,
  normalizePathname,
  normalizeReferrerHost,
  trackerBatchSchema,
  type NormalizedTrackerEvent,
} from "@surge/shared";

export interface Env {
  EVENTS_QUEUE: Queue<NormalizedTrackerEvent>;
  REALTIME: DurableObjectNamespace;
  SITE_KEYS: KVNamespace;
  EVENT_IDS?: KVNamespace;
  TRACKER_HASH_SECRET: string;
  TRACKER_SIGNING_SECRET: string;
  TRACKER_EVENT_MAX_BODY_BYTES?: string;
  EVENT_RETENTION_DAYS?: string;
  REALTIME_SIGNAL_TOKEN?: string;
}

const DEFAULT_MAX_BODY_BYTES = 64 * 1024;
const BOT_UA = /(bot|crawler|spider|headlesschrome|curl|wget|python-requests|puppeteer|playwright|selenium)/i;

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    if (request.method === "OPTIONS") return optionsResponse(request);
    if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
    const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID();
    const maxBytes = Number(env.TRACKER_EVENT_MAX_BODY_BYTES ?? DEFAULT_MAX_BODY_BYTES);
    const declaredLength = Number(request.headers.get("content-length") ?? 0);
    if (declaredLength > maxBytes) return json({ error: "invalid_request", requestId }, 413);
    if (!(request.headers.get("content-type") ?? "").includes("application/json")) return json({ error: "invalid_request", requestId }, 415);
    const body = await request.text();
    if (new TextEncoder().encode(body).byteLength > maxBytes) return json({ error: "invalid_request", requestId }, 413);
    let payload: unknown;
    try { payload = JSON.parse(body); } catch { return json({ error: "invalid_request", requestId }, 422); }
    const parsed = trackerBatchSchema.safeParse(payload);
    if (!parsed.success) return json({ error: "invalid_request", requestId }, 422);
    const events = flattenTrackerBatch(parsed.data);
    const originHost = requestOriginHost(request);
    const userAgent = request.headers.get("user-agent");
    const normalized: NormalizedTrackerEvent[] = [];
    const seenEventIds = new Set<string>();
    const now = new Date();
    for (const event of events) {
      const key = await env.SITE_KEYS.get<{ siteId: string; domains: string[]; status: string; siteStatus?: string }>(`key:${event.siteKey}`, "json");
      if (!key || key.siteStatus === "suspended") continue;
      const keyUsable = ["active", "stale"].includes(key.status);
      const duplicateEventId = seenEventIds.has(event.eventId) || Boolean(env.EVENT_IDS && await env.EVENT_IDS.get(`event:${event.eventId}`));
      seenEventIds.add(event.eventId);
      const allowedOrigin = Boolean(originHost && hostAllowed(originHost, key.domains));
      const validTime = !event.occurredAt || (Date.parse(event.occurredAt) >= now.getTime() - 15 * 60 * 1000 && Date.parse(event.occurredAt) <= now.getTime() + 60 * 1000);
      const visitorHash = await rotatingHash(env.TRACKER_HASH_SECRET, `${key.siteId}:visitor:${event.visitorId}`);
      const sessionHash = await rotatingHash(env.TRACKER_HASH_SECRET, `${key.siteId}:session:${event.sessionId}`);
      const attribution = await verifyAttribution(event.attributionToken, key.siteId, env.TRACKER_SIGNING_SECRET, env.TRACKER_HASH_SECRET);
      const verdict = checkTrackerEvent({
        eventType: event.eventType,
        userAgent,
        originHost,
        refererHost: event.referrerHost ?? null,
        allowedDomains: key.domains,
        claimedOccurredAt: event.occurredAt ?? null,
        serverNow: now,
        msSinceLastHeartbeat: null,
        visitorEventsLastMinute: null,
        sessionEventsLastMinute: null,
        duplicateEventId,
        sessionDurationMs: null,
        viewport: null,
        datacenterSignal: Boolean(request.cf?.colo && BOT_UA.test(userAgent ?? "")),
        invalidEngagement: event.eventType === "engaged" && (event.engagedSeconds == null || event.engagedSeconds < 1),
        suspiciousReferrer: Boolean(event.referrerHost && !normalizeReferrerHost(event.referrerHost)),
      });
      const reasons = [...new Set([
        ...verdict.reasons,
        ...(allowedOrigin ? [] : ["disallowed_origin"]),
        ...(validTime ? [] : [event.occurredAt && Date.parse(event.occurredAt) > now.getTime() ? "timestamp_in_future" : "timestamp_too_old"]),
        ...(attribution.invalid ? ["invalid_attribution_token"] : []),
      ])];
      const decision = !keyUsable || !allowedOrigin || !validTime || duplicateEventId || !attribution.valid || verdict.decision === "invalid" ? "invalid" : verdict.decision;
      normalized.push({
        eventId: event.eventId,
        eventType: event.eventType,
        siteId: key.siteId,
        visitorHash,
        sessionHash,
        pathname: normalizePathname(event.pathname),
        referrerHost: normalizeReferrerHost(event.referrerHost),
        receivedAt: now.toISOString(),
        occurredAt: validTime && event.occurredAt ? new Date(event.occurredAt).toISOString() : now.toISOString(),
        clientOccurredAt: event.occurredAt ?? null,
        visible: event.eventType === "heartbeat" ? event.visible === true : event.visible !== false,
        engagedSeconds: event.engagedSeconds ?? null,
        trackerVersion: event.trackerVersion,
        attributionTokenHash: attribution.tokenHash,
        attributionClickId: attribution.clickId,
        trackerPublicKey: event.siteKey,
        originHost,
        country: typeof request.cf?.country === "string" ? request.cf.country : null,
        device: normalizeDevice(userAgent),
        decision,
        fraudScore: Math.min(100, verdict.score + (!keyUsable || !allowedOrigin || !validTime || duplicateEventId ? 55 : 0)),
        fraudReasonCodes: reasons,
        fraudRuleVersion: FRAUD_RULE_VERSION,
        collectorRequestId: requestId,
        isDemo: false,
      });
    }
    if (normalized.length) await env.EVENTS_QUEUE.sendBatch(normalized.map((body) => ({ body })));
    const realtimeEvents = normalized.filter((event) => event.decision === "valid");
    if (realtimeEvents.length) {
      ctx.waitUntil(Promise.all(realtimeEvents.map((event) => {
        const id = env.REALTIME.idFromName(`site/${event.siteId}`);
        return env.REALTIME.get(id).fetch("https://realtime/signal", {
          method: "POST",
          body: JSON.stringify({ eventType: event.eventType, visitorHash: event.visitorHash, sessionHash: event.sessionHash, visible: event.visible, receivedAt: event.receivedAt, decision: event.decision }),
          headers: {
            "Content-Type": "application/json",
            ...(env.REALTIME_SIGNAL_TOKEN ? { Authorization: `Bearer ${env.REALTIME_SIGNAL_TOKEN}` } : {}),
          },
        });
      })).catch((error) => console.error(JSON.stringify({ component: "collector-realtime", requestId, errorClass: error instanceof Error ? error.name : "unknown" }))));
    }
    if (env.EVENT_IDS && normalized.length) {
      const expiration = Math.floor(Date.now() / 1000) + Number(env.EVENT_RETENTION_DAYS ?? 90) * 24 * 60 * 60;
      ctx.waitUntil(Promise.all(normalized.map((event) => env.EVENT_IDS!.put(`event:${event.eventId}`, "1", { expiration }))));
    }
    const accepted = normalized.filter((event) => event.decision === "valid").length;
    return json({ accepted, rejected: events.length - accepted, requestId }, 202, corsHeaders(request));
  },
};

function json(body: unknown, status: number, headers?: HeadersInit) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store", ...headers } });
}

function optionsResponse(request: Request) {
  return new Response(null, { status: 204, headers: { ...corsHeaders(request), "Access-Control-Max-Age": "600" } });
}

function corsHeaders(request: Request): HeadersInit {
  const origin = request.headers.get("origin");
  return origin ? { "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "content-type, x-request-id", Vary: "Origin" } : { "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "content-type, x-request-id" };
}

function requestOriginHost(request: Request): string | null {
  try {
    const raw = request.headers.get("origin") ?? request.headers.get("referer");
    return raw ? new URL(raw).hostname.toLowerCase().replace(/^www\./, "") : null;
  } catch {
    return null;
  }
}

function hostAllowed(host: string, domains: string[]) {
  return domains.some((domain) => {
    const normalized = domain.toLowerCase().replace(/^www\./, "");
    return host === normalized || host.endsWith(`.${normalized}`);
  });
}

async function rotatingHash(secret: string, value: string) {
  const day = new Date().toISOString().slice(0, 10);
  return hmac(secret, `${day}:${value}`);
}

async function hmac(secret: string, value: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const digest = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function verifyAttribution(token: string | undefined, siteId: string, signingSecret: string, hashSecret: string) {
  if (!token) return { valid: true, invalid: false, tokenHash: null, clickId: null };
  const [encoded, signature] = token.split(".");
  if (!encoded || !signature) return { valid: false, invalid: true, tokenHash: null, clickId: null };
  const expected = await hmacBase64Url(signingSecret, encoded);
  if (expected.length !== signature.length || expected !== signature) return { valid: false, invalid: true, tokenHash: null, clickId: null };
  try {
    const base64 = encoded.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(encoded.length / 4) * 4, "=");
    const payload = JSON.parse(atob(base64)) as { siteId?: string; clickId?: string; expiresAt?: number };
    if (payload.siteId !== siteId || !payload.clickId || !payload.expiresAt || payload.expiresAt <= Date.now()) return { valid: false, invalid: true, tokenHash: null, clickId: null };
    return { valid: true, invalid: false, tokenHash: await hmac(hashSecret, `attribution:${token}`), clickId: payload.clickId };
  } catch {
    return { valid: false, invalid: true, tokenHash: null, clickId: null };
  }
}

async function hmacBase64Url(secret: string, value: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const digest = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value)));
  let binary = "";
  for (const byte of digest) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
