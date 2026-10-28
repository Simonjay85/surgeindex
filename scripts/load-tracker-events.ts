/**
 * Controlled tracker collector load probe.
 *
 * This is intentionally a bounded correctness probe, not a benchmark:
 *   TRACKER_LOAD_URL=http://127.0.0.1:3000/api/collect/v1/events \
 *   TRACKER_LOAD_SITE_KEY=pk_test_fixture \
 *   TRACKER_LOAD_ORIGIN=https://fixture.example.com \
 *   TRACKER_LOAD_EVENTS=100 pnpm traffic:load
 *
 * The target must be a local/staging collector. The script reports generated
 * duplicates separately because different providers expose duplicate counts
 * differently. It retries transient transport/5xx failures three times.
 */

type CollectorResponse = { accepted?: number; rejected?: number; duplicates?: number; data?: CollectorResponse };

const url = process.env.TRACKER_LOAD_URL ?? "http://127.0.0.1:3000/api/collect/v1/events";
const siteKey = process.env.TRACKER_LOAD_SITE_KEY ?? "pk_test_fixture_site";
const origin = process.env.TRACKER_LOAD_ORIGIN ?? "https://fixture.example.com";
const totalEvents = boundedNumber(process.env.TRACKER_LOAD_EVENTS, 100, 1, 10_000);
const batchSize = boundedNumber(process.env.TRACKER_LOAD_BATCH_SIZE, 20, 1, 20);
const concurrency = boundedNumber(process.env.TRACKER_LOAD_CONCURRENCY, 4, 1, 16);
const duplicateEvery = boundedNumber(process.env.TRACKER_LOAD_DUPLICATE_EVERY, 10, 0, 1_000);

const startedAt = Date.now();
let accepted = 0;
let rejected = 0;
let providerDuplicates = 0;
let generatedDuplicates = 0;
let transportFailures = 0;
let batchesCompleted = 0;

const events = Array.from({ length: totalEvents }, (_, index) => ({
  eventId: uuidFor(index),
  eventType: "pageview" as const,
  siteKey,
  visitorId: `load-visitor-${String(index % 25).padStart(8, "0")}`,
  sessionId: `load-session-${String(index % 50).padStart(8, "0")}`,
  pathname: `/load/${index % 12}`,
  referrerHost: "fixture.example.com",
  occurredAt: new Date().toISOString(),
  visible: true,
  trackerVersion: "3.0.0-load",
}));

const batches = [];
for (let index = 0; index < events.length; index += batchSize) {
  const batch = events.slice(index, index + batchSize);
  if (duplicateEvery > 0 && index % duplicateEvery === 0 && batch.length > 1) {
    batch[batch.length - 1] = batch[0]!;
    generatedDuplicates += 1;
  }
  batches.push(batch);
}

let cursor = 0;
async function worker() {
  while (true) {
    const index = cursor++;
    if (index >= batches.length) return;
    const result = await postWithRetry(batches[index]!);
    accepted += result.accepted;
    rejected += result.rejected;
    providerDuplicates += result.duplicates;
    batchesCompleted += 1;
  }
}

void Promise.all(Array.from({ length: Math.min(concurrency, batches.length) }, () => worker()))
  .then(() => {
    console.log(JSON.stringify({
      target: url,
      eventCount: totalEvents,
      batchCount: batches.length,
      batchSize,
      concurrency,
      durationMs: Date.now() - startedAt,
      accepted,
      rejected,
      generatedDuplicateBatches: generatedDuplicates,
      providerDuplicateCount: providerDuplicates,
      transportFailures,
      batchesCompleted,
      notes: [
        "Correctness probe only; no throughput claim.",
        "Queue retry and DLQ behavior require a Worker-compatible preview with the configured queue consumer.",
        "Durable Object expiry requires the configured alarm/TTL and is not inferred from collector HTTP timing.",
      ],
    }, null, 2));
  })
  .catch((error: unknown) => {
    console.error(JSON.stringify({ component: "traffic-load", errorClass: error instanceof Error ? error.name : "unknown" }));
    process.exitCode = 1;
  });

async function postWithRetry(batch: unknown[]): Promise<{ accepted: number; rejected: number; duplicates: number }> {
  let lastError = "unknown";
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: origin },
        body: JSON.stringify({ events: batch }),
      });
      const body = await response.json().catch(() => ({})) as CollectorResponse;
      if (response.ok) {
        const payload = body.data ?? body;
        return { accepted: Number(payload.accepted ?? 0), rejected: Number(payload.rejected ?? 0), duplicates: Number(payload.duplicates ?? 0) };
      }
      if (response.status < 500 && response.status !== 429) {
        return { accepted: Number((body.data ?? body).accepted ?? 0), rejected: batch.length, duplicates: 0 };
      }
      lastError = `http_${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.name : "network_error";
    }
    await new Promise((resolve) => setTimeout(resolve, 100 * 2 ** attempt));
  }
  transportFailures += 1;
  console.error(JSON.stringify({ component: "traffic-load", batchSize: batch.length, error: lastError }));
  return { accepted: 0, rejected: batch.length, duplicates: 0 };
}

function boundedNumber(value: string | undefined, fallback: number, min: number, max: number): number {
  const parsed = Number(value ?? fallback);
  return Number.isFinite(parsed) ? Math.max(min, Math.min(max, Math.floor(parsed))) : fallback;
}

function uuidFor(index: number): string {
  const suffix = index.toString(16).padStart(12, "0");
  return `aaaaaaaa-aaaa-4aaa-8aaa-${suffix}`;
}
