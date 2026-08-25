# Database migration report

## Current journal

The current Drizzle journal contains 14 migrations. Migration `0013` adds the
launch-readiness data needed for durable rate limits, job liveness, exact V1
ownership methods, owner listing controls, and disclosure controls.

### Migration 0013

- Adds `ownership_claim_method` with only `meta_tag` and `dns_txt`.
- Records legacy `html_file`, `tracker`, and `ga4` claim rows as failed with a
  `legacy_claim_method=...` error before narrowing the enum. Existing rows are
  not silently reclassified as verified ownership.
- Adds the Postgres `rate_limit_bucket` table for atomic production limits.
- Adds `system_job_run` for last-start, last-success, last-failure, safe error
  code, request ID, and consecutive-failure state.
- Adds owner-controlled `permitted_aliases`, `public_revenue_visible`, and
  `public_page_metrics_visible` columns to `site`.
- Resets the legacy provider-level revenue visibility bit to false. Public
  disclosure is now controlled only by the owner site flag.

## Safe smoke command

The smoke command refuses to run unless the database URL and database name are
explicitly provided, schema reset is explicitly opted into, and the database
name is not production/live-named:

```bash
RELEASE_DB_URL="${RELEASE_DB_URL:?set a disposable PostgreSQL URL in the shell}" \
RELEASE_DB_SMOKE_DATABASE_NAME=surgeindex_migration_smoke \
RELEASE_DB_SMOKE_ALLOW_SCHEMA_RESET=true \
EXPECTED_MIGRATION_COUNT=14 \
pnpm db:smoke
```

The command performs both paths:

1. Drop/recreate the disposable schema and apply every journal entry from the
   initial `0000` entry through the latest migration; assert 14 rows in
   `__drizzle_migrations`.
2. Drop/recreate the disposable schema, apply the first 11 journal entries
   (`0000` through `0010`) to represent the Batch 6 baseline, then apply
   `0011`, `0012`, and the launch migration; assert the final count is 14.

No production reset command is supplied. `pnpm db:migrate` is the deploy-time
forward-only migration command and must run against a private release database
before the application symlink is promoted.

## Migration evidence status

| Check | Status | Note |
| --- | --- | --- |
| Journal reviewed | PASS | `0000` through `0013` are present; `EXPECTED_MIGRATION_COUNT` is 14. |
| Fresh migration | BLOCKED IN THIS WORKSPACE | Requires PostgreSQL 17; the guarded attempt failed closed with `connect ECONNREFUSED 127.0.0.1:5432` because neither a local PostgreSQL listener nor the Docker daemon is available. |
| Batch 6 baseline → 0011/0012/0013 upgrade | BLOCKED IN THIS WORKSPACE | Requires the same disposable PostgreSQL 17 instance; the smoke did not proceed to schema reset without that dependency. |
| Production migration | PENDING RELEASE | Run `pnpm db:migrate`, record the applied count, then call readiness. |

## Recovery boundary

Migrations are forward-only. Do not manually reverse an applied production
migration or run the smoke reset against production. If application rollback is
needed after a schema change, keep the schema at the latest compatible version,
roll the application release to a compatible artifact, or restore a verified
database backup to a disposable target and rehearse promotion. See
`ROLLBACK_RUNBOOK.md` and `BACKUP_RESTORE_RUNBOOK.md`.
