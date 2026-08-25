# SurgeIndex release evidence

This file is the authoritative GO/NO-GO manifest for the
`fix/launch-readiness` release branch. It records repository evidence and the
external gates that still require an operator, provider, host, or reviewer. It
is not a claim that an unchecked item passed.

Allowed gate results are exactly: `PASS`, `FAIL`, `BLOCKED`, and `PENDING`.
`PASS` requires a current, attributable read-back reference. Fixture output,
configuration presence, source inspection, or a successful shell command may be
recorded as supporting evidence but does not replace an external gate.

## Release identity

| Field | Value |
| --- | --- |
| Branch | `fix/launch-readiness` |
| Release SHA | `10dc8a1d2cf462b83ed39d174dfdf681c54793f1` (PR #1 head) |
| CI merge SHA | `65af977914420a57ef8c0f824c9f4258405d4c16` (successful PR merge ref) |
| Base / ancestry | `feat/surgeindex-boost-stripe` lineage; verify with the CI SHA before release |
| Release owner | `PENDING OWNER` |
| Approval ticket | `PENDING TICKET` |
| Evidence updated at | `2026-08-25T13:23:14Z` |

## Repository and CI evidence

| Gate | Result | Evidence / read-back | External action required |
| --- | --- | --- | --- |
| Release SHA | `PASS` | PR [#1](https://github.com/Simonjay85/surgeindex/pull/1) head is `10dc8a1d2cf462b83ed39d174dfdf681c54793f1`; successful CI artifact records merge SHA `65af977914420a57ef8c0f824c9f4258405d4c16`. | Reconfirm the head/merge SHA pair for each subsequent release run. |
| GitHub Actions run | `PASS` | [Run 32852663180](https://github.com/Simonjay85/surgeindex/actions/runs/32852663180) passed required `checks` and `migrations` jobs. [launch-readiness-evidence artifact](https://github.com/Simonjay85/surgeindex/actions/runs/32852663180/artifacts/9565008895) and [migration-evidence artifact](https://github.com/Simonjay85/surgeindex/actions/runs/32852663180/artifacts/9564913211) were uploaded. | Re-run for each release SHA. |
| PostgreSQL fresh migration | `PASS` | [migration-evidence.json](https://github.com/Simonjay85/surgeindex/actions/runs/32852663180/artifacts/9564913211) records PostgreSQL 17.11, disposable guard `PASS`, path `0000 -> 0013`, and `14` journal rows. | Re-run for each release SHA. |
| Batch 6 migration upgrade | `PASS` | The same artifact records baseline `11`, then `0011 -> 0012 -> 0013`, ending at `14`. | Re-run for each release SHA. |
| Typecheck | `PASS` | The sanitized launch artifact records `pnpm typecheck` `PASS` across all 14 workspace packages. | Re-run for each release SHA. |
| Lint | `PASS` | The sanitized launch artifact records `pnpm lint` `PASS`. | Re-run for each release SHA. |
| Unit tests | `PASS` | The sanitized launch artifact records `pnpm test` `PASS`; database/analytics infrastructure tests remain explicitly skipped where no separate database fixture is required. | Re-run for each release SHA and keep skipped suites labeled. |
| Build | `PASS` | The sanitized launch artifact records `pnpm build` `PASS`, 66 pages, and 13 production job artifacts. | Re-run for each release SHA. |
| E2E | `PASS` | The sanitized launch artifact records `pnpm test:e2e` `PASS`: 4 Chromium tests in 22.3 seconds. This remains demo/browser evidence, not production auth/provider proof. | Re-run for each release SHA; complete external smoke separately. |

Successful CI runs upload sanitized `launch-readiness-evidence` and
`migration-evidence` artifacts. They contain no database URLs, passwords,
provider tokens, webhook secrets, OAuth credentials, or encryption keys.

## Branch protection

| Gate | Result | Evidence / read-back | External action required |
| --- | --- | --- | --- |
| Branch protection for `fix/launch-readiness` | `PASS` | GitHub API read-back confirms PR review required, 1 approval, stale-approval dismissal, strict status checks `checks`/`migrations`, enforced admins, `allow_force_pushes=false`, and `allow_deletions=false`. | Re-read after any repository-settings change; no code-side action remains. |

Required settings:

- Pull request required before merge.
- At least one approving review.
- Stale approvals dismissed after new pushes.
- Required status checks: `checks` and `migrations`.
- Require the branch to be up to date before merging (`strict: true`).
- Force pushes disabled.
- Branch deletion disabled.

Safe read-back/configuration commands for an operator with approved GitHub
access are:

```bash
gh api repos/Simonjay85/surgeindex/branches/fix%2Flaunch-readiness/protection
```

If API access is unavailable, the exact required settings remain `PENDING
EXTERNAL ACTION`; do not mark this gate `PASS` from local Git state.

## Authentication and transactional email

| Gate | Result | Evidence / read-back | External action required |
| --- | --- | --- | --- |
| Turnstile | `PENDING` | Production configuration requires real Turnstile, expected hostname, and action checks. Fixture tokens are not evidence. | Run the real hostname/action smoke and record safe request IDs. |
| Transactional email | `PENDING` | Production rejects disabled/console delivery; provider response and mailbox timestamps are not yet attached. | Use an approved provider sandbox or production mailbox and archive receipt timestamps without message tokens. |
| Auth flow | `PENDING` | See `docs/AUTH_PRODUCTION_SMOKE.md` and `EXTERNAL_SMOKE_TEST_CHECKLIST.md`. | Execute signup, verification, resend, pre/post-verification login, reset, replay/expiry/invalid-token, rate-limit, and non-enumeration checks. |

The auth gate must cover, using real Turnstile and the correct hostname:

- signup;
- email verification;
- resend verification;
- login rejection before verification;
- login success after verification;
- forgot password;
- password reset;
- used-token rejection;
- expired-token rejection;
- invalid-token rejection;
- mailbox receipt timestamps;
- rate limiting; and
- a non-enumerating reset response.

Existing fail-closed production behavior is preserved. No fake mailbox,
Turnstile, or token evidence may be added to this manifest.

## Tracker staging and ranking pipeline

| Gate | Result | Evidence / read-back | External action required |
| --- | --- | --- | --- |
| Tracker staging | `PENDING` | `scripts/staging-readback.mjs` is read-only and reports health/admin projections without printing credentials. | Install a real staging tracker key on a controlled page and attach safe event/request IDs. |
| Tracker chain | `PENDING` | Required chain: tracker JS -> collector -> fraud decision -> active session -> aggregation -> scoring -> ranking -> breakout -> `system_job_run` -> freshness/readiness. | Read back each stage from the same controlled event window. |
| Traffic-lane separation | `PENDING` | Tracker traffic must remain distinct from GA4, `paid_surgedindex_referral`, and demo traffic. | Compare source/origin fields and organic score inputs in staging. |

Suggested read-only probe:

```bash
STAGING_BASE_URL='https://<approved-staging-host>' \
STAGING_READBACK_EVIDENCE_FILE='output/staging-readback.json' \
pnpm staging:readback
```

When an approved admin session is available, pass it through the environment
secret manager as `STAGING_ADMIN_COOKIE`; the script never prints or persists
that value. A successful health endpoint is not by itself tracker pipeline
proof.

## GA4

| Gate | Result | Evidence / read-back | External action required |
| --- | --- | --- | --- |
| GA4 provider integration | `PENDING` | `pnpm ga4:fixture` is deterministic fixture evidence only. No Google credential/property is asserted here. | Supply approved Google OAuth credentials and a property whose domain matches the claimed site. |
| OAuth and token handling | `PENDING` | Encrypted token persistence is implemented; plaintext tokens must never enter evidence. | Exercise connect, callback, encrypted persistence, refresh, disconnect, reconnect, and revoke. |
| GA4 reports and freshness | `PENDING` | Core, Realtime, bounded backfill, quota/error state, and job freshness require provider read-back. | Attach safe sync-run, freshness, quota, and provider-error references. |
| Tracker vs GA4 distinction | `PENDING` | Tracker Online Now must not be labeled or counted as GA4 Realtime. | Verify labels and source fields in the staging/production UI and database projection. |

No Google credential means the GA4 gates remain `PENDING`.

## Stripe test mode and Boost

| Gate | Result | Evidence / read-back | External action required |
| --- | --- | --- | --- |
| Stripe test mode | `PENDING` | Keep `STRIPE_TEST_MODE_REQUIRED=true`; use only `sk_test_`; the local signed fixture is not Stripe proof. | Exercise a real Checkout Session, signed webhook, and database read-back. |
| Stripe event lifecycle | `PENDING` | Required: async success/failure, expired checkout, duplicate/out-of-order events, inventory loss, partial/full refund, dispute created/closed, failed-webhook replay, and idempotency. | Attach safe Stripe event IDs and internal request/read-back references. |
| Boost | `PENDING` | `BOOST_LIVE_MODE_ENABLED=false`; no live billing or live Boost enablement is authorized by this task. | Approve each placement only after external test-mode delivery and organic-separation read-back. |
| Organic separation | `PENDING` | Paid traffic must not affect organic visitors, Heat Score, baselines, rankings, or breakouts. | Compare controlled staging results with and without a paid campaign. |

The legacy `/api/stripe/webhook` route must remain disabled/410 if that is the
intended compatibility behavior. Never use `sk_live_` and never commit Stripe
or webhook secrets.

## Backup and restore

| Gate | Result | Evidence / read-back | External action required |
| --- | --- | --- | --- |
| Backup | `PENDING` | `BACKUP_RESTORE_RUNBOOK.md` and `deploy/vps/surgeindex-postgres-backup*` support custom-format dump, local retention, age encryption, S3-compatible off-site upload, and verification. | Run on the approved VPS; record timestamp, size, upload result, and verification result. |
| Restore drill | `PENDING` | Restore must target a newly named disposable database; run `pg_restore --list`, forward migrations, and readiness. | Record start/end, duration, database size, migration count, readiness, and missing extension/role requirements. |
| RPO/RTO | `PENDING` | No RPO/RTO is invented in the repository. | Obtain owner-approved RPO/RTO targets and record them in the release ticket. |

## VPS, Nginx, systemd, firewall, and health

| Gate | Result | Evidence / read-back | External action required |
| --- | --- | --- | --- |
| VPS installation | `PENDING` | `deploy/vps` assets and the read-only `scripts/vps-readiness.sh` probe are present. | Install through the production runbook and attach host evidence. |
| Nginx | `PENDING` | Required: `nginx -t`, effective `nginx -T`, canonical host, proxy headers, and route checks. | Run on the actual VPS; do not treat source config inspection as a live pass. |
| systemd | `PENDING` | Required: app service, all SurgeIndex timers, freshness, failure behavior, journal evidence, and restart. | Enable/check units and attach safe unit state/journal references. |
| Firewall | `PENDING` | Required: UFW and nftables read-back; no firewall mutation is performed by the readiness probe. | Verify actual rules and loopback-only PostgreSQL exposure. |
| Health/readiness | `PENDING` | Required endpoints: `/api/health/live`, `/api/health/ready`, `/api/admin/jobs/health`; readiness must expose only safe projections. | Call on the release host and attach status/migration/job-freshness evidence. |
| Disk and backup timers | `PENDING` | Disk headroom and local/off-site/verification timers must be checked together. | Record numeric headroom and timer/journal results. |

Run the probe in read-only mode:

```bash
scripts/vps-readiness.sh --evidence-file /tmp/surgeindex-vps-readiness.txt
```

The script does not install packages, reload Nginx, change UFW/nftables, alter
systemd, restart the application, or touch a database.

## Legal, privacy, advertising, and payment-provider review

| Gate | Result | Evidence / read-back | External action required |
| --- | --- | --- | --- |
| Legal/privacy review | `PENDING` | Review `/privacy`, `/terms`, `docs/PRIVACY_DATA_FLOW.md`, and `docs/COMMERCIAL_LAUNCH_CHECKLIST.md`. The pages explicitly state that professional review is still required. | Obtain professional/legal approval for the target jurisdictions. |
| Advertising review | `PENDING` | Boost documentation separates Sponsored delivery from organic ranking; final prohibited-ad and disclosure review is not complete. | Approve sponsored disclosure, attribution, prohibited categories, and creative review. |
| Payment-provider review | `PENDING` | Stripe test-mode implementation and ledger controls exist; tax, refund, dispute, processor, and account review are not external evidence yet. | Obtain provider, tax, refund, and dispute approval before paid launch. |

The commercial checklist must cover Privacy Policy, Terms of Service,
Acceptable Use Policy, tracker disclosure, cookies/local storage/identifier
disclosure, retention, deletion, GA4 disclosure, OAuth data handling,
sponsored-content disclosure, ad attribution, refund policy, underdelivery,
dispute handling, Stripe processor disclosure, taxes, prohibited advertising,
and jurisdiction-specific review.

## Launch states

### `PUBLIC_FREE`

This state may be considered only when the public directory/ranking/auth/
tracker infrastructure gates have real evidence. Stripe, live Boost billing,
and GA4 may remain disabled. `PUBLIC_FREE` never authorizes
`BOOST_LIVE_MODE_ENABLED=true` or live Stripe keys.

### `COMMERCIAL`

This state requires real Stripe acceptance, advertising review,
payment-provider review, legal review, backup/restore evidence, and full
production readiness. It cannot be inferred from a passing build, fixture, or
local browser run.

## Commit identity

Before creating a production release commit, configure an attributable Git
identity for the repository and verify it with:

```bash
git config user.name '<approved human or service identity>'
git config user.email '<approved repository email>'
git var GIT_AUTHOR_IDENT
git var GIT_COMMITTER_IDENT
```

For this working branch, the local repository identity was set from the
authenticated `Simonjay85` GitHub account as
`Simonjay85 <103453259+Simonjay85@users.noreply.github.com>`. Re-verify it
before a production release; use a different approved identity if the release
owner requires one.

The branch history contains a placeholder identity (`Your Name`
`you@example.com`) in an existing commit. Do not rewrite published history
automatically; resolve attribution with the release owner before a final
production commit.

## Final decision

| Gate | Result | Evidence | External action required |
| --- | --- | --- | --- |
| Final GO/NO-GO | `NO-GO` | Any unresolved `PENDING`/`BLOCKED` external gate prevents commercial launch. Current manifest is an evidence template until the exact SHA and CI/provider/host read-backs are attached. | Release owner updates every gate, then selects `NO-GO`, `PUBLIC_FREE READY`, or `COMMERCIAL READY`. |

Current classification: **`NO-GO`**.

`COMMERCIAL READY` is valid only when every commercial gate above is `PASS`
with current evidence. `PUBLIC_FREE READY` is valid only when its explicitly
scoped core gates are `PASS` and all paid/provider gates remain disabled and
documented as `PENDING`, `BLOCKED`, or otherwise not enabled.
