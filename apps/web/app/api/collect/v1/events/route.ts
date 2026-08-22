import { z } from "zod";
import { getServerEnv } from "@surge/config";
import { jsonError, jsonOk } from "../../../../../lib/server/http";

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

export async function POST(request: Request) {
  if (getServerEnv().APP_MODE === "production") return jsonError(request, 409, "tracker_ingestion_not_enabled", "Production tracker ingestion is scheduled for the tracker pipeline batch and is disabled in this build.");
  const parsed = eventSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError(request, 422, "invalid_payload", "The tracker event payload is invalid.");
  // Demo collector validates the contract and returns quickly. The production
  // worker adds origin allow-listing, rotating IP hashing, anti-fraud checks,
  // and queue publication before returning the same accepted response.
  return jsonOk(request, { accepted: true, receivedAt: new Date().toISOString(), source: "demo" }, 202, { "Cache-Control": "no-store" });
}
