import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { getServerEnv } from "@surge/config";
import { PostgresEventStoreProvider } from "@surge/analytics";
import { getPostgresDb, ingestionFailure } from "@surge/db";
import { jsonError, jsonOk, requestId } from "../../../../../lib/server/http";

export const runtime = "nodejs";

const normalizedEvent = z.object({
  eventId: z.string().uuid(),
  eventType: z.enum(["pageview", "session_start", "heartbeat", "engaged", "session_end"]),
  siteId: z.string().uuid(),
  visitorHash: z.string().length(64),
  sessionHash: z.string().length(64),
  pathname: z.string().max(512),
  referrerHost: z.string().nullable(),
  receivedAt: z.string().datetime({ offset: true }),
  occurredAt: z.string().datetime({ offset: true }),
  clientOccurredAt: z.string().datetime({ offset: true }).nullable(),
  visible: z.boolean(),
  engagedSeconds: z.number().int().nullable(),
  trackerVersion: z.string().max(32),
  attributionTokenHash: z.string().length(64).nullable(),
  attributionClickId: z.string().uuid().nullable(),
  trackerPublicKey: z.string().min(8).max(128),
  originHost: z.string().nullable(),
  country: z.string().nullable(),
  device: z.enum(["mobile", "tablet", "desktop", "unknown"]),
  decision: z.enum(["valid", "suspected", "invalid", "review_required"]),
  fraudScore: z.number().int().min(0).max(100),
  fraudReasonCodes: z.array(z.string().max(80)).max(20),
  fraudRuleVersion: z.string().max(32),
  collectorRequestId: z.string().max(100),
  isDemo: z.literal(false),
});

export async function POST(request: Request) {
  const requestIdValue = requestId(request);
  const env = getServerEnv();
  const configured = env.INTERNAL_SERVICE_TOKEN;
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!configured || !supplied || configured.length !== supplied.length || !timingSafeEqual(Buffer.from(configured), Buffer.from(supplied))) return jsonError(request, 401, "service_auth_required", "Internal service authentication is required.");
  const parsed = z.object({ events: z.array(normalizedEvent).min(1).max(env.TRACKER_EVENT_MAX_BATCH_SIZE) }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError(request, 422, "invalid_internal_payload", "The internal event batch is invalid.");
  try {
    const result = await new PostgresEventStoreProvider().ingest(parsed.data.events);
    return jsonOk(request, result, 202);
  } catch (error) {
    await getPostgresDb().insert(ingestionFailure).values({
      siteId: parsed.data.events[0]?.siteId ?? null,
      requestId: requestIdValue,
      stage: "internal_event_store",
      code: "provider_failure",
      detail: error instanceof Error ? error.name : "unknown_error",
    }).catch(() => undefined);
    console.error(JSON.stringify({ component: "internal-ingest", requestId: requestIdValue, errorClass: error instanceof Error ? error.name : "unknown" }));
    return jsonError(request, 503, "ingest_unavailable", "The event store is temporarily unavailable.");
  }
}
