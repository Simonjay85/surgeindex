# GA4 quota management

Core and Realtime quota observations are stored separately in `ga_quota_snapshot`. The normalized provider captures tokens-per-project, tokens-per-property, concurrent request, and server-error metadata when Google returns it.

## States

Operations can classify a property as `healthy`, `limited`, `throttled`, `exhausted`, `recovering`, or `unknown`. A 429 records the last throttling condition and retry-after metadata when available. Provider 5xx, timeout, and transient transport errors are retryable at the provider boundary using exponential backoff with jitter.

## Safe behavior

- Requests are server-side and bounded by the configured timeout and concurrency limit.
- Realtime and Core are accounted for independently.
- Low-priority maintenance should be paused first when quota is low.
- A 429/5xx does not clear or zero valid aggregates.
- A connection remains visible with its last successful sync and freshness state.
- Repeated `invalid_grant` or decryption failure moves the connection to reauthorization instead of retrying forever.

The provider does not create extra Google Cloud projects or attempt to bypass limits. Public request volume cannot increase Google quota consumption because public routes read persisted data.

## Operations view

`/admin/ga4` and the protected health route expose connection state, reauthorization-required connections, failed/backfill work, quota-limited rows, ranking eligibility, and token key versions. Plaintext credentials are never included. Provider latency and detailed request metrics should be connected to the deployment’s structured logging/metrics sink before live launch.

The local fixture reports deterministic quota metadata so parser and dashboard behavior can be tested without Google credentials. No real Google quota behavior was exercised in this batch.
