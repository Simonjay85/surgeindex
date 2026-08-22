# SurgeIndex Batch 2 Report — Production Core Wiring

## Scope

Batch 2 makes the production core real while preserving the deterministic demo provider. The implementation covers:

- Explicit `APP_MODE=demo|production` and `DATA_PROVIDER=demo|postgres` boundaries with no silent fallback.
- PostgreSQL/Drizzle persistence through typed repositories and migrations.
- Better Auth email/password sessions, optional Google OAuth configuration, secure cookies, sign-out, roles, and server-side authorization.
- Canonical site submission, metadata import, duplicate detection, pending moderation, and persisted submission activity.
- SSRF-safe public metadata and ownership-proof fetching.
- DNS TXT and HTML meta-tag ownership claims with expiry, attempt limits, replay protection, conflict handling, and transactional owner creation.
- Owner-scoped dashboard reads, public PostgreSQL reads, activity, moderation, audit logging, category updates, and failure review visibility.
- Request IDs, same-origin mutation checks, structured errors, and process-local mutation rate limits.

The following remain intentionally outside this batch: GA4 data synchronization, Tinybird production ingestion, production tracker ingestion, Stripe payments, creator rankings/campaigns, auctions, AI explanations, and new visual product features.

## Database provider and migrations

`packages/db/src/repositories.ts` is the typed repository boundary used by server services and the PostgreSQL public provider. It covers:

- Public sites, categories, site-category links, canonical domain lookup, current metrics, rank snapshots, and public activity.
- Owner workspace reads using both the authenticated site's owner relation and the original submitter relation, so pending submissions remain visible to the submitting user without exposing them to other users.
- Pending site creation with a transactionally coupled `site_submitted` event.
- Moderation transitions with `site_approved`, `site_rejected`, `site_suspended`, `site_restored`, and `category_changed` events.
- Claims, attempts, expiry, used timestamps, conflict records, owner relations, and `ownership_verified` events.
- Moderation actions and admin audit rows containing actor, target, previous/new state, reason, and request ID.
- Owner-scoped activity and admin claim/verification-failure review records.

Canonical domain normalization is implemented in `packages/shared/src/domains.ts`. HTTP(S) inputs such as `https://www.example.com/pricing`, `http://example.com`, and `https://example.com:443` become `example.com`; non-standard ports, credentials, localhost, private IP literals, IPv6 loopback, `.local`, `.internal`, and invalid hostnames are rejected.

Committed migrations:

1. `packages/db/drizzle/0000_amazing_wong.sql` — baseline Drizzle schema snapshot, including identity, sites, ownership, claims, verification, metrics, ranks, activity, moderation, and future-module tables.
2. `packages/db/drizzle/0001_yummy_big_bertha.sql` — adds the Better Auth 1.7 `account.issuer` column with a credential default.

The schema additions include `site_category`, claim expiry/used timestamps and user/status indexes, unique rank snapshot identity, expanded activity types, and audit previous/new state plus request ID indexes. Repository transitions that update multiple tables use PostgreSQL transactions.

## Authentication, sessions, and authorization

Production auth uses Better Auth 1.7 with the Drizzle PostgreSQL adapter and the Next.js cookies plugin in `apps/web/lib/server/auth.ts`.

- Email/password sign-up and sign-in are enabled.
- Google sign-in is enabled only when both Google client credentials are configured.
- Sessions are persisted in PostgreSQL and use secure, HTTP-only, same-site cookies in production.
- Sign-out invalidates the Better Auth session; the UI sends an explicit JSON body required by the auth endpoint.
- The server loads the role from the database. No client field can grant admin access.
- Demo sign-in is an in-memory demo workspace only and is not used when `APP_MODE=production`.
- `/dashboard` and all nested owner surfaces call `requirePageUser`; admin pages and APIs call `requirePageAdmin`/`requireApiAdmin`.
- Mutating routes apply same-origin checks when an `Origin` header is present. Better Auth trusted origins provide the matching auth boundary.
- Submission, claim start, claim verification, and moderation mutations use a process-local rate limiter. The code documents that this must move to an edge or database-backed limiter before horizontal production scaling.

The documented first-admin flow is out-of-band and password-free:

```bash
ADMIN_BOOTSTRAP_CONFIRM=<exact-email> pnpm admin:promote -- <exact-email>
```

The script refuses to promote another account when an administrator already exists unless `ADMIN_BOOTSTRAP_ALLOW_EXISTING=true` is explicitly supplied. It closes its database pool before exiting.

Authorization matrix:

| Actor | Owner dashboard | Another user's site | Admin API/page | Site submission |
|---|---:|---:|---:|---:|
| Anonymous | Redirect/401 | 404 through owner lookup | 401 | 401 in production |
| Authenticated normal user | Own records only | 404 | 403 | Allowed |
| Authenticated admin | Own records only | 404 | Allowed and audited | Allowed |
| Demo workspace | Deterministic demo surface | Not a production record | Read-only demo surface | Non-persisting demo response |

## Site submission and SSRF defenses

`apps/web/lib/server/site-service.ts` keeps business logic outside the route handler. It validates the URL, canonicalizes the hostname, checks the canonical domain for duplicates, validates the category from PostgreSQL, imports public metadata, sanitizes title/description text, and persists a pending site plus an activity event in a transaction.

`apps/web/lib/server/ssrf.ts` provides the metadata fetcher used for submission and HTML ownership proof:

- Absolute HTTP(S) URLs only; credentials and arbitrary ports are rejected.
- DNS resolution before every fetch and after every redirect.
- Loopback, link-local, private, reserved, multicast, documentation, metadata-service, `.local`, `.internal`, and blocked IPv4/IPv6 ranges are rejected.
- Redirects are manual, limited to three hops, and revalidated.
- Six-second timeout and 256 KiB response limit, including `Content-Length` checks.
- `text/html` and `application/xhtml+xml` only.
- Metadata is parsed as text and sanitized before persistence; remote scripts are never executed.
- Meta verification accepts only an exact `surgeindex-verification` token.

## Ownership claims

The claim service supports:

1. `surgeindex-verification=<token>` DNS TXT proof.
2. `<meta name="surgeindex-verification" content="<token>" />` HTML proof.

Tokens are generated server-side with 32 random bytes, expire after 30 minutes, are scoped to site and user, and are never accepted from a client assertion. Verification is limited by attempts and endpoint rate limits. Successful verification updates the claim, site ownership, owner relation, and `ownership_verified` event transactionally. A claim cannot be replayed after completion or expiry.

If another verified owner exists, the request does not transfer ownership. The failed conflict is persisted as a claim review record. Failed proof attempts and expired challenges are also visible to admins through the moderation review surface. Manual resolution remains an explicit operational step; there is no automatic ownership transfer.

Traffic verification remains separate from ownership. Tracker ingestion is deliberately disabled in production for Batch 2, and the collector endpoint returns `409 tracker_ingestion_not_enabled` rather than pretending that a tracker event was accepted.

## Owner dashboard

The real production dashboard surfaces now read through the authenticated PostgreSQL provider:

- Sites submitted by or owned by the current user.
- Pending/active/rejected/suspended state, category, ownership state, traffic verification state, public profile link, and persisted metric freshness.
- Empty/null states such as “No verified traffic yet”, “Source not connected”, and “No rank snapshots yet”.
- Owner-scoped submission, moderation, and ownership activity.
- Analytics and rank history from persisted snapshots only.
- Verification and badge pages parameterized by the real site ID; no hardcoded `site-launchpilot` links or production demo keys.
- Badge generation avoids inventing `#1` when no persisted rank exists.

The future Boosts, Billing, and Settings surfaces remain protected, clearly marked demo/architecture surfaces because Stripe and those product modules are explicitly out of scope for Batch 2.

## Admin moderation

`/api/admin/moderation` is protected server-side and supports:

- Pending queue reads with basic name/domain search through `?q=`.
- Approve, reject, suspend, restore, and category-change actions.
- Confirmation enforcement for reject and suspend.
- Category options from PostgreSQL for queue updates.
- Failed/expired ownership and verification claim review visibility.
- Recent audit records.

Every state-changing action writes both `moderation_action` and `admin_audit_log` with admin user ID, action, target type/ID, previous state, new state, reason, timestamp, and request ID.

## Public PostgreSQL provider and data truth

`apps/web/lib/server/public-provider.ts` implements the existing public provider interface for PostgreSQL. In production it powers the homepage, rankings, breakouts, categories, category pages, search, site profiles, timeseries, badges, redirect lookup, sitemap, and activity API.

Production rows never use deterministic demo fixtures. When there is no persisted metric/current row or rank snapshot, the provider returns null/empty data and the UI states the missing evidence. The final production smoke returned `source: postgres`, `isDemo: false`, `visitors: null`, `activeNow: null`, and `heatScore: 0` for an approved site with no metric row.

## Environment variables

Demo mode:

```dotenv
APP_MODE=demo
DATA_PROVIDER=demo
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

Production core:

```dotenv
APP_MODE=production
DATA_PROVIDER=postgres
DB_DRIVER=pg
DATABASE_URL=postgresql://...
BETTER_AUTH_SECRET=<at least 32 characters>
NEXT_PUBLIC_APP_URL=https://your-public-origin.example
BETTER_AUTH_URL=https://your-public-origin.example
```

`BETTER_AUTH_URL` may fall back to `NEXT_PUBLIC_APP_URL`, but setting both explicitly is recommended. Google OAuth variables are optional and must be supplied as a matching client ID/secret pair. GA4, Tinybird, Stripe, Turnstile, Cloudflare, and tracker credentials are retained as future integration configuration and were not required or exercised by this batch.

Missing `APP_MODE` or `DATA_PROVIDER` fails configuration parsing. `DATA_PROVIDER=postgres` without `DATABASE_URL`, or `APP_MODE=production` without PostgreSQL or a 32-character Better Auth secret, fails with a readable configuration error. There is no demo fallback.

## Validation evidence

The local Postgres compose service normally binds port `5432`, which was already occupied by the unrelated healthy `buzz-postgres` container. The integration and HTTP smoke tests therefore used an isolated temporary Postgres container on `127.0.0.1:55433`. `buzz-postgres` was not stopped or modified. The temporary test container and test fixtures were removed after validation.

| Check | Result |
|---|---|
| `pnpm typecheck` | Passed across all 11 typechecked workspace projects. |
| `pnpm lint` | Passed with 0 errors and 0 warnings after the sign-out navigation fix. |
| `pnpm test` | Passed: web 8, config 2, shared 3, scoring 13, anti-fraud 16, tracker 8; default DB integration is intentionally skipped without `RUN_DB_TESTS=1`. |
| `RUN_DB_TESTS=1 ... pnpm -F @surge/db test` | Passed: 1 repository integration test, including pending owner visibility, user isolation, moderation, activity, claim completion, conflict review, and audit logging. |
| `APP_MODE=demo DATA_PROVIDER=demo pnpm build` | Passed: tracker bundle plus Next production build. |
| `APP_MODE=production DATA_PROVIDER=postgres ... pnpm -F web build` | Passed: production provider/auth build with PostgreSQL test configuration. |
| `pnpm test:e2e` | Passed: 3 Playwright tests. |
| Production HTTP smoke | Passed: homepage/rankings/API/profile 200; anonymous dashboard/admin redirects 307; anonymous admin API 401; production collector 409; sign-up 200; site submit 201; `www` duplicate 409; admin queue 200; approve 200; claim start 201; expected proof failure 422; normal-user admin 403; other-user site management 404; persistent session survived an app restart; sign-out 200 and dashboard then redirected 307. |

The production smoke also confirmed persisted activity, `source: postgres`, no demo metric values, admin claim-review visibility after a failed proof, and admin audit records.

## Files changed

Key implementation files:

- Configuration and docs: `.env.example`, `README.md`, `BATCH_2_REPORT.md`.
- Database: `packages/db/src/schema.ts`, `packages/db/src/connection.ts`, `packages/db/src/index.ts`, `packages/db/src/repositories.ts`, `packages/db/drizzle/*`, `packages/db/test/repositories.test.ts`.
- Shared safety/config tests: `packages/shared/src/domains.ts`, `packages/shared/test/domains.test.ts`, `packages/config/src/index.ts`, `packages/config/test/config.test.ts`.
- Server core: `apps/web/lib/server/auth.ts`, `authorization.ts`, `claim-service.ts`, `http.ts`, `public-provider.ts`, `rate-limit.ts`, `site-service.ts`, `ssrf.ts`.
- Auth/claims/admin APIs: `apps/web/app/api/auth/[...all]/route.ts`, `apps/web/app/api/claims/*`, `apps/web/app/api/admin/moderation/route.ts`, `apps/web/app/api/sites/route.ts`.
- Owner/public surfaces: dashboard pages/layout, verification/badge clients, activity/public provider wiring, submit and sign-out clients.
- Tests and operations: `apps/web/tests/ssrf.test.ts`, `scripts/promote-admin.ts`, and related route/provider updates.

## Known P2 items and untested external credentials

- Production tracker ingestion, GA4 sync, Tinybird, Stripe Checkout/webhooks, creator modules, campaigns, auctions, and AI explanations were not implemented by design.
- The process-local rate limiter must be replaced with a distributed limiter before running multiple web instances.
- A successful live DNS/meta ownership proof was not claimed against an external controlled domain. Repository transaction tests cover successful completion; HTTP smoke intentionally used `example.com` and verified the expected failure path.
- Google OAuth was not tested because no real Google credentials were supplied.
- Email delivery was not tested because email/password auth is configured without an outbound email provider in this batch.
- Cloudflare/OpenNext production deployment was not performed or claimed.
- Claim conflict review is surfaced for manual admin review; automatic ownership transfer or dispute resolution is intentionally absent.
- Future Boosts/Billing/Settings dashboard modules remain protected demo architecture until their production integrations are implemented.

## Commit

`Implementation commit: 980df41` (`feat: ship SurgeIndex Batch 2 production core`)
