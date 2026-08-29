# SurgeIndex Public Free end-to-end runbook

This runbook describes the controlled staging and production-canary checks for
the Public Free core. It is an operator procedure and evidence template; it
does not authorize deployment, DNS changes, real account creation, real email
delivery, or a production canary. Those actions require approval at the time
they are performed.

## Release identity and evidence rules

Record the exact immutable release SHA in every evidence file. Do not use a
branch name, a local build timestamp, or an earlier CI SHA as a substitute.
Keep request IDs, timestamps, status codes, and redacted read-backs, but never
record passwords, session cookies, mailbox links, verification/reset tokens,
Turnstile responses, API keys, database URLs, or provider secrets.

| Field | Value |
| --- | --- |
| Release branch | `codex/public-free-e2e-hardening` |
| Release SHA | `<exact SHA under test>` |
| Environment | `staging` / `production-canary` |
| Operator / approval ticket | `<operator and ticket>` |
| Browser/device matrix | `Chrome desktop`, `Safari desktop`, `Chrome mobile`, `Safari mobile` |
| Start/end UTC | `<timestamps>` |
| Evidence file | `output/public-free-e2e-evidence.json` |
| Result | `BLOCKED` / `STAGING READY` / `PRODUCTION CANARY READY` |

`PUBLIC_FREE READY` is not a staging result. It is valid only after the
production canary has run for six hours, all required evidence has been
reviewed, and the release owner has explicitly updated the release manifest.

## Staging isolation

The staging host is intentionally separate from production:

| Resource | Required staging value |
| --- | --- |
| Application host | `staging.surgeindex.lol` |
| Application listener | `127.0.0.1:3212` |
| PostgreSQL listener | `127.0.0.1:55434` |
| Database | `surgeindex_staging` |
| Release root | `/opt/surgeindex-staging` |
| Configuration root | `/etc/surgeindex-staging` |
| Service/timer prefix | `surgeindex-staging-*` |
| Protection | Nginx Basic Auth plus HTTPS |

The staging process must use `APP_MODE=production`, `DATA_PROVIDER=postgres`,
`EXPECTED_MIGRATION_COUNT=14`, and `TRACKER_ENABLED=true`. It must have a
separate Better Auth secret, database, email configuration, and Turnstile
site-key/secret pair for the exact staging hostname. It must not read the
production database or production secret store.

Listing editors may update ordinary presentation metadata, but only the exact
verified site owner (or an existing admin policy) may change permitted tracker
aliases or public revenue/page-metric disclosure settings. Those fields are
re-checked while the site row is locked, and active tracker allowlists are
updated in the same transaction.

Keep these Public Free guardrails enabled in staging and at the canary:

```text
NEXT_PUBLIC_COMMERCIAL_ENABLED=false
STRIPE_ENABLED=false
BOOST_ENABLED=false
BOOST_LIVE_MODE_ENABLED=false
GA4_ENABLED=false
PUBLIC_REVENUE_BOARD_ENABLED=false
BOOST_PLACEMENT_HOMEPAGE_ENABLED=false
BOOST_PLACEMENT_CATEGORY_ENABLED=false
BOOST_PLACEMENT_RANKING_ENABLED=false
BOOST_PLACEMENT_PROFILE_ENABLED=false
BOOST_PLACEMENT_BREAKOUT_ENABLED=false
FEATURE_CREATORS=false
FEATURE_CAMPAIGNS=false
FEATURE_AUCTION=false
FEATURE_PUBLIC_API=false
```

Radar stays out of primary navigation unless it has been intentionally
configured and independently reviewed. The default is
`NEXT_PUBLIC_RADAR_ENABLED=false`.

## Controlled canary fixture

Use only an approved controlled site and mailbox:

| Fixture | Value |
| --- | --- |
| Website | `canary.surgeindex.lol` |
| Mailbox | `launch-canary@surgeindex.lol` |
| Page properties | Valid metadata, `noindex`, replaceable claim meta tag |
| Tracker properties | Replaceable staging tracker snippet; controlled pageview, navigation, heartbeat, and opt-out actions |

Never commit the canary claim token, mailbox credentials, tracker key, or
Turnstile response. Store those only in the approved secret manager or the
operator's ephemeral browser session.

## Preflight checks

Run these checks from the exact release checkout before any host action:

```bash
git rev-parse HEAD
git diff --check
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm test:e2e
pnpm audit --prod --audit-level high
pnpm security:scan
pnpm launch:gates:public-free
```

`launch:gates:public-free` is a configuration check. It does not prove that a
provider, mailbox, host, database, or browser flow passed. If it returns a
non-zero status, retain `BLOCKED`/`PENDING` and record the redacted output.

For PostgreSQL evidence, use disposable databases only:

```bash
MIGRATION_EVIDENCE_FILE=output/migration-evidence.json pnpm db:smoke
```

The migration gate must show a fresh PostgreSQL 17 run and a Batch 6 upgrade,
ending at migration count `14`. Never downgrade the schema to recover from an
application rollback.

## Staging acceptance sequence

Run the following in order and record a result plus safe evidence for every
row. A failure stops the sequence until the cause is fixed and retested.

| # | Check | Required observation |
| --- | --- | --- |
| 1 | Signup | A real Turnstile widget verifies with action `signup` and the exact staging hostname. |
| 2 | Pre-verification login | Login is rejected and no authenticated session is created. |
| 3 | Verification email | The controlled mailbox receives one verification message from the approved sender. |
| 4 | One-time verification | The link verifies once; replay is rejected or has no effect. Never put the link in evidence. |
| 5 | Post-verification redirect | Login returns to safe internal `/submit`, not an external URL or an encoded open redirect. |
| 6 | Submit page | Anonymous users are redirected to sign-up; unverified users see only the verification/resend panel; verified users see the form. |
| 7 | Submit | `canary.surgeindex.lol` passes domain validation and `site-submit` Turnstile. Exactly one `pending` site and one activity row are created. |
| 8 | Submit rejection paths | Invalid, private, duplicate, metadata-failure, and rate-limited requests fail without a partial site. Auth rejection happens before Turnstile/provider calls. |
| 9 | Moderation | Admin approve/reject/suspend requires the expected confirmation/reason, preserves actor/request ID/timestamp audit evidence, and keeps pending listings private. |
| 10 | Public listing | Approval exposes the profile as `Unclaimed / Unverified`; a pending, rejected, suspended, or deleted listing is not public or claimable. |
| 11 | Claim start | A verified user can start a claim with action `claim-start`; the token expires after 30 minutes, is attempt-limited, and cannot be replayed. |
| 12 | Claim ownership | Meta-tag verification succeeds with action `claim-verify`; concurrent owner claims resolve to one owner and do not rewrite traffic provenance. |
| 13 | DNS ownership | The DNS TXT path passes in the integration environment and writes the same ownership/audit evidence as the meta path. |
| 14 | Tracker key | Only the owner of an active claimed site can generate, rotate, or revoke a key. A new key is bound to the canonical domain and explicit permitted aliases. |
| 15 | Tracker install | The staging snippet sends pageview, navigation, heartbeat, and opt-out events. `Test installation` passes only after a persisted accepted ledger event exists. |
| 16 | Tracker provenance | Wrong-origin, suspected, invalid, replayed, and opted-out events never become Tracker Verified or organic ranking input. |
| 17 | Dashboard | Read-back shows last accepted event, last detected origin, tracker version, and `Active`/`Connected`/`Stale` status from persisted data. |
| 18 | Public profile | Accepted tracker evidence changes provenance to `Tracker Verified`; insufficient data remains `building baseline`; no fabricated rank or Heat Score appears. |
| 19 | Recovery and abuse | Resend, reset, expired/reused token, invalid token, rate limit, non-enumeration, and Turnstile action/hostname mismatch checks pass. |
| 20 | Jobs/readiness | Authenticated jobs health, collector, fraud decision, active session, aggregation, scoring, and job freshness read back successfully for the same controlled event window. |

Complete the sequence in Chrome and Safari on desktop and mobile widths. Check
the drawer with keyboard only: `aria-expanded`, `aria-controls`, focus moves
into the drawer, `Escape` closes it and restores trigger focus, backdrop click
closes it, background scrolling is locked, route changes close it, and the
touch target remains at least 44px. Check widths `375`, `390`, `768`, and
`1440` for horizontal overflow and run Axe with no serious/critical findings.

## Read-back tooling

The existing read-only probes write sanitized, attributable files when an
operator supplies an output path:

```bash
STAGING_BASE_URL='https://staging.surgeindex.lol' \
STAGING_BASIC_AUTH='<secret-manager value: user:password or Basic header>' \
STAGING_READBACK_EVIDENCE_FILE='output/staging-readback.json' \
pnpm staging:readback

LAUNCH_EVIDENCE_DIR='output/launch-readiness' \
pnpm launch:check
```

`STAGING_ADMIN_COOKIE` may be supplied through the secret manager for an
authenticated read-back. When the staging edge requires Basic Auth, supply
`STAGING_BASIC_AUTH` from the secret manager as either `user:password` or a
complete `Basic ...` header. The read-back script consumes it only as an
Authorization header and records only `basicAuthProvided: true`; it must never
print or persist the value. A green health endpoint alone is not tracker,
moderation, email, or provider proof.

## Production rollout and six-hour canary

Only after the independent Sol Medium final review reports no P0/P1 findings,
staging acceptance is complete, and the release owner authorizes the specific
external action:

1. Confirm CI is green for the exact merge SHA and record `BUILD_SHA`.
2. Build an immutable, versioned release directory.
3. Run forward migrations and verify live health, readiness, database, and
   migration count `14` before switching traffic.
4. Atomically switch the application symlink and restart the compatible
   service. Do not downgrade schema migrations.
5. Repeat the controlled signup-to-profile/tracker flow using
   `launch-canary@surgeindex.lol` and `canary.surgeindex.lol`.
6. After profile and tracker evidence is complete, suspend the canary listing
   with an audited admin action. Do not delete it; preserve the evidence trail.
7. Observe for at least six hours.

The six-hour result is `FAIL` if there is any readiness failure, repeated
restart, stale/failed required job, auth/email/Turnstile system failure,
tracker accepted-event failure, unexpected 5xx spike, rate-limit anomaly,
demo data, or enabled payment/commercial route. On failure, stop announcing,
keep the database forward-only, switch to a compatible prior application
symlink, and preserve redacted logs, request IDs, and exact SHAs.

The result can be `PUBLIC_FREE READY` only when the six-hour canary and its
evidence are reviewed and all paid/future features remain disabled. Fanward,
Radar, GA4, Stripe, Boost, Campaigns, and Bid the Moment are not launch claims
for this release.

## Evidence outcome template

Use `docs/launch/public-free-e2e-evidence.template.json` as the starting shape.
Every `PASS` needs a current read-back reference; source inspection, fixture
output, a local build, or a successful command is supporting evidence only.
Unexecuted provider, mailbox, host, DNS, and production checks remain
`PENDING` or `BLOCKED`.
