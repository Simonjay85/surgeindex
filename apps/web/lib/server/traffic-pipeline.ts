import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { and, desc, eq, gt } from "drizzle-orm";
import { checkTrackerEvent, FRAUD_RULE_VERSION } from "@surge/anti-fraud";
import { PostgresEventStoreProvider, TinybirdEventStoreProvider } from "@surge/analytics";
import { getServerEnv } from "@surge/config";
import { getPostgresDb, attributionRecord, ingestionFailure, trackerEvent, trackerKey, site, outboundClick } from "@surge/db";
import {
  flattenTrackerBatch,
  normalizeDevice,
  normalizePathname,
  normalizeReferrerHost,
  trackerBatchSchema,
  type NormalizedTrackerEvent,
  type TrackerEvent,
} from "@surge/shared";
import { jsonError, requestId } from "./http";
import { checkRateLimit } from "./rate-limit";
import { localRealtimeRegistry } from "./realtime";

const MAX_IDENTIFIER_LENGTH = 128;
const IP_HASH_ROTATION_MS = 24 * 60 * 60 * 1000;

export type CollectorOutcome = {
  accepted: number;
  rejected: number;
  duplicates: number;
  requestId: string;
  source: "postgres" | "tinybird";
};

export class CollectorError extends Error {
  constructor(public readonly code: "tracker_disabled" | "collector_unavailable" | "invalid_payload" | "request_too_large" | "content_type_required", message: string, public readonly status = 400) {
    super(message);
  }
}

export async function collectTrackerRequest(request: Request): Promise<CollectorOutcome> {
  const env = getServerEnv();
  if (!env.TRACKER_ENABLED) throw new CollectorError("tracker_disabled", "Tracker collection is disabled for this environment.", 409);
  if (env.DATA_PROVIDER !== "postgres") throw new CollectorError("collector_unavailable", "The selected data provider cannot accept production tracker events.", 409);
  if (env.QUEUE_PROVIDER !== "local") throw new CollectorError("collector_unavailable", "Use the configured collector Worker for this queue provider.", 503);
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) throw new CollectorError("content_type_required", "JSON content is required.", 415);
  const requestIdValue = requestId(request);
  const maxBytes = env.TRACKER_EVENT_MAX_BODY_BYTES;
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > maxBytes) throw new CollectorError("request_too_large", "The tracker request is too large.", 413);
  const body = await request.text();
  if (new TextEncoder().encode(body).byteLength > maxBytes) throw new CollectorError("request_too_large", "The tracker request is too large.", 413);
  let json: unknown;
  try {
    json = JSON.parse(body);
  } catch {
    throw new CollectorError("invalid_payload", "The tracker payload is invalid.", 422);
  }
  const parsed = trackerBatchSchema.safeParse(json);
  if (!parsed.success) throw new CollectorError("invalid_payload", "The tracker payload is invalid.", 422);
  const events = flattenTrackerBatch(parsed.data);
  const source = env.ANALYTICS_PROVIDER;
  const store = source === "tinybird"
    ? new TinybirdEventStoreProvider({ apiUrl: env.TINYBIRD_API_URL!, ingestToken: env.TINYBIRD_INGEST_TOKEN!, readToken: env.TINYBIRD_READ_TOKEN! })
    : new PostgresEventStoreProvider();
  const normalized: NormalizedTrackerEvent[] = [];
  const seenEventIds = new Set<string>();
  const siteCache = new Map<string, { siteId: string; domains: string[]; status: string; siteStatus: string } | null>();
  const originHost = getOriginHost(request);
  const userAgent = request.headers.get("user-agent");
  const ipHash = hashRotating(env.TRACKER_HASH_SECRET ?? env.TRACKER_HASH_SALT ?? env.TRACKER_SIGNING_SECRET!, `${request.headers.get("x-forwarded-for") ?? request.headers.get("cf-connecting-ip") ?? "unknown"}:${userAgent ?? ""}`);
  const ipRate = checkRateLimit("tracker-ip", ipHash, 240, 60_000);
  if (!ipRate.allowed) throw new CollectorError("collector_unavailable", "Collector rate limit reached.", 429);

  for (const event of events) {
    const key = await resolveTrackerKey(event.siteKey, siteCache);
    if (!key || key.siteStatus !== "active") {
      // Unknown keys cannot be attached to a site and therefore never enter
      // the event store. Public responses intentionally remain generic.
      continue;
    }
    const keyUsable = ["active", "stale"].includes(key.status);
    const keyRate = checkRateLimit("tracker-key", event.siteKey, 600, 60_000);
    const eventOriginAllowed = Boolean(originHost && hostAllowed(originHost, key.domains));
    const visitorId = event.visitorId.slice(0, MAX_IDENTIFIER_LENGTH);
    const sessionId = event.sessionId.slice(0, MAX_IDENTIFIER_LENGTH);
    const visitorHash = hashRotating(env.TRACKER_HASH_SECRET ?? env.TRACKER_HASH_SALT ?? env.TRACKER_SIGNING_SECRET!, `${key.siteId}:visitor:${visitorId}`);
    const sessionHash = hashRotating(env.TRACKER_HASH_SECRET ?? env.TRACKER_HASH_SALT ?? env.TRACKER_SIGNING_SECRET!, `${key.siteId}:session:${sessionId}`);
    const replayedBatch = seenEventIds.has(event.eventId);
    const duplicateEventId = replayedBatch || await store.hasEvent(event.eventId);
    seenEventIds.add(event.eventId);
    const previous = await latestSessionEvent(key.siteId, sessionHash);
    const now = new Date();
    const clientDate = event.occurredAt ? new Date(event.occurredAt) : null;
    const clientTimeValid = !clientDate || (Number.isFinite(clientDate.getTime()) && clientDate.getTime() >= now.getTime() - 15 * 60 * 1000 && clientDate.getTime() <= now.getTime() + 60 * 1000);
    const attribution = await resolveAttribution(event, key.siteId, env.TRACKER_SIGNING_SECRET!, env.TRACKER_HASH_SECRET ?? env.TRACKER_HASH_SALT ?? env.TRACKER_SIGNING_SECRET!, sessionHash);
    const verdict = checkTrackerEvent({
      eventType: event.eventType,
      userAgent,
      originHost,
      refererHost: event.referrerHost ?? null,
      allowedDomains: key.domains,
      claimedOccurredAt: event.occurredAt ?? null,
      serverNow: now,
      msSinceLastHeartbeat: previous?.eventType === "heartbeat" ? now.getTime() - previous.receivedAt.getTime() : null,
      visitorEventsLastMinute: await countRecent("visitorHash", visitorHash),
      sessionEventsLastMinute: await countRecent("sessionId", sessionHash),
      duplicateEventId,
      replayedBatch,
      sessionDurationMs: previous ? now.getTime() - previous.receivedAt.getTime() : null,
      viewport: null,
      datacenterSignal: null,
      invalidTrackerKey: !keyUsable || !keyRate.allowed,
      revokedTrackerKey: key.status === "revoked",
      malformedIdentifier: !/^[A-Za-z0-9._:-]{8,128}$/.test(visitorId) || !/^[A-Za-z0-9._:-]{8,128}$/.test(sessionId),
      attributionTokenReplay: attribution.replayed,
      invalidEngagement: event.eventType === "engaged" && (event.engagedSeconds == null || event.engagedSeconds < 1),
      suspiciousReferrer: Boolean(event.referrerHost && normalizeReferrerHost(event.referrerHost) === null),
    });
    const extraReasons = [
      ...(eventOriginAllowed ? [] : ["disallowed_origin"]),
      ...(clientTimeValid ? [] : [clientDate && clientDate > now ? "timestamp_in_future" : "timestamp_too_old"]),
      ...(attribution.invalid ? ["invalid_attribution_token"] : []),
    ];
    const reasons = [...new Set([...verdict.reasons, ...extraReasons])];
    const decision = !keyUsable || !eventOriginAllowed || !clientTimeValid || duplicateEventId || !attribution.valid || verdict.decision === "invalid"
      ? "invalid"
      : verdict.decision;
    normalized.push({
      eventId: event.eventId,
      eventType: event.eventType,
      siteId: key.siteId,
      visitorHash,
      sessionHash,
      pathname: normalizePathname(event.pathname),
      referrerHost: normalizeReferrerHost(event.referrerHost),
      receivedAt: now.toISOString(),
      occurredAt: clientTimeValid && clientDate ? clientDate.toISOString() : now.toISOString(),
      clientOccurredAt: clientDate?.toISOString() ?? null,
      visible: event.eventType === "heartbeat" ? event.visible === true : event.visible !== false,
      engagedSeconds: event.engagedSeconds ?? null,
      trackerVersion: event.trackerVersion,
      attributionTokenHash: attribution.tokenHash,
      attributionClickId: attribution.clickId,
      attributionCampaignId: attribution.campaignId,
      trafficOrigin: attribution.trafficOrigin,
      trackerPublicKey: event.siteKey,
      originHost,
      country: request.headers.get("cf-ipcountry")?.slice(0, 2).toUpperCase() ?? null,
      device: normalizeDevice(userAgent),
      decision,
      fraudScore: Math.min(100, verdict.score + (extraReasons.length ? 55 : 0)),
      fraudReasonCodes: reasons,
      fraudRuleVersion: FRAUD_RULE_VERSION,
      collectorRequestId: requestIdValue,
      isDemo: false,
    });
  }
  let result;
  try {
    result = await store.ingest(normalized);
  } catch (error) {
    await recordIngestionFailure({
      siteId: normalized[0]?.siteId ?? null,
      requestId: requestIdValue,
      stage: "event_store",
      code: "provider_failure",
      detail: error instanceof Error ? error.name : "unknown_error",
    });
    throw error;
  }
  for (const event of normalized) if (event.decision === "valid") localRealtimeRegistry.accept(event);
  return {
    accepted: normalized.filter((event) => event.decision === "valid").length,
    rejected: result.rejected + (events.length - normalized.length),
    duplicates: result.duplicates,
    requestId: requestIdValue,
    source,
  };
}

async function recordIngestionFailure(input: {
  siteId: string | null;
  eventId?: string;
  requestId: string;
  stage: string;
  code: string;
  detail: string;
}) {
  try {
    await getPostgresDb().insert(ingestionFailure).values(input);
  } catch (error) {
    console.error(JSON.stringify({ component: "collector-failure-record", requestId: input.requestId, errorClass: error instanceof Error ? error.name : "unknown" }));
  }
}

export function collectorErrorResponse(request: Request, error: unknown): Response {
  const response = error instanceof CollectorError
    ? jsonError(request, error.status, error.code, error.message)
    : jsonError(request, 503, "collector_unavailable", "The tracker collector is temporarily unavailable.");
  if (!(error instanceof CollectorError)) console.error(JSON.stringify({ component: "collector", requestId: requestId(request), errorClass: error instanceof Error ? error.name : "unknown" }));
  for (const [key, value] of Object.entries(collectorCorsHeaders(request))) response.headers.set(key, String(value));
  return response;
}

export function collectorCorsHeaders(request: Request): HeadersInit {
  const origin = request.headers.get("origin");
  return origin
    ? { "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "content-type, x-request-id", Vary: "Origin" }
    : { "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "content-type, x-request-id" };
}

async function resolveTrackerKey(publicKey: string, cache: Map<string, { siteId: string; domains: string[]; status: string; siteStatus: string } | null>) {
  if (cache.has(publicKey)) return cache.get(publicKey) ?? null;
  const db = getPostgresDb();
  const [row] = await db.select({ siteId: trackerKey.siteId, domains: trackerKey.allowedDomains, status: trackerKey.status, siteStatus: site.status }).from(trackerKey).innerJoin(site, eq(trackerKey.siteId, site.id)).where(eq(trackerKey.publicKey, publicKey)).limit(1);
  const value = row ? { siteId: row.siteId, domains: row.domains, status: row.status, siteStatus: row.siteStatus } : null;
  cache.set(publicKey, value);
  return value;
}

async function latestSessionEvent(siteId: string, sessionHash: string) {
  const db = getPostgresDb();
  const [row] = await db.select({ eventType: trackerEvent.eventType, receivedAt: trackerEvent.receivedAt }).from(trackerEvent).where(and(eq(trackerEvent.siteId, siteId), eq(trackerEvent.sessionId, sessionHash))).orderBy(desc(trackerEvent.receivedAt)).limit(1);
  return row ?? null;
}

async function countRecent(field: "visitorHash" | "sessionId", value: string): Promise<number> {
  const db = getPostgresDb();
  const column = field === "visitorHash" ? trackerEvent.visitorHash : trackerEvent.sessionId;
  const rows = await db.select({ eventId: trackerEvent.eventId }).from(trackerEvent).where(and(eq(column, value), gt(trackerEvent.receivedAt, new Date(Date.now() - 60_000))));
  return rows.length;
}

async function resolveAttribution(event: TrackerEvent, siteId: string, signingSecret: string, hashSecret: string, sessionHash: string): Promise<{ valid: boolean; invalid: boolean; replayed: boolean; tokenHash: string | null; clickId: string | null; campaignId: string | null; trafficOrigin: "organic_surgedindex_referral" | "paid_surgedindex_referral" | "direct" }> {
  if (!event.attributionToken) return { valid: true, invalid: false, replayed: false, tokenHash: null, clickId: null, campaignId: null, trafficOrigin: "direct" };
  const payload = verifyAttributionToken(event.attributionToken, signingSecret);
  if (!payload || payload.siteId !== siteId || payload.expiresAt <= Date.now()) return { valid: false, invalid: true, replayed: false, tokenHash: null, clickId: null, campaignId: null, trafficOrigin: "direct" };
  const tokenHash = hashRotating(hashSecret, `attribution:${event.attributionToken}`);
  const db = getPostgresDb();
  const [click] = await db.select({ campaignId: outboundClick.campaignId, trafficOrigin: outboundClick.trafficOrigin }).from(outboundClick).where(and(eq(outboundClick.id, payload.clickId), eq(outboundClick.siteId, siteId))).limit(1);
  const [existing] = await db.select({ sessionHash: attributionRecord.sessionHash, expiresAt: attributionRecord.expiresAt }).from(attributionRecord).where(eq(attributionRecord.tokenHash, tokenHash)).limit(1);
  const trafficOrigin = click?.trafficOrigin === "paid_surgedindex_referral" ? "paid_surgedindex_referral" : "organic_surgedindex_referral";
  return { valid: Boolean(click), invalid: !click, replayed: Boolean(existing && existing.sessionHash !== sessionHash && existing.expiresAt > new Date()), tokenHash, clickId: payload.clickId, campaignId: click?.campaignId ?? null, trafficOrigin };
}

export function verifyAttributionToken(token: string, secret: string): { siteId: string; clickId: string; expiresAt: number } | null {
  const [encoded, signature] = token.split(".");
  if (!encoded || !signature) return null;
  const expected = createHmac("sha256", secret).update(encoded).digest("base64url");
  if (expected.length !== signature.length || !timingSafeEqual(Buffer.from(expected), Buffer.from(signature))) return null;
  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as { siteId?: string; clickId?: string; expiresAt?: number };
    if (!payload.siteId || !payload.clickId || !payload.expiresAt) return null;
    return { siteId: payload.siteId, clickId: payload.clickId, expiresAt: payload.expiresAt };
  } catch {
    return null;
  }
}

export function signAttributionToken(input: { siteId: string; clickId: string; expiresAt: number }, secret: string): string {
  const encoded = Buffer.from(JSON.stringify(input)).toString("base64url");
  const signature = createHmac("sha256", secret).update(encoded).digest("base64url");
  return `${encoded}.${signature}`;
}

function hashRotating(secret: string, value: string): string {
  const bucket = Math.floor(Date.now() / IP_HASH_ROTATION_MS);
  return createHmac("sha256", `${secret}:${bucket}`).update(value).digest("hex");
}

function getOriginHost(request: Request): string | null {
  const origin = request.headers.get("origin");
  const referer = request.headers.get("referer");
  try {
    const url = origin ? new URL(origin) : referer ? new URL(referer) : null;
    return url?.hostname.toLowerCase().replace(/^www\./, "") ?? null;
  } catch {
    return null;
  }
}

function hostAllowed(host: string, domains: string[]): boolean {
  const normalized = host.toLowerCase().replace(/^www\./, "");
  return domains.some((domain) => {
    const candidate = domain.toLowerCase().replace(/^www\./, "");
    return normalized === candidate || normalized.endsWith(`.${candidate}`);
  });
}
