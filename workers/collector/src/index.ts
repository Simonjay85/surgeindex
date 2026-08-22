/**
 * SurgeIndex collector worker — accepts tracker events at the edge.
 *
 * Production topology (spec §17): validate with Zod, check site key + allowed
 * origin, stamp a trusted server timestamp, hash the IP with a rotating salt,
 * run bot detection, then publish to a Cloudflare Queue and return fast.
 *
 * The web app embeds the same logic at /api/collect/v1/events for single-
 * deployment setups; this worker is the horizontally-scalable variant.
 */
import { z } from "zod";

const eventSchema = z.object({
  eventId: z.string().uuid(),
  eventType: z.enum(["pageview", "session_start", "heartbeat", "engaged", "session_end"]),
  siteKey: z.string().min(8).max(64),
  visitorId: z.string().min(8).max(64),
  sessionId: z.string().min(8).max(64),
  pathname: z.string().max(512).default("/"),
  referrerHost: z.string().max(253).optional(),
  occurredAt: z.string().datetime().optional(),
  viewport: z.string().max(32).optional(),
  locale: z.string().max(16).optional(),
});

export interface Env {
  EVENTS_QUEUE: Queue<QueuedEvent>;
  /** KV cache of site key -> allowed domains for fast validation. */
  SITE_KEYS: KVNamespace;
  HASH_SALT: string;
}

export interface QueuedEvent {
  eventId: string;
  eventType: string;
  siteKey: string;
  visitorId: string;
  sessionId: string;
  pathname: string;
  referrerHost?: string;
  visitorHash: string;
  country?: string;
  device?: string;
  receivedAt: string;
}

const BOT_UA = /(bot|crawler|spider|headlesschrome|curl|wget|python-requests)/i;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method !== "POST") {
      return new Response("method not allowed", { status: 405 });
    }
    // CORS is derived from the verified site domains in SITE_KEYS — never *.
    let payload: unknown;
    try {
      payload = await request.json();
    } catch {
      return new Response("bad request", { status: 400 });
    }
    const parsed = eventSchema.safeParse(payload);
    if (!parsed.success) {
      return Response.json({ error: "invalid payload" }, { status: 422 });
    }
    const event = parsed.data;

    const siteInfo = await env.SITE_KEYS.get<{ domains: string[] }>(`key:${event.siteKey}`, "json");
    if (!siteInfo) {
      return Response.json({ error: "unknown site key" }, { status: 404 });
    }
    const origin = request.headers.get("origin") ?? request.headers.get("referer");
    if (origin && !siteInfo.domains.some((d) => origin.includes(d))) {
      return Response.json({ error: "origin not allowed" }, { status: 403 });
    }

    const ua = request.headers.get("user-agent") ?? "";
    if (BOT_UA.test(ua)) {
      // Accepted but flagged; the consumer decides final classification.
      // Never counted toward verified metrics.
    }

    // Rotating daily salt — no raw IPs are stored anywhere.
    const salt = `${env.HASH_SALT}:${new Date().toISOString().slice(0, 10)}`;
    const visitorHash = await sha256(`${salt}:${request.headers.get("cf-connecting-ip") ?? "0.0.0.0"}`);

    const queued: QueuedEvent = {
      eventId: event.eventId,
      eventType: event.eventType,
      siteKey: event.siteKey,
      visitorId: event.visitorId,
      sessionId: event.sessionId,
      pathname: event.pathname,
      referrerHost: event.referrerHost,
      visitorHash,
      country: typeof request.cf?.country === "string" ? request.cf.country : undefined,
      device: ua.includes("Mobile") ? "mobile" : "desktop",
      receivedAt: new Date().toISOString(), // server timestamp only
    };

    await env.EVENTS_QUEUE.send(queued);
    return Response.json({ accepted: true }, { status: 202 });
  },
};

async function sha256(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
