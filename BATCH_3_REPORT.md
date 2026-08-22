# SurgeIndex Batch 3 report — first-party traffic pipeline

Date: 2026-08-23  
Branch: feat/surgeindex-traffic-pipeline  
Implementation commit: to be recorded after the local implementation commit (no merge or push performed)

## Result

Batch 3 implements the first-party SurgeIndex traffic path behind explicit provider boundaries. An active ownership-verified site can generate a public tracker key, install the built tracker, submit validated events, become tracker-connected from a real accepted event, populate server-side metrics, update site-level realtime state, and attribute confirmed landing visits from SurgeIndex redirects.

Demo mode remains deterministic and is never used as a production fallback. Production mode requires PostgreSQL for the current web collector path and rejects missing provider credentials or bindings through the centralized Zod environment configuration.

## Architecture implemented

- packages/config validates APP_MODE, DATA_PROVIDER, ANALYTICS_PROVIDER, REALTIME_PROVIDER, QUEUE_PROVIDER, TRACKER_ENABLED, tracker secrets, TTLs, limits, provider credentials, and internal service settings.
- packages/shared owns the public tracker schema, normalization functions, normalized event type, attribution parameter, and pure site-level realtime counting helpers.
- tracker contains the standalone consent-aware, opt-out-aware, non-blocking first-party bundle.
- apps/web/lib/server/traffic-pipeline.ts is the local Node collector adapter for POST /api/collect/v1/events.
- workers/collector implements the production POST /v1/events Worker with OPTIONS, bounded batches, origin checks, keyed hashing, fraud decisions, queue admission, and asynchronous realtime signals.
- workers/queue-consumer implements at-least-once batch delivery, in-memory/KV event deduplication, retry handling, dead-letter-compatible configuration, and explicit Postgres/Tinybird provider selection.
- packages/analytics implements the EventStoreProvider contract, PostgresEventStoreProvider, and TinybirdEventStoreProvider. Public reads use an explicit Tinybird adapter when ANALYTICS_PROVIDER=tinybird; no silent provider fallback is used.
- workers/realtime implements the site/{siteId} Durable Object room with alarms, expiry cleanup, authenticated internal signals, count-change broadcasts, WebSocket support, and snapshot polling. apps/web/lib/server/realtime.ts provides the compatible local adapter and the configured realtime service client.
- apps/web/lib/server/traffic-aggregation.ts records job state, transitions stale keys, removes expired active sessions, and refreshes current realtime counters. workers/aggregation calls the internal route on a five-minute cron.

## Tracker

The final built tracker must be measured with pnpm tracker:build. The build prints minified, gzip, and Brotli sizes and copies the artifact to apps/web/public/tracker.js.

Measured local artifact:

- Minified: 5.72 KB
- Gzip: 2.43 KB
- Brotli: 2.16 KB

These are measured local artifact sizes, not a performance or transfer guarantee for a CDN.

Tracker event types are pageview, session_start, heartbeat, engaged, and session_end. The browser event fields are eventId, eventType, siteKey, visitorId, sessionId, pathname, referrerHost, occurredAt, visible, engagedSeconds, trackerVersion, and optional attributionToken. The full contract is documented in docs/TRACKER_EVENT_SCHEMA.md.

The tracker initializes once, keeps site-scoped anonymous IDs, rotates the visitor identifier on its documented local retention period, creates a tab/session identifier, emits initial session_start/pageview, tracks SPA history changes, pauses hidden-page heartbeats, resumes when visible, emits engagement after visible time, uses Beacon/fetch keepalive, retries conservatively, supports consent-required mode and explicit opt-out, and removes only the opaque _si_at parameter from the visible URL.

## Tracker keys and authorization

Tracker keys are available only to an authenticated owner/editor relation for an active claimed site. The key service supports generate, installation status/test, rotate, and revoke. It stores public key, site, version, environment, allowed domains, activation, last event, last origin, error, and revocation state. The public key never contains the internal site ID.

Generation, rotation, revocation, first detection, connection, stale, and reconnection state changes create persisted activity events. Key mutations are same-origin protected and rate-limited. Revoked keys are not accepted by the collector, and rotation creates a new version rather than reactivating a revoked row.

The Test installation action queries a recent persisted valid event for the current public tracker key. It does not fake a successful browser interaction.

## Collector validation and privacy

The collector enforces JSON content type, body size, bounded batch size, schema validation, active/stale key state, site state, allowed origin, timestamp bounds, normalized path/referrer fields, server received timestamp, keyed visitor/session hashes, rotating IP-derived rate-limit hashes, coarse country/device fields where available, and structured fraud decisions.

Raw visitor IDs, raw session IDs, raw IP addresses, full query strings, full referrer URLs, form data, page text, names, email addresses, and arbitrary custom event payloads do not enter the normalized event or event store. Exact thresholds and infrastructure details are not exposed in public errors or Methodology content.

The suggested response shape is preserved: accepted, rejected, duplicates where the selected provider can report it, and requestId. Invalid/suspected events do not affect public metrics. Suspected events may be retained for review with reason codes and fraud rule version.

## Anti-fraud and replay

The existing anti-fraud package is wired into collector decisions. It evaluates invalid/revoked key state, disallowed origin, malformed identifiers, duplicate event IDs, timestamp bounds, heartbeat ordering/frequency, session/pageview frequency, known bot/headless user agents, datacenter signals when available, engagement validity, attribution token replay, and suspicious referrers.

The normalized decision is valid, suspected, invalid, or review_required. Only valid events update public aggregates and active realtime state. Postgres writes invalid/suspected evidence and fraud flags without letting those rows affect normal metrics. Queue-level and database-level idempotency protect at-least-once delivery.

## Queue and event providers

The local web path uses the local queue boundary and Postgres provider when production mode is configured with QUEUE_PROVIDER=local and ANALYTICS_PROVIDER=postgres. Cloudflare production uses the Collector Worker, Cloudflare Queue, queue consumer, and either a configured Tinybird provider or authenticated internal Postgres ingest route.

The queue consumer deduplicates within a batch, uses an optional processed-event KV ledger, retries transient provider errors, and is configured with a dead-letter queue. The Collector Worker also uses an event-ID KV ledger for replay rejection when bound. It reports queue lag and structured failures without returning slow analytics work to the browser.

## Realtime definitions

An active visitor is a unique valid visitor hash with at least one visible session whose accepted heartbeat is within ACTIVE_SESSION_TTL_SECONDS. An active session is a valid session/tab with a recent visible heartbeat. Two tabs from one visitor are one active visitor and two active sessions. Hidden pages stop heartbeat activity and state expires without requiring session_end.

The default local/production configuration is a 30-second heartbeat and 90-second active TTL. Both values are configurable and bounded by the environment schema. Realtime state is site-level, not one object per browser. WebSocket clients receive count updates but never count as visitors. The web UI has polling fallback and connecting/live/reconnecting/stale/offline states.

## Aggregation and metrics

Postgres current metrics include visitors24h, visitors7d, sessions24h, pageviews24h, engaged sessions, engagement rate, average engagement duration, current active visitors/sessions, SurgeIndex referrals, attributed visits, attributed engaged visits, accepted/suspected/invalid counts, last accepted event, origin, tracker version, and freshness.

Hourly snapshots include visitors, sessions, pageviews, engaged sessions, attributed visits, and activeNow. Public and owner routes read current/snapshot/provider results rather than scanning raw event rows on every request. Aggregation is idempotent at the hourly snapshot and processed-event layers.

Production Batch 3 deliberately does not calibrate Heat Score, growth, organic ranking, breakout status, or rank movement. Empty production states say Building baseline rather than displaying deterministic demo values.

## Referral attribution

The approved /go/[siteSlug] redirect records an outbound click, signs an opaque site/click/expiry token, safely appends _si_at while preserving existing destination parameters, and redirects only to the approved destination. The tracker captures the token, removes only that parameter from the visible URL, and sends it with the landing pageview.

The backend validates signature, expiry, site binding, and replay state, stores only a keyed token hash and internal click linkage, creates one attribution record per token/landing event, and marks an attributed session engaged after a valid engaged event. A click is not a visit until the destination tracker confirms it.

## UI changes

- Owner tracker installation screen: six practical installation tabs, copy snippet/public key, real test installation, generate/rotate/revoke, key/status/freshness/origin/version, and troubleshooting.
- Owner analytics: active visitors/sessions, 24-hour and seven-day visitors, pageviews, sessions, engagement, referral clicks, attributed visits, quality summary, freshness, server-side charts, and explicit no-data/baseline/stale/error/unauthorized states.
- Public /site/[slug], /live, and /api/live/[siteId] expose real tracker metrics, active visitor/session state, data source, freshness, and honest empty states.
- Internal /admin/traffic and /api/admin/traffic/summary show aggregate pipeline health without raw event rows.
- /dev/tracker-fixture loads the actual built tracker outside production and supports SPA navigation, consent, opt-out, and diagnostics.

## Database migrations

- 0002_demonic_snowbird.sql adds tracker activity states, stale/pending enum values, tracker metadata, current/snapshot metric fields, normalized event fields, attribution_record, ingestion_failure, aggregation_job_state, and active-session last_event_at.
- 0003_brave_lily_hollister.sql adds the public tracker-key field used to prove that installation tests and connection status belong to the current key.
- The tracker key database default remains active because PostgreSQL cannot use a newly-added enum value in the same migration transaction that introduces it. Key-management code sets every new state explicitly, and pending remains a valid state for lifecycle/read models.

Migration validation used a fresh temporary PostgreSQL 16 container on 127.0.0.1:55433. The unrelated buzz-postgres container was not stopped or modified.

## Security controls

- explicit provider/config boundary with Zod
- no server secrets in tracker/browser bundles
- public key does not expose internal site ID
- owner/editor authorization for key mutations
- same-origin mutation checks and mutation rate limits
- request/body/batch/event bounds
- strict normalized path/referrer handling
- allowed-origin check combined with anti-fraud and key state
- raw IP and raw browser IDs not stored
- event ID replay protection and provider idempotency
- tracker key revoke/rotate
- internal bearer authentication for queue/aggregation routes and the Realtime Durable Object signal path
- allowlisted referral destination with no open redirect
- no arbitrary custom event payload

## Test results

Final validation record for the local implementation (external services were not claimed):

- pnpm typecheck
- pnpm lint
- pnpm test
- pnpm -F @surge/tracker test
- pnpm -F @surge/queue-consumer-worker test
- RUN_DB_TESTS=1 web tracker-key lifecycle/authorization test: 3 files, 9 tests passed
- RUN_DB_TESTS=1 Postgres repository and event-store integration tests: 1 test passed each against an isolated temporary PostgreSQL 16 database
- drizzle-kit check and migration: passed, including the 0003 migration
- pnpm tracker:build
- pnpm build
- pnpm test:e2e
- Worker typecheck and Wrangler dry-run previews: collector, queue consumer, realtime, aggregation all passed
- Worker-local previews: Realtime snapshot 200 and unauthenticated signal 401; Collector OPTIONS 204 and invalid POST 422
- Production-shaped local HTTP smoke: tracker script 200, collector OPTIONS 204, valid PostgreSQL batch accepted 4, duplicate rejected with duplicates=1, disallowed origin rejected, revoked key rejected with stored reason codes, metrics/live APIs 200, referral redirect 302, unauthorized key API 401
- Demo E2E: 3 tests passed

## Load-test results

The controlled script is scripts/load-tracker-events.ts and runs via pnpm traffic:load. Final bounded demo-adapter probe: 40 events, 4 batches, batch size 10, concurrency 2, duration 66 ms, accepted 40, rejected 0, 4 generated duplicate batches, provider duplicate count 0, transport failures 0, and 4 completed batches. The demo collector intentionally does not exercise the PostgreSQL idempotency path; the DB event-store integration independently verified 7 inserted events followed by 7 duplicates with no second metric effect. The script retries transient 5xx/429/network failures three times.

No unsupported throughput claim is made. Queue retry/dead-letter behavior requires a Worker-compatible preview and real configured queue; Durable Object cleanup requires the configured alarm/TTL. Those external infrastructure runs were not claimed in this local report.

## Environment variables

The complete list is in .env.example. Core Batch 3 variables are APP_MODE, DATA_PROVIDER, ANALYTICS_PROVIDER, REALTIME_PROVIDER, REALTIME_SERVICE_URL, QUEUE_PROVIDER, TRACKER_ENABLED, TRACKER_PUBLIC_URL, TRACKER_COLLECTOR_URL, TRACKER_HASH_SECRET, TRACKER_SIGNING_SECRET, TRACKER_KEY_ROTATION_SECRET, REALTIME_SIGNAL_TOKEN, HEARTBEAT_INTERVAL_SECONDS, ACTIVE_SESSION_TTL_SECONDS, ENGAGED_SESSION_SECONDS, ATTRIBUTION_TTL_MINUTES, TRACKER_EVENT_MAX_BATCH_SIZE, TRACKER_EVENT_MAX_BODY_BYTES, EVENT_RETENTION_DAYS, Tinybird credentials, Cloudflare account/token, queue names, internal service URLs/tokens, and event/realtime KV bindings.

## External credentials and staging

No Tinybird credentials, Cloudflare account/token, real Queue, DLQ, Durable Object deployment, KV binding, or staging deployment was used. Wrangler/OpenNext configurations contain environment-based staging hostnames and explicit placeholders only. Staging deployment is not claimed.

## Known P2 issues

- The process-local rate limiter is suitable for a single local instance; a horizontally scaled deployment needs a distributed limiter.
- The local realtime adapter is process-local; use the Durable Object provider for multi-instance production.
- Tinybird pipes and schemas are represented by the explicit adapter contract but were not exercised without real credentials.
- The internal admin operational summary reports queue lag as null until a provider-specific queue-lag source is attached.
- Historical 30/90-day reporting remains snapshot/provider dependent; Batch 3 does not invent history.
- Full browser E2E with a real external site, Cloudflare bindings, Tinybird, and staging credentials remains a P2 integration pass.
