# GA4 synchronization architecture

Public pages read persisted site metrics, GA4 aggregates, report snapshots, and realtime snapshots. They do not call Google APIs.

## Job classes

The schema separates:

- `realtime` syncs for five- and thirty-minute snapshots;
- `core_recent` syncs for recent daily data;
- `historical_reconciliation` for closed-day corrections;
- `initial_backfill` for the bounded first import;
- `token_health` for refresh/revocation checks; and
- `freshness_check` for state transitions.

`ga_sync_job` stores the configured next run and pause state. `ga_sync_run` records run ID, request ID, type, row counts, status, error code, and duration. A future scheduler can claim due jobs in batches using `GA4_MAX_PARALLEL_REQUESTS`.

## Core sync

Core sync requests a seven-day daily report using only the supported normalized metric set. It persists:

- requested dates and property time zone;
- metric definitions and provider schema version;
- provider quota metadata;
- import and provider timestamps;
- partial/data-may-still-change flags; and
- one idempotent aggregate per connection, source, metric, window, and bucket.

On a provider failure, the connection becomes degraded or reauthorization-required, but existing valid aggregates remain untouched. The failed run is observable through `ga_sync_run`.

## Realtime sync

Realtime sync persists a snapshot for each explicit minute range. Fetch timestamps are minute-rounded so duplicate invocations update the same snapshot rather than creating an unbounded duplicate row every few seconds. Snapshots expire and can be retained/downsampled by operations policy.

## Backfill

Initial backfill defaults to 90 days and is configurable between one and 365 days. It runs in seven-day date chunks, stores `checkpoint_date` and `processed_days`, and upserts daily aggregates. A failed run becomes `partially_complete` when a checkpoint exists and resumes from the next date. The OAuth callback only queues the job; it does not wait for the full import.

The dashboard reports actual processed/total days, not elapsed-time guesses. Backfill data is confidence-limited until enough compatible observations exist for a baseline.

## Freshness

The connection lifecycle distinguishes connecting, backfilling, connected/live, degraded, reauthorization-required, revoked, disconnected, and error. Quota and provider errors retain the last valid values and expose freshness/error state rather than replacing data with zero.

## Commands

The local operations entry points are:

- `pnpm ga4:fixture`
- `pnpm ga4:sync`
- `pnpm ga4:realtime`
- `pnpm ga4:backfill`
- `pnpm ga4:health`

The latter four require a configured Postgres environment and are intentionally disabled by the demo API routes.
