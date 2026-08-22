import { z } from "zod";
import type { FraudDecision } from "./types";

/**
 * The only browser events accepted by the first-party tracker. Keeping this
 * schema in the shared package lets the Next collector and the edge Worker
 * enforce the same public contract without importing server-only code.
 */
export const trackerEventTypes = [
  "pageview",
  "session_start",
  "heartbeat",
  "engaged",
  "session_end",
] as const;

export type TrackerEventType = (typeof trackerEventTypes)[number];

const publicIdentifier = z
  .string()
  .min(8)
  .max(128)
  .regex(/^[A-Za-z0-9._:-]+$/);

export const trackerEventSchema = z
  .object({
    eventId: z.string().uuid(),
    eventType: z.enum(trackerEventTypes),
    siteKey: z.string().min(8).max(128).regex(/^pk_[A-Za-z0-9_-]+$/),
    visitorId: publicIdentifier,
    sessionId: publicIdentifier,
    pathname: z.string().max(2048).default("/"),
    referrerHost: z.string().max(253).optional(),
    occurredAt: z.string().datetime({ offset: true }).optional(),
    visible: z.boolean().optional(),
    engagedSeconds: z.number().int().min(0).max(86_400).optional(),
    trackerVersion: z.string().min(1).max(32).default("1.0.0"),
    attributionToken: z.string().min(16).max(512).regex(/^[A-Za-z0-9._~-]+$/).optional(),
  })
  .strict();

export type TrackerEvent = z.infer<typeof trackerEventSchema>;

export const trackerBatchSchema = z.union([
  trackerEventSchema,
  z.object({ events: z.array(trackerEventSchema).min(1).max(20) }).strict(),
  z.array(trackerEventSchema).min(1).max(20),
]);

export type TrackerBatch = TrackerEvent | { events: TrackerEvent[] } | TrackerEvent[];

export interface NormalizedTrackerEvent {
  eventId: string;
  eventType: TrackerEventType;
  siteId: string;
  visitorHash: string;
  sessionHash: string;
  pathname: string;
  referrerHost: string | null;
  receivedAt: string;
  occurredAt: string;
  clientOccurredAt: string | null;
  visible: boolean;
  engagedSeconds: number | null;
  trackerVersion: string;
  /** Hashed before the event enters a queue or database. */
  attributionTokenHash: string | null;
  /** Internal click UUID extracted from a verified, signed token. */
  attributionClickId: string | null;
  trackerPublicKey: string;
  originHost: string | null;
  country: string | null;
  device: "mobile" | "tablet" | "desktop" | "unknown";
  decision: FraudDecision;
  fraudScore: number;
  fraudReasonCodes: string[];
  fraudRuleVersion: string;
  collectorRequestId: string;
  isDemo: boolean;
}

export interface RealtimeSnapshot {
  siteId: string;
  activeVisitors: number;
  activeSessions: number;
  updatedAt: string;
}

/** Query parameters that the tracker is allowed to remove from the URL. */
export const TRACKER_ATTRIBUTION_PARAM = "_si_at";

export function normalizePathname(value: string | undefined): string {
  const raw = (value ?? "/").trim();
  if (!raw) return "/";
  const withoutQuery = raw.split(/[?#]/, 1)[0] ?? "/";
  const cleaned = withoutQuery.replace(/[\u0000-\u001f\u007f]/g, "");
  if (!cleaned || cleaned === "//") return "/";
  const withSlash = cleaned.startsWith("/") ? cleaned : `/${cleaned}`;
  return withSlash.replace(/\/+/g, "/").slice(0, 512) || "/";
}

export function normalizeReferrerHost(value: string | undefined | null): string | null {
  if (!value) return null;
  try {
    const candidate = value.includes("://") ? (/^[a-z][a-z0-9+.-]*:\/\/([^/?#]+)/i.exec(value)?.[1] ?? "") : value.split(/[/?#]/, 1)[0];
    const host = candidate?.trim().toLowerCase().replace(/^www\./, "");
    if (!host || host.length > 253 || host.includes("@") || host.includes(":")) return null;
    if (!/^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(host)) return null;
    return host;
  } catch {
    return null;
  }
}

export function normalizeDevice(userAgent: string | null | undefined): NormalizedTrackerEvent["device"] {
  const ua = userAgent ?? "";
  if (/tablet|ipad|kindle|silk/i.test(ua)) return "tablet";
  if (/mobile|iphone|android|ipod/i.test(ua)) return "mobile";
  if (!ua) return "unknown";
  return "desktop";
}

export function flattenTrackerBatch(payload: TrackerBatch): TrackerEvent[] {
  if (Array.isArray(payload)) return payload;
  if ("events" in payload) return payload.events;
  return [payload];
}
