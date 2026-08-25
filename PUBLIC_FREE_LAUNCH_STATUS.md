# SurgeIndex Public Free launch status

Updated: 2026-08-26 (Asia/Ho_Chi_Minh)

Decision: **NO-GO — implementation in progress**

This is the current evidence ledger for the Public Free release. `PASS` means
the named check was actually read back. It does not promote a working-tree
build to a release SHA and does not substitute fixture output for provider
evidence. No evidence record contains a database URL, provider token, mailbox
credential, Turnstile secret, S3 key, or age identity.

## Release identity

| Field | Current value |
| --- | --- |
| Working branch | `codex/public-free-launch` |
| Protected base | `fix/launch-readiness` |
| Pull request | Existing PR #1 must be updated with the final commit |
| Exact release SHA | `PENDING COMMIT AND CI` |
| Independent approval | `PENDING REVIEWER` |
| Immutable release tag | `PENDING MERGE` |
| Release owner | `PENDING OWNER` |
| VPS operator | `PENDING OPERATOR` |

## Current implementation and host evidence

| Gate | Result | Safe evidence / boundary |
| --- | --- | --- |
| Public Free feature boundary | `PASS` | Commercial UI flag defaults false. Navigation, sponsored lanes, pricing, Boost creation/reporting/admin, billing, GA4 connection, revenue cards, robots, and sitemap are fail-closed when disabled. |
| Server commercial flags | `PASS` | Strict launch gate requires Stripe, Boost, live Boost, GA4, revenue board, all paid placements, and future modules to be explicitly false. |
| Email provider contract | `PASS` | HTTP email adapter uses Resend-compatible `reply_to`; a unit test validates endpoint, bearer header, payload, and response handling without exposing a key. |
| Repository validation | `PASS` | `pnpm typecheck`, `pnpm lint`, `pnpm test`, and `git diff --check` passed after the Public Free changes. Final build and CI must run again on the committed SHA. |
| Host package prerequisites | `PASS` | `age`, AWS CLI, and PostgreSQL client packages are installed. Backup verification uses PostgreSQL 17 inside `surgeindex-db`. |
| Local production backup | `PASS` | `surgeindex-20260825T175635Z.dump`, 411957 bytes; service result success; PostgreSQL 17 `pg_restore --list` read-back passed. |
| Host network boundary | `PASS` | Application listener `127.0.0.1:3211` and PostgreSQL listener `127.0.0.1:55433` are loopback-only. |
| Nginx and firewall read-back | `PASS` | Panel Nginx effective syntax/read-back, UFW active state, and nftables read-back passed under root read-only probe. |
| Disk headroom | `PASS` | Root filesystem had 25% free at the current read-back; launch minimum is 20%. |
| Commercial/revenue timers | `PASS` | GA4 and Boost timers are inactive; `surgeindex-higuppy-revenue.timer` was disabled and stopped for Public Free. |
| Existing production release | `FAIL` | Current preview returns 404 for `/api/health/live` and `/api/health/ready`, has only 13 migration journal rows, and is not the Public Free release. It remains the rollback candidate until promotion. |
| Production catalog | `FAIL` | Current database has one non-demo site; launch requires at least ten reviewed real sites across at least three categories, without imported metrics. |
| Production provider configuration | `BLOCKED` | Turnstile hostname keys, transactional email provider/domain, and mailbox evidence are not provisioned. |
| Staging tracker chain | `BLOCKED` | Explicit staging/tracker-test DNS, isolated staging runtime/database, controlled tracker page, and end-to-end database read-back are not provisioned. |
| Off-site backup and restore drill | `BLOCKED` | S3-compatible bucket/credentials and age identity are absent; no encrypted upload, download verification, or disposable restore evidence exists. |
| Legal minimum | `PENDING` | Privacy, Terms, tracker disclosure, AUP, deletion/contact process, and proposed RPO 24h/RTO 2h need owner approval. |
| Canary | `PENDING` | Six-hour production canary begins only after exact-SHA CI, approval, providers, staging, backup/restore, catalog, and readiness gates pass. |

## Next hard-gate sequence

1. Commit the implementation, fast-forward PR #1's head without force push,
   and wait for PostgreSQL 17 `checks` and `migrations` on the exact SHA.
2. Obtain one independent PR approval and merge through branch protection.
3. Provision explicit staging DNS, Turnstile widgets, a verified SurgeIndex
   transactional-email domain/API key, mailbox, S3-compatible bucket/API key,
   and a root-only age identity.
4. Deploy an isolated staging release and PostgreSQL 17 database; run fresh and
   Batch 6 migration evidence, real auth/Turnstile negative cases, and the
   tracker-to-rank/breakout read-back.
5. Complete encrypted off-site upload, download verification, and an explicitly
   named disposable restore drill. Record owner-approved RPO/RTO.
6. Review/import the ten-site catalog through the guarded importer; imported
   sites remain pending/unclaimed/unverified and carry no metrics.
7. Build and install the immutable merge SHA, run forward migration to 14,
   validate health/readiness/jobs, and switch the release symlink atomically.
8. Run the six-hour canary and browser acceptance. Record GO only if all Public
   Free hard gates pass; keep all Commercial features disabled.

## Rollback boundary

Application rollback is an atomic switch to the recorded previous release,
followed by service restart and health/readiness verification. Database
migrations are forward-only; never downgrade the production schema. On
suspected corruption or credential exposure, close mutations, rotate affected
credentials, preserve redacted forensic logs, restore only to a disposable
database for diagnosis, and reopen only after read-back.
