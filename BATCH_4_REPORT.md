# Batch 4 report — Heat Score, Ranking Engine & Breakout Detection

## Scope

- Branch: `feat/surgeindex-ranking-engine`
- Base: Batch 3 commit `c563e1a`
- Merge/push: not performed
- Score version: `heat-v1`
- External Cloudflare/Tinybird credentials: not available in this local run; no live staging claim

## Delivered

- Deterministic Heat Score with weights 35/25/20/10/10, raw/smoothed/displayed values, explicit states, freshness, confidence, penalties, reason codes, and score components.
- Robust baseline selection using same weekday/hour, same hour, rolling recent fallback, median/MAD, persisted baseline buckets, and no fabricated baseline for new sites.
- Organic ranking with global, new, breakout, league, category, and category-and-league scopes; deterministic tie-breaking; rank movement from snapshots; transactionally published current rankings.
- New/emerging/established league logic with hysteresis inputs and explicit provisional/building-baseline behavior.
- Rule-based breakout state machine with relative and absolute lift, live support, persistence, entry/exit hysteresis, cooldown, transitions, evidence, and deduplicated activity events.
- Migrations for scoring configs, baselines, buckets, scores, components, current rankings, breakout events/transitions, job runs, freshness/state fields, and snapshot evidence.
- Local jobs, safe recompute/backfill commands, protected internal runner, admin scoring health/recompute endpoints, and public score explanation endpoint.
- Public provider reads precomputed current ranking rows and exposes score state, freshness, confidence, league, breakout state, and persisted explanation metadata.
- Public UI updates for leaderboard cards, ranking rows, site score explanation, methodology, breakout sections, and admin scoring operations.
- Deterministic A–L evaluation fixtures plus local performance timings for 100 and 1,000 synthetic sites.

## Formula and ranking contract

Growth is controlled by relative lift, absolute lift, and base support. Volume is log-normalized. Missing engagement is explicit. Suspected/invalid/fraud-review traffic cannot create a public breakout. Paid boosts never enter score or rank.

Ranking comparator: displayed score → smoothed score → confidence → accepted visitors → calculation time → domain → site ID. Global scope accepts eligible candidates; early-stage records remain labeled in appropriate New/league views.

Baseline job runs hourly; score and breakout jobs use five-minute slots; ranking publication uses fifteen-minute slots. Job keys make repeated delivery idempotent. Current ranking publication is one transaction.

## Validation evidence

The Batch 3 gate passed before Batch 4 changes:

- `pnpm test`
- `pnpm typecheck`
- Temporary PostgreSQL 16 migration plus `RUN_DB_TESTS=1 APP_MODE=production DATA_PROVIDER=postgres DB_DRIVER=pg` DB, analytics, and web integration tests

Batch 4 domain validation:

- `pnpm -F @surge/scoring test` — 4 files, 28 tests passed
- `pnpm -F @surge/scoring typecheck` — passed
- `pnpm -F @surge/db typecheck` — passed
- `pnpm typecheck` — all workspace packages passed
- `pnpm lint` — passed
- `pnpm test` — passed; web default suite 8 passed / 2 DB-gated skipped, scoring 28 passed
- PostgreSQL 16 migration smoke with `DATABASE_URL_UNPOOLED` set — migrations applied; DB, analytics, and web integration suites passed (web 9 passed)
- Batch 4 scoring pipeline integration test — 1 passed: baseline → score/components → breakout watch → rank/snapshot → persistent breakout → idempotent rerun
- `pnpm build` — passed; Next route manifest includes public score, internal scoring runner, admin health/recompute, and `/admin/scoring`
- `pnpm test:e2e` — 3 Playwright specs passed against an isolated demo dev build (`.next-e2e`) while preserving any existing workspace dev server
- `pnpm ranking:evaluate` — generated `output/scoring-evaluation.json` and `output/scoring-evaluation.md`

The evaluation report currently records local synthetic timings for 100 and 1,000 sites. These are process timings only, not PostgreSQL, Cloudflare, Tinybird, or production-scale claims.

## Migrations and operations

Generated migrations: `0004_familiar_glorian.sql` and `0005_sparkling_zemo.sql`. The latter captures final scoring job/current-score columns added during implementation. Public routes do not trigger global recomputation.

## Known limitations / P2

- Cloudflare Cron, KV cache refresh, and real Tinybird reads were not exercised because staging credentials/domain were not present.
- The local backfill runner validates date/site/batch/dry-run inputs and is resume-safe, but a future batch can add a dedicated historical date cursor for very large archives.
- Public breakout history currently emphasizes active/cooling persisted events; a resolved-history browser can be expanded without changing the event model.
- E2E uses a dedicated local `.next-e2e` dist directory to avoid lock contention; no production-live status is implied by this report.

## Explicitly out of scope

GA4 production onboarding, Stripe production payments, creator rankings, campaigns, auctions, and predictive/scientific accuracy claims.
