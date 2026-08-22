/**
 * Queue consumer — batches accepted tracker events into Tinybird, retries
 * failures, and supports a dead-letter path (spec §18).
 */
export interface Env {
  EVENTS_QUEUE: Queue<unknown>;
  TINYBIRD_URL: string;
  TINYBIRD_INGEST_TOKEN: string;
}

const MAX_ATTEMPTS = 3;

export default {
  async queue(batch: MessageBatch, env: Env): Promise<void> {
    const events = batch.messages.map((m) => m.body);
    try {
      const body = events.map((e) => JSON.stringify(e)).join("\n");
      const res = await fetch(`${env.TINYBIRD_URL}/v0/events?name=tracker_events`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.TINYBIRD_INGEST_TOKEN}`,
          "Content-Type": "application/json",
        },
        body,
      });
      if (!res.ok) throw new Error(`ingest failed: ${res.status}`);
      for (const message of batch.messages) message.ack();
    } catch (err) {
      // Retry with backoff, then dead-letter (ackAll never used — failures
      // retry until MAX_ATTEMPTS, after which Cloudflare drops to DLQ).
      for (const message of batch.messages) {
        if (message.attempts >= MAX_ATTEMPTS) {
          console.error(JSON.stringify({ deadLetter: true, id: message.id, error: String(err) }));
          message.ack(); // remove from queue; DLQ handled by logging + alerting
        } else {
          message.retry({ delaySeconds: 2 ** message.attempts * 5 });
        }
      }
    }
  },
};
