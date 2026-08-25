# SurgeIndex launch-readiness report

Date: 2026-08-24 (Asia/Ho_Chi_Minh)

Branch: `fix/launch-readiness`

Base: `feat/surgeindex-boost-stripe` at `a38b2fa`

Release recommendation: **NO-GO until the explicitly listed database, provider,
and production read-back gates are completed.** The branch contains the
fail-closed implementation and the operator evidence paths; fixture success is
not being treated as external launch proof.

## Scope and truth boundary

The V1 product boundary is public directory/search/categories/rankings/profiles,
email/password and optional Google authentication, email verification and
password recovery, submission/moderation, meta-tag/DNS-TXT ownership, owner
listing edits, first-party tracker and ranking jobs, GA4 integration, badges,
Boost delivery, Stripe ledger/webhooks, billing/refunds/disputes, and protected
operations health.

Creators, Fanward, Campaigns, Auction, and Public API remain disabled future
modules. Their routes are noindex or removed from the sitemap/navigation
surface. Demo values remain clearly labeled and are never accepted by the
production Postgres path.

Organic rank, Heat Score, baseline growth, breakout eligibility, tracker
traffic, GA4 traffic, Boost impressions/clicks, attributed visits, revenue, and
demo values remain separate data lanes. The Boost server does not write organic
score inputs, and the organic ranking queries do not join paid delivery as a
signal.

## Acceptance evidence

| Gate | Result | Evidence / boundary |
| --- | --- | --- |
| Release branch | PASS | Branch is `fix/launch-readiness`; no merge or push is performed by this task. |
| Typecheck | PASS | `pnpm typecheck` passed across all 14 workspace packages. |
| Lint | PASS | `pnpm lint` passed with no ESLint warnings or errors. |
| Unit and fixture tests | PASS | `pnpm test` passed with 30 web tests plus the workspace suites (2 DB/analytics suites skipped without PostgreSQL); tracker, Boost, GA4, and signed Stripe fixtures passed in the launch-check sequence. Fixtures use no provider network or charge. |
| Fresh migration through latest | BLOCKED HERE / PENDING CI | `pnpm db:smoke` is guarded to an explicitly named disposable database, applies the full `0000`–`0013` journal, and checks `EXPECTED_MIGRATION_COUNT=14`. The attempted run failed closed at `ECONNREFUSED 127.0.0.1:5432` because PostgreSQL/Docker is unavailable in this workspace. |
| Batch 6/0011/0012 upgrade through latest | BLOCKED HERE / PENDING CI | The smoke starts from `0000`–`0010`, then applies `0011`, `0012`, and `0013`; it could not start without the disposable PostgreSQL instance. |
| Production build | PASS | `pnpm build` passed with the tracker, Next app, 66 static pages, and 13 bundled Node job artifacts. |
| Playwright E2E | PASS | The final deterministic demo run passed 4 tests in 10.4s. Production auth/provider flows remain in the external checklist. |
| PostgreSQL exposure | PASS BY CONFIGURATION | `docker-compose.yml` requires credentials and binds the host port to `127.0.0.1`; VPS README includes firewall and effective-listener checks. |
| Trusted IP/XFF spoofing | PASS BY TEST DESIGN | `getTrustedClientIp()` ignores X-Forwarded-For; Nginx overwrites X-Real-IP and clears XFF. `apps/web/tests/client-ip.test.ts` covers proxy modes and proves a changed XFF cannot bypass the shared limiter identity. |
| SSRF DNS rebinding/private-address controls | PASS BY FIXTURE TESTS | `apps/web/tests/ssrf.test.ts` covers mixed DNS, private IPv4/IPv6, redirect re-resolution, HTTPS downgrade, pinned address, content type, declared/streamed body limits, and a stalled-response timeout. |
| Sign-up/verification/login/reset | IMPLEMENTED; EXTERNAL RUN PENDING | Better Auth verification, reset, resend pages, transactional email abstraction, Turnstile, CSRF origin checks, and auth rate limits are wired. A real mailbox/provider read-back is still required. |
| Submit/moderate/claim/owner edit | IMPLEMENTED; DATABASE/E2E RUN PENDING | Submission remains pending until moderation; claims are exactly meta_tag/dns_txt; owner editor is version-checked, authorized, validated, and audit logged. |
| Tracker aggregation/rank/breakout | IMPLEMENTED; STAGING READ-BACK PENDING | Postgres jobs and freshness rows are wired. No staging listener, real tracker installation, or ranking read-back is claimed here. |
| GA4 fixture | PASS | `pnpm ga4:fixture` passed deterministically and never proves a Google property. |
| GA4 external OAuth/property/sync/backfill | PENDING EXTERNAL RUN | See `EXTERNAL_SMOKE_TEST_CHECKLIST.md`; no Google credential/property claim is made. |
| Five Boost placements | PASS BY INVENTORY ASSERTION; DELIVERY READ-BACK PENDING | `pnpm boost:placement-check` checks route rendering, route context, and five kill switches. Real package/inventory/viewability/read-back remains gated. |
| Stripe signed fixture | PASS | `pnpm stripe:test-webhook` passed by signing and parsing a local fixture only. |
| Stripe real test mode | PENDING EXTERNAL RUN | Requires approved test keys, real Checkout, a signed event at `/api/webhooks/stripe`, and database read-back. Live keys and live charges remain disabled. |
| Refund/dispute/underdelivery | IMPLEMENTED; EXTERNAL/DB RUN PENDING | Ledger transitions, refund validation, disputes, replay, delivery completion, underdelivery, and admin endpoints exist; they have not been exercised against live provider records here. |
| Paid does not alter organic rank | PASS BY CODE BOUNDARY; INTEGRATION READ-BACK PENDING | Paid tables and route responses are separate; the final staging check must compare the same organic inputs with/without a paid campaign. |
| Revenue/page-metric privacy | IMPLEMENTED; ENABLEMENT PENDING | Separate `PUBLIC_REVENUE_BOARD_ENABLED` and `PUBLIC_PAGE_METRICS_ENABLED` flags default false; owner disclosure remains persisted and default false. |
| Backup/restore drill | IMPLEMENTED; HOST/DB RUN PENDING | Local custom-format backup, age-encrypted S3-compatible offsite upload, download/decrypt/`pg_restore --list`, and explicit disposable restore command are supplied. No host backup was executed in this workspace. |
| Health/readiness/job freshness | IMPLEMENTED; PRODUCTION RUN PENDING | `/api/health/live`, `/api/health/ready`, and admin-only `/api/admin/jobs/health` are wired. `pnpm jobs:smoke` starts all 13 bundled entrypoints in disabled mode; real migration count and timer journal evidence are pending. |

## Commands

Deterministic release command (requires an explicitly named disposable database
because it includes schema reset in the migration smoke):

```bash
RELEASE_DB_URL='postgresql://<disposable-user>:<disposable-password>@127.0.0.1:5432/<disposable-db>' \
RELEASE_DB_SMOKE_DATABASE_NAME='<disposable-db>' \
RELEASE_DB_SMOKE_ALLOW_SCHEMA_RESET=true \
EXPECTED_MIGRATION_COUNT=14 \
pnpm launch:check
```

Individual readiness and operational commands:

```bash
pnpm launch:gates
pnpm security:scan
pnpm boost:placement-check
pnpm jobs:build
pnpm jobs:smoke
pnpm db:smoke
pnpm build
pnpm test:e2e
```

`launch:gates` reports only booleans, environment mode/provider, gate names,
and timestamps. It never prints secret values. `--strict` is available for a
deployment gate and should remain red until the relevant approval/read-back is
complete.

## Remaining blockers

1. Run the fresh and 0011/0012-upgrade migration smoke against a disposable
   PostgreSQL 17 instance and archive the output. The local attempt is blocked
   by `connect ECONNREFUSED 127.0.0.1:5432`; `docker version` also reports that
   the Docker daemon is unavailable.
2. Attach the CI run URL after branch protection is enabled. The local
   typecheck, lint, unit/fixture, build, static security, job-bundle, and E2E
   gates already pass; the aggregate `pnpm launch:check` stops at the guarded
   migration smoke for the same PostgreSQL connection error.
3. Supply approved production Turnstile and transactional-email configuration,
   then read back a real signup, verification, reset, and resend flow.
4. Install and exercise a real tracker staging site, then read back collector,
   aggregation, score, rank, breakout, and job freshness state.
5. Supply approved Google OAuth/property credentials and complete the GA4
   checklist, including token refresh, backfill, disconnect, reconnect, and
   revoke.
6. Supply approved Stripe test-mode credentials and complete real Checkout,
   signed webhook, duplicate/out-of-order/refund/dispute/replay, and database
   read-back checks. Do not enable `BOOST_LIVE_MODE_ENABLED` during this task.
7. Configure encrypted offsite backup credentials, run a restore drill on a
   disposable database, and record RPO/RTO evidence.
8. Complete legal/privacy/advertising/payment-provider review before public
   commercial launch.

## Final decision

The code path is substantially hardened and operationally documented, but the
correct release decision for this branch at this point is **NO-GO / ready for
staged verification**, not production-ready. A GO requires the evidence above,
not just passing fixture tests.
