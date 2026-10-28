# Batch 5 report — GA4 OAuth, verified analytics, and source reconciliation

## Release status

- Branch: `feat/surgeindex-ga4-integration`
- Batch 4 baseline commit: `25dc116`
- Batch 5 implementation commit: `373d794`
- Final report commit: recorded in the handoff after this report is committed
- Merge/push: not performed
- Status: **Implementation complete — External GA4 verification pending**

Batch 6 was not started. This branch contains the Batch 5 work only.

## OAuth scopes and implementation

- Requested scope: `https://www.googleapis.com/auth/analytics.readonly`
- Flow: server-side OAuth 2.0 authorization code with S256 PKCE and offline access
- State: cryptographically random, SHA-256 hashed at rest, bound to authenticated user, site, safe return path, and ten-minute expiration
- Transaction: `ga_oauth_transaction` stores the hash, encrypted PKCE verifier, key version, user/site binding, return path, expiry, and one-time completion timestamp
- Callback: static `/api/ga4/callback` for real Google registration, with exact configured origin/path validation; the site-specific callback remains for deterministic fixture compatibility
- Account-link protection: property/stream access is re-read with the granted token and does not grant SurgeIndex ownership
- Edit permissions: rejected if present; no property, stream, event, audience, dimension, metric, or access-binding writes are implemented
- Client boundary: OAuth codes and tokens never enter browser responses or client components

No real Google OAuth client or owned production GA4 property was available in this run. The report therefore does not claim real redirect, callback, refresh-token, property-data, quota, or revocation verification.

## Token encryption

Refresh and short-lived access tokens are stored through the server-only credential store using authenticated AES-256-GCM envelopes with a version, random IV, authentication tag, and ciphertext. Associated data binds each envelope to its connection and purpose. The configuration supports a current and previous key version, and the re-encryption primitive supports rotation migrations.

If a credential cannot be decrypted, the connection becomes `reauthorization_required`; imported analytics history is retained. Revocation/destroy removes credentials without deleting historical aggregates. Token, code, secret, and provider-payload logging is excluded from the provider/service paths.

## Property discovery and stream validation

- Normalized internal account, property, and web-stream types isolate React/UI code from Google response shapes.
- Account/property and stream pagination are supported; browser results are bounded by `GA4_MAX_PROPERTIES_PER_USER` and searchable.
- Android and iOS streams are excluded from website selection.
- Domain matching normalizes scheme, default ports, `www`, case, trailing dots, and IDN hostnames.
- Exact and `www`-equivalent matches can activate automatically.
- Arbitrary subdomains and mismatches are blocked; approved subdomain/alias states are represented for explicit policy/admin review.
- A successful lightweight Core report is required before the connection is `connected` or ranking-eligible.
- GA4 connection, ownership verification, traffic-source verification, and ranking source remain separate statuses.

## Metrics imported

The normalized Core contract includes `active_users`, `sessions`, `screen_page_views`, `engaged_sessions`, `engagement_rate`, `average_session_duration`, `user_engagement_duration`, `key_events`, and `event_count` when compatible. Core data is stored in `ga_metric_aggregate` with source, metric, window, bucket, observation time, freshness, confidence, provider-definition version, partial flag, and data-may-still-change flag.

Realtime is stored separately in `ga_realtime_snapshot` and includes active users, screen/page views, event count, and key events. The fixture and sync paths support five-minute and thirty-minute ranges. Public labels use `GA4 active users — last 5 minutes` or `GA4 active users — last 30 minutes`; GA4 realtime is never labeled tracker `Online Now`.

## Sync intervals and backfill

Validated configuration includes:

- Realtime: default five minutes
- Recent Core: default 60 minutes
- Initial backfill: default 90 days, bounded to 1–365 days
- Request timeout: default 8 seconds
- Provider concurrency: default four requests
- Source lock: default 14 days
- Overlap/review window: default seven days
- Fresh/offline thresholds: configurable through the GA4 environment variables

`ga_sync_job`, `ga_sync_run`, and `ga_backfill_job` separate realtime, recent Core, reconciliation, token health, freshness, and initial backfill work. Backfill runs in seven-day chunks, persists checkpoints, resumes after interruption, and upserts aggregates idempotently. The OAuth callback queues work and does not block on 90 days of imports.

No production Cron/Cloudflare scheduler was provisioned or exercised. The local scripts are `pnpm ga4:sync`, `pnpm ga4:realtime`, `pnpm ga4:backfill`, and `pnpm ga4:health`; they require the configured Postgres runtime.

## Quota and failure handling

Core and Realtime quota observations are stored independently in `ga_quota_snapshot`, including remaining/concurrency/server-error values where provided. Retryable 408/425/429/5xx responses use bounded exponential jitter. Quota-limited or failed runs preserve the last valid persisted metrics and expose degraded/freshness state. Invalid grants, revoked access, decryption failure, unsupported streams/metrics, malformed responses, timeouts, and partial backfills map to safe internal error states.

The deterministic fixture includes quota metadata and the provider boundary includes a mock transport. Real Google quota behavior was not tested.

## Source reconciliation and ranking integration

`site_metric_source_policy` stores one primary source (`tracker` or `ga4`), source version, start/lock times, previous source, reason, provisional window, and baseline compatibility. Connecting GA4 defaults/preserves tracker as primary and does not silently change a score.

The score engine consumes one source-specific bundle per calculation. GA4 primary scoring reads persisted GA4 Core aggregates, records source/provider-definition version in scores, rank snapshots, and current ranking, and does not derive tracker `activeNow` from GA4 realtime. `baseline_bucket` is isolated by site/source/bucket so a migration cannot overwrite the other source’s observation. Paid data and Boost fields remain outside scoring.

Source changes require an authenticated owner workflow with a reason, successful GA4 eligibility when switching to GA4, an audit transition row, lock period, provisional period, and baseline re-evaluation. The comparison endpoint shows tracker and GA4 values side by side; it never sums them. Disconnecting GA4 stops future sync and ranking eligibility while retaining history.

## Database migrations

Added/generated:

- OAuth transactions and encrypted credential records
- GA accounts, properties, data streams, capabilities
- Sync jobs/runs, backfill jobs, quota snapshots
- Core report snapshots, realtime snapshots, normalized metric aggregates
- Source policy and source transition audit records
- Source/provider-definition fields on current metrics, scores, rankings, snapshots, and baselines
- Source-aware baseline bucket uniqueness

Migration files: `packages/db/drizzle/0006_boring_sunspot.sql` and `packages/db/drizzle/0007_overjoyed_beyonder.sql`. Migrations were generated and typechecked; no production database was modified in this run.

## API and UI changes

Added protected routes for OAuth start/callback, property/stream discovery, test/selection, status, manual sync, backfill, disconnect/reauthorize, comparison, and explicit ranking-source transition. All mutation routes use server authentication/ownership, Zod payload validation, same-origin checks, rate limits where applicable, request IDs, and safe error messages.

Owner UI: `/dashboard/sites/{siteId}/ga4` explains read-only scope and ownership separation, lists properties/streams, displays match/report state, backfill progress, freshness, quota and ranking-source status, and distinguishes local disconnect from reauthorization. Admin UI: `/admin/ga4` displays operational connection/quota/backfill/key-version health without plaintext tokens. Public site/profile surfaces show persisted GA4 realtime labels and source badges only; public requests never call Google.

## Fixture and automated test results

The deterministic fixture covers:

- OAuth exchange with read-only scope
- paginated properties and streams
- exact/mismatch domain cases
- normalized Core and Realtime report values
- provider metric mapping
- mock transport boundary
- AES-GCM associated-data protection
- key-version rotation and tamper rejection
- source selection, source lock, audit-reason requirement, and no-double-count policy

The final command results are recorded below after the final validation pass.

## Real credential verification status

**External GA4 verification pending.** No real Google credentials, redirect, refresh token, owned property, Core report, Realtime report, revocation, or Google quota were used. This is intentionally not described as externally verified.

## External infrastructure used

None for GA4. Tests used the local deterministic fixture, mock transport, TypeScript/Vitest, and the repository’s existing local demo/runtime boundaries. No Google Cloud project, OAuth client, external Postgres, Cloudflare scheduler, or live analytics property was accessed.

## Known limitations / P2 issues

- A real Google OAuth smoke test remains outstanding.
- Scheduler/queue claim, production secret-manager wiring, and alert sink integration remain deployment work; local scripts provide the operational seam.
- Provider pagination is normalized and fixture-tested; multi-page Google Admin results should be exercised with a real or recorded transport before launch.
- The owner comparison uses the latest bounded persisted daily rows and should be extended with property-timezone-aware rollups for a production billing/analytics review.
- Admin view is read-only in this batch; admin retry/rebuild/review actions need an operations policy and implementation before broad rollout.
- Tinybird-backed public provider paths do not call Google but require an explicit persisted GA4 enrichment integration if GA4 realtime is to be shown on every analytics backend.
- Google API metadata/capability checks are represented in schema and lightweight report validation; a full metadata catalog is not yet synchronized.

## Final validation

The final local validation pass completed with the following results:

- `pnpm typecheck` — PASS across all workspace packages
- `pnpm lint` — PASS
- `pnpm test` — PASS: web 10 passed / 2 DB-gated skipped; GA4 7 passed; scoring 31 passed; config 3 passed; anti-fraud 17 passed; tracker 11 passed; remaining workspace suites passed or had no tests
- `pnpm build` with `APP_MODE=demo DATA_PROVIDER=demo SURGEINDEX_NEXT_DIST_DIR=.next-batch5-final` — PASS; tracker bundle and Next production route generation completed, including static `/api/ga4/callback` and all protected GA4 routes
- `pnpm test:e2e` — PASS, 3 Playwright Chromium specs
- `pnpm ga4:fixture` — PASS; read-only scope, two property pages, web-stream match, normalized Core row, and 30-minute Realtime value verified
- `pnpm ga4:sync`, `pnpm ga4:realtime`, `pnpm ga4:backfill`, `pnpm ga4:health` — PASS in demo mode with explicit disabled output; they do not import server-only services or fall back to fixture data
- HTTP smoke against a local production build — PASS: homepage 200, persisted leaderboard API 200, callback rejection 307, and demo OAuth start 409 with a safe `demo_mode` error/request ID
- `git diff --check` — PASS

Database integration/migration execution against a real Postgres instance was not performed in this run; migrations were generated and DB package typechecked. No merge or push was performed. Batch 6 must wait for review of this report and, if required, external GA4 verification.
