# Ranking jobs

Batch 4 exposes explicit local and protected job entry points:

```text
pnpm ranking:baseline
pnpm ranking:score
pnpm ranking:snapshot
pnpm ranking:breakouts
pnpm ranking:recompute -- --site=<siteId>
pnpm ranking:backfill -- --dry-run --from=<iso-date> --to=<iso-date>
pnpm ranking:evaluate
```

The internal service endpoint is `POST /api/internal/scoring/run` with a bearer service token and a job of `baseline`, `score`, `ranking`, `breakout`, `all`, or `site`. Admin health and recompute are protected by server-side admin authorization and same-origin checks.

Each run records job type, version, run key, status, timestamps, duration, attempted/completed/skipped/failed counts, and an error class. The unique job key makes repeated Cron delivery safe. Ranking publication deletes and inserts the complete current scope set in one transaction; a failure rolls back the new publication and leaves the previous current set available.

Current local execution is Node/tsx. Cloudflare Cron/Tinybird credentials were not available in this batch, so external scheduler execution is intentionally not claimed.
