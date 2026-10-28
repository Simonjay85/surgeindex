import type { NormalizedTrackerEvent } from "@surge/shared";

export interface Env {
  ANALYTICS_PROVIDER: "postgres" | "tinybird";
  TINYBIRD_API_URL?: string;
  TINYBIRD_INGEST_TOKEN?: string;
  INTERNAL_INGEST_URL?: string;
  INTERNAL_SERVICE_TOKEN?: string;
  PROCESSED_EVENT_IDS?: KVNamespace;
  EVENT_RETENTION_DAYS?: string;
}

/**
 * Queue delivery is at-least-once. The batch is deduplicated in memory and,
 * when configured, against a short-lived KV idempotency ledger before the
 * selected event store is called.
 */
export default {
  async queue(batch: MessageBatch<NormalizedTrackerEvent>, env: Env): Promise<void> {
    const unique = new Map<string, NormalizedTrackerEvent>();
    for (const message of batch.messages) unique.set(message.body.eventId, message.body);
    const events: NormalizedTrackerEvent[] = [];
    for (const event of unique.values()) {
      if (env.PROCESSED_EVENT_IDS && await env.PROCESSED_EVENT_IDS.get(`event:${event.eventId}`)) continue;
      events.push(event);
    }
    if (!events.length) {
      for (const message of batch.messages) message.ack();
      return;
    }
    try {
      if (env.ANALYTICS_PROVIDER === "tinybird") await sendTinybird(events, env);
      else await sendPostgres(events, env);
      if (env.PROCESSED_EVENT_IDS) {
        const expiration = Math.floor(Date.now() / 1000) + Number(env.EVENT_RETENTION_DAYS ?? 90) * 24 * 60 * 60;
        await Promise.all(events.map((event) => env.PROCESSED_EVENT_IDS!.put(`event:${event.eventId}`, "1", { expiration })));
      }
      for (const message of batch.messages) message.ack();
      console.log(JSON.stringify({ component: "queue-consumer", eventCount: events.length, queueLagSeconds: queueLag(events) }));
    } catch (error) {
      console.error(JSON.stringify({ component: "queue-consumer", eventCount: events.length, errorClass: error instanceof Error ? error.name : "unknown", retry: true }));
      for (const message of batch.messages) message.retry({ delaySeconds: Math.min(300, 2 ** Math.min(message.attempts, 6) * 5) });
    }
  },
};

async function sendTinybird(events: NormalizedTrackerEvent[], env: Env) {
  if (!env.TINYBIRD_API_URL || !env.TINYBIRD_INGEST_TOKEN) throw new Error("tinybird_credentials_missing");
  const body = events.map((event) => JSON.stringify({
    event_id: event.eventId,
    event_type: event.eventType,
    site_id: event.siteId,
    session_id: event.sessionHash,
    visitor_hash: event.visitorHash,
    pathname: event.pathname,
    referrer_host: event.referrerHost ?? "",
    country: event.country ?? "",
    device: event.device,
    tracker_public_key: event.trackerPublicKey,
    occurred_at: event.occurredAt,
    received_at: event.receivedAt,
    visible: event.visible,
    engaged_seconds: event.engagedSeconds,
    tracker_version: event.trackerVersion,
    attribution_token_hash: event.attributionTokenHash,
    decision: event.decision,
    fraud_score: event.fraudScore,
    fraud_reason_codes: event.fraudReasonCodes,
  })).join("\n");
  const response = await fetch(`${env.TINYBIRD_API_URL}/v0/events?name=tracker_events`, { method: "POST", headers: { Authorization: `Bearer ${env.TINYBIRD_INGEST_TOKEN}`, "Content-Type": "application/json" }, body });
  if (!response.ok) throw new Error(`tinybird_ingest_${response.status}`);
}

async function sendPostgres(events: NormalizedTrackerEvent[], env: Env) {
  if (!env.INTERNAL_INGEST_URL || !env.INTERNAL_SERVICE_TOKEN) throw new Error("internal_postgres_ingest_credentials_missing");
  const response = await fetch(env.INTERNAL_INGEST_URL, { method: "POST", headers: { Authorization: `Bearer ${env.INTERNAL_SERVICE_TOKEN}`, "Content-Type": "application/json" }, body: JSON.stringify({ events }) });
  if (!response.ok) throw new Error(`postgres_ingest_${response.status}`);
}

function queueLag(events: NormalizedTrackerEvent[]) {
  const oldest = Math.min(...events.map((event) => Date.parse(event.receivedAt)));
  return Math.max(0, Math.round((Date.now() - oldest) / 1000));
}
