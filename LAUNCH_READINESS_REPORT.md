# SurgeIndex launch-readiness report

Date: 2026-08-25 (Asia/Ho_Chi_Minh)

Branch: `fix/launch-readiness`

Release classification: **`NO-GO / staged verification`**

## Executive decision

Repository-side launch-readiness work is implemented on the target branch:

- GitHub Actions uses disposable PostgreSQL 17 services and exposes both
  `checks` and `migrations` jobs.
- Manual workflow dispatch and sanitized `launch-readiness-evidence` /
  `migration-evidence` artifacts are configured.
- Migration smoke now exercises fresh `0000 -> 0013` and the Batch 6
  `0000 -> 0010 -> 0011 -> 0012 -> 0013` upgrade path, with loopback/name/
  explicit-disposable guards before every schema reset.
- `RELEASE_EVIDENCE.md` is the authoritative gate manifest.
- Read-only staging and VPS diagnostic probes are available.
- The final review run [32853144126](https://github.com/Simonjay85/surgeindex/actions/runs/32853144126)
  passed both required jobs on PostgreSQL 17; its head SHA is
  `8afa8ec7bd57bd15e28572a4dbec20875d20d90b`.
- Authentication, backup/restore, legal/commercial, tracker, GA4, Stripe, and
  Boost procedures are documented without fabricating external evidence.

This is not a commercial launch approval. Real Turnstile/email, staging
tracker, Google, Stripe, VPS, backup/restore, legal, advertising, and
payment-provider evidence remains external to this repository run. Live Stripe
and live Boost remain disabled.

## Scope and safety boundary

The V1 product boundary is the public directory/search/categories/rankings/
profiles, email/password authentication and recovery, submissions/moderation,
ownership verification, first-party tracker and ranking jobs, optional GA4,
badges, Boost delivery, Stripe test-mode ledger/webhooks, and protected
operations health. Future creator, Fanward, campaign, auction, and public API
modules remain disabled.

Organic traffic/ranking, tracker traffic, GA4 traffic, paid Boost delivery,
SurgeIndex referral traffic, and demo data remain separate lanes. This report
does not treat a fixture, local UI, source inspection, or a successful command
as production evidence.

The worktree also contains unrelated concurrent Radar changes plus a
pre-existing modification in `packages/boost/src/state-machine.ts`. They are
preserved and are not part of this launch-readiness PR.

## Repository-side implementation evidence

| Area | Repository result | Evidence |
| --- | --- | --- |
| Workflow | Implemented | `.github/workflows/launch-readiness.yml` has `checks`, `migrations`, PostgreSQL 17, `workflow_dispatch`, and artifact upload steps. |
| Migration guard | Implemented | `scripts/migration-smoke.ts` requires a named loopback disposable target, `RELEASE_DB_SMOKE_DISPOSABLE=YES`, and verifies connected identity before reset. |
| CI evidence | PASS | [Run 32853144126](https://github.com/Simonjay85/surgeindex/actions/runs/32853144126) passed `checks` and `migrations`; [launch-readiness-evidence](https://github.com/Simonjay85/surgeindex/actions/runs/32853144126/artifacts/9565207467) and [migration-evidence](https://github.com/Simonjay85/surgeindex/actions/runs/32853144126/artifacts/9565096190) were uploaded. |
| Release manifest | Implemented | `RELEASE_EVIDENCE.md` contains the authoritative gate states, branch-protection instructions, launch-state rules, and final decision boundary. |
| Auth smoke | Implemented | `docs/AUTH_PRODUCTION_SMOKE.md` covers real Turnstile, hostname/action checks, mailbox timestamps, verification, resend, reset token cases, rate limits, and non-enumeration. |
| Tracker staging read-back | Implemented | `scripts/staging-readback.mjs` is read-only, redacts sensitive projections, and refuses to infer the event chain from health alone. |
| VPS readiness | Implemented | `scripts/vps-readiness.sh` is read-only by default and does not install, restart, reload, or alter firewall/database state. |
| Commercial review | Implemented | `docs/COMMERCIAL_LAUNCH_CHECKLIST.md` covers privacy, terms, AUP, tracker/GA4/OAuth, sponsored advertising, refunds, underdelivery, disputes, Stripe, taxes, and jurisdiction review. |

## Validation evidence for this release SHA

The following table records the current successful run and its artifacts.
`PASS` means the command actually ran and completed; it does not override an
external gate in `RELEASE_EVIDENCE.md`.

| Check | Result | Evidence / boundary |
| --- | --- | --- |
| `pnpm install --frozen-lockfile` | `PASS` | Completed with pnpm 11.22.0; lockfile was already current. |
| `pnpm typecheck` | `PASS` | Completed across all 14 workspace packages. |
| `pnpm lint` | `PASS` | ESLint completed with no errors. |
| `pnpm test` | `PASS` | 30 web tests plus workspace suites passed; the existing DB/analytics suites remained explicitly skipped without PostgreSQL. |
| `pnpm security:scan` | `PASS` | 485 tracked files checked in CI; no high-risk credential patterns found. Static scan only. |
| `pnpm boost:placement-check` | `PASS` | Five V1 placements mapped to public routes with server-side context and kill switches. No live delivery proof. |
| `pnpm jobs:build` | `PASS` | 13 production job artifacts built. |
| `pnpm jobs:smoke` | `PASS` | 13 bundled entrypoints started in disabled demo mode. |
| `pnpm db:smoke` fresh path | `PASS` | [Run 32853144126](https://github.com/Simonjay85/surgeindex/actions/runs/32853144126) used PostgreSQL 17.11 and applied 14 migrations (`0000 -> 0013`) to a disposable CI database. |
| `pnpm db:smoke` Batch 6 upgrade | `PASS` | The same run applied baseline 11 migrations, then `0011 -> 0012 -> 0013`, ending at 14; evidence artifact records both counts. |
| `pnpm build` | `PASS` | CI demo production-shaped build generated 66 pages and 13 job artifacts; no deploy claim. |
| `pnpm test:e2e` | `PASS` | CI Chromium demo E2E passed all 4 tests in 22.3s; production auth/provider flows remain external. |
| Git diff check | `PASS` | `git diff --check` completed in the aggregate launch-check wrapper. |

## External gate status

All external statuses are intentionally non-PASS until current read-back is
attached. The complete manifest is in `RELEASE_EVIDENCE.md`.

| Gate | Result | Current boundary |
| --- | --- | --- |
| Branch protection | `PASS` | GitHub API read-back confirmed PR review, one approval, stale dismissal, strict `checks`/`migrations`, no force pushes, and no deletion. |
| Turnstile | `PENDING` | No real hostname/action verification attached. |
| Transactional email | `PENDING` | No real mailbox receipt timestamps attached. |
| Authentication flow | `PENDING` | External signup/verification/reset/rate-limit run required. |
| Tracker staging | `PENDING` | No real controlled-page event chain/read-back attached. |
| GA4 | `PENDING` | No Google credential/property evidence attached. |
| Stripe test mode | `PENDING` | Local HMAC fixture is not a Stripe Checkout/webhook run. |
| Boost | `PENDING` | Live Boost remains disabled; placement delivery requires external test evidence. |
| Backup | `PENDING` | No VPS/off-site backup upload evidence attached. |
| Restore drill | `PENDING` | No disposable restore duration/readiness evidence attached. |
| VPS / Nginx / systemd / firewall | `PENDING` | No actual host read-back attached. |
| Health/readiness/job freshness | `PENDING` | Local code paths exist; release-host and timer evidence required. |
| Legal/privacy | `PENDING` | Professional review remains required. |
| Advertising review | `PENDING` | Sponsored content/prohibited advertising approval remains required. |
| Payment-provider review | `PENDING` | Stripe/tax/refund/dispute/provider approval remains required. |

## Public-free versus commercial launch

`PUBLIC_FREE` can be considered only after the core directory/ranking/auth/
tracker evidence is real and the following remain disabled: live Stripe, live
Boost billing, and GA4 if it has not passed its provider gate. `PUBLIC_FREE`
never authorizes `BOOST_LIVE_MODE_ENABLED=true`.

`COMMERCIAL` requires every commercial gate to have current evidence:
Stripe acceptance, advertising review, payment-provider review, legal review,
backup/restore evidence, and full production readiness. A passing local build
or fixture does not satisfy that state.

## Commit identity boundary

Before any final production release commit, verify an attributable Git identity
with `git var GIT_AUTHOR_IDENT` and `git var GIT_COMMITTER_IDENT`. The existing
branch history includes a placeholder identity (`Your Name` /
`you@example.com`). This working branch now uses the authenticated GitHub
account identity `Simonjay85 <103453259+Simonjay85@users.noreply.github.com>`
for new commits; verify it before production publication and do not rewrite
published history automatically.

## Final report table

| Gate | Result | Evidence | External action required |
| --- | --- | --- | --- |
| Repository-side launch-readiness implementation | `PASS` | Workflow, guarded migration paths, evidence scripts, manifest, checklists, and read-only probes are present in the target branch. | Keep the PR review gate satisfied; do not merge without explicit release approval. |
| PostgreSQL 17 fresh migration | `PASS` | [Run 32853144126](https://github.com/Simonjay85/surgeindex/actions/runs/32853144126), `migrations` job, PostgreSQL 17.11, 14 final journal rows, path `0000 -> 0013`. | Re-run for each release SHA. |
| PostgreSQL 17 Batch 6 upgrade | `PASS` | The same `migration-evidence` artifact records baseline 11 and final 14, path `0000 -> 0010; 0011 -> 0012 -> 0013`. | Re-run for each release SHA. |
| Typecheck / lint / tests / build / E2E | `PASS` | The same CI run passed typecheck, lint, unit/tracker tests, demo build, and all 4 Chromium E2E tests; production auth/provider flows remain external. | Archive the final-SHA CI evidence; do not infer external provider readiness. |
| Branch protection | `PASS` | GitHub API read-back confirmed the requested protection settings on `fix/launch-readiness`. | Re-read after any settings change. |
| Turnstile / transactional email / auth | `PENDING` | Real provider, mailbox, hostname, token-case, and rate-limit evidence absent. | Execute `docs/AUTH_PRODUCTION_SMOKE.md`. |
| Tracker staging and ranking chain | `PENDING` | No controlled real tracker event chain is attached. | Install the staging key and read back every stage through freshness. |
| GA4 | `PENDING` | No Google OAuth/property credential evidence is attached. | Complete connect, callback, encrypted persistence, reports, backfill, refresh, disconnect, reconnect, revoke, and quota/error checks. |
| Stripe / Boost | `PENDING` | Local signed fixture only; live modes remain disabled. | Complete real test Checkout/webhook/refund/dispute/replay/idempotency and paid/organic separation checks. |
| Backup / restore | `PENDING` | No host backup upload or disposable restore evidence is attached. | Execute runbook and record timestamp, size, upload, verification, duration, count, and readiness. |
| VPS / Nginx / systemd / firewall / health | `PENDING` | No actual VPS read-back is attached. | Run `scripts/vps-readiness.sh` plus the required restart/failure/journal checks. |
| Legal / advertising / payment-provider review | `PENDING` | Repository documentation is not professional approval. | Complete `docs/COMMERCIAL_LAUNCH_CHECKLIST.md` with owner approvals. |
| Final launch status | `NO-GO` | Unresolved external gates prevent commercial launch. | Choose `NO-GO`, `PUBLIC_FREE READY`, or `COMMERCIAL READY` only after evidence review. |
