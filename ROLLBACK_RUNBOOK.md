# Release and rollback runbook

## Release layout

Production releases use versioned directories under `/opt/surgeindex/releases`
and the `/opt/surgeindex/current` symlink. A release is not promoted until the
artifact, migration, readiness, and smoke evidence are recorded.

## Application release rollback

1. Declare the incident and freeze imports, owner edits, Boost changes, and
   provider reconciliation until the decision is recorded.
2. Identify the active symlink and the last known-good release. Do not delete
   either directory.
3. Stop or pause affected systemd timers if they are producing bad writes; use
   placement kill switches and `BOOST_ENABLED=false` for paid delivery.
4. Switch the symlink atomically to the compatible known-good release, restart
   `surgeindex.service`, and verify:

```bash
readlink -f /opt/surgeindex/current
sudo ln -sfn /opt/surgeindex/releases/<known-good-release> /opt/surgeindex/current
sudo systemctl restart surgeindex.service
curl -fsS https://surgeindex.lol/api/health/live
curl -fsS https://surgeindex.lol/api/health/ready
```

5. Inspect the web journal, Nginx error log, job-health endpoint, and provider
   webhook failure count. Keep the incident read-only until the cause is known.

## Database rollback boundary

Migrations are forward-only. Do not run an invented down migration or reset a
production schema. If the new application is compatible with the latest schema,
roll back only the application artifact. If the schema itself is corrupt,
restore a verified encrypted backup to a disposable target, rehearse the
application against it, and obtain explicit owner approval before any database
promotion. See `BACKUP_RESTORE_RUNBOOK.md`.

## Provider-specific containment

- Stripe: keep `STRIPE_ENABLED=false` or `BOOST_LIVE_MODE_ENABLED=false`, stop
  Boost timers, and preserve webhook delivery evidence. Use guarded replay only
  after reviewing the event and idempotency state.
- GA4: disable GA4 timers or set `GA4_ENABLED=false` if provider responses are
  stale or malformed. Do not delete encrypted credentials while diagnosing.
- Tracker: stop collector ingestion only if it is corrupting data; preserve
  accepted/fraud decisions and inspect job freshness before restarting.
- Boost: disable each affected placement first. A kill switch must stop package
  availability and serving without modifying organic metrics.

## Post-rollback checks

- `/api/health/live` is 200 and dependency-free.
- `/api/health/ready` is 200 with expected migration count.
- Public pages show the expected canonical host and no disabled-module index
  artifacts.
- Admin job health shows fresh successes or an explicitly documented pause.
- Organic ranking inputs and paid tables remain separate.
- No duplicate Stripe transition, refund, attribution, or webhook mutation was
  introduced.
- Incident, release SHA, schema version, provider state, and next action are
  recorded before normal traffic/jobs resume.
