# Tracker pipeline operations

## Provider matrix

| Concern | Local/test | Production option |
| --- | --- | --- |
| App mode | demo or production | production must use Postgres |
| Event analytics | Postgres | Postgres or Tinybird, explicitly selected |
| Queue | local direct adapter | Cloudflare Queue plus consumer |
| Realtime | local registry | Durable Objects site room |
| Aggregation | explicit internal route | Cron/aggregation Worker calling the internal route |

The validated environment is centralized in packages/config. Production fails clearly when a selected provider lacks credentials, URLs, or bindings. UI components never inspect provider variables directly.

## Components and logs

Structured logs include a component, request ID, event ID where available, site ID where operationally required, decision, and timing. Logs must not include raw IP addresses, raw visitor/session IDs, attribution tokens, secrets, or full URLs.

Operational signals include:

- collector requests and accepted/rejected counts
- fraud reason-code counts
- queue delivery and queue lag
- consumer failures and retry attempts
- dead-letter queue delivery
- realtime object/alarm health
- aggregation start/completion/failure
- provider errors
- attribution matches and expiry/replay decisions
- tracker connection and stale/reconnect changes

The internal admin traffic summary exposes aggregate events received/accepted/rejected, suspected events, ingestion failures, connected sites, stale trackers, last accepted event, queue-lag placeholder, and realtime provider. It does not expose raw events.

## Scheduled work

The aggregation route records aggregation_job_state, marks inactive keys stale with throttled activity events, removes expired/hidden active sessions, refreshes current active counts, and is safe to run repeatedly. The aggregation Worker is configured for a five-minute cron. EVENT_RETENTION_DAYS is the retention boundary for future raw-event cleanup extension; snapshot tables are the public history source.

## Local validation

    pnpm tracker:build
    pnpm typecheck
    pnpm lint
    pnpm test
    pnpm test:e2e
    pnpm traffic:load

For a database integration run, use an isolated Postgres instance and set RUN_DB_TESTS=1, DATABASE_URL, DATABASE_URL_UNPOOLED, and DB_DRIVER=pg. Do not point the test command at another project's database.

The load probe accepts TRACKER_LOAD_URL, TRACKER_LOAD_SITE_KEY, TRACKER_LOAD_ORIGIN, TRACKER_LOAD_EVENTS, TRACKER_LOAD_BATCH_SIZE, TRACKER_LOAD_CONCURRENCY, and TRACKER_LOAD_DUPLICATE_EVERY. It reports count, duration, accepted/rejected, generated duplicates, provider duplicate count, and transport failures. It is a bounded correctness probe and makes no throughput claim.

## Staging

Use environment-based hostnames such as app-staging.example.com, cdn-staging.example.com, and events-staging.example.com. Configure the web app, tracker CDN, Collector Worker, Queue, DLQ, Durable Object binding, site-key KV, event-id replay KV, selected event provider, and aggregation Worker separately. Set the `REALTIME_SIGNAL_TOKEN` Worker secret on both the Collector Worker and Realtime Durable Object; `/signal` is an authenticated internal endpoint, while `/snapshot` and `/ws` are read-side public endpoints. A staging deployment is not complete until real bindings and credentials are supplied, the Worker-compatible preview is exercised, and HTTP/WebSocket/read-back checks pass.

No Cloudflare, Tinybird, or staging credentials were used for Batch 3 local validation. Wrangler configurations are prepared but deployment is not claimed.
