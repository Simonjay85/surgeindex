# Batch 6 report — Boost delivery, Stripe Checkout, and transparent ad reporting

## Release status

- Branch: `feat/surgeindex-boost-stripe`
- Batch 5 accepted baseline: `d628487de533b49dba356a22ee31827305de3c9c`
- Implementation commit: `b252148e6df27d2c33883c17a80bdd1dbe01f974`
- Final report commit: the report-only follow-up is the final local `HEAD` reported in the handoff
- Merge/push: not performed
- Status: **Implementation complete — Stripe test-mode verification pending**

The implementation was built from the accepted Batch 5 baseline. No live Stripe key, live charge, real revenue, production advertising scale, guaranteed inventory, guaranteed click, conversion, or fraud-proof claim is made.

## Packages, placements, and server control

Starter, Growth, Launch, and inactive Custom are defined in server configuration. Package amount, currency, target, duration, eligibility, and Stripe Price ID are never trusted from the browser; a package snapshot is stored on each campaign/order. V1 placements are `homepage_boosted`, `category_boosted`, `ranking_feed_insert`, `site_profile_recommendation`, and `breakout_sponsor`.

## Inventory, state, and activation

Forecasting returns capacity/confidence/expiry. PostgreSQL advisory transaction locks protect overlapping reservations. Campaigns use an explicit state machine and immutable transition audit rows. A campaign is only paid/scheduled/active after server-side Checkout/payment validation. Success URLs cannot activate campaigns. Expired/failed attempts release holds and can be retried after reconciliation. Payment with lost capacity becomes an explicit inventory-review state.

## Stripe implementation

Checkout is server-created with one-time Price verification, environment metadata, server URLs, idempotency, environment-specific Customers, payment attempts, and no card storage. `/api/webhooks/stripe` reads raw body once, verifies the signature, deduplicates event IDs, and handles Checkout success/failure/expiration, async payment outcomes, PaymentIntent outcomes, refunds, and disputes. Refund requests validate the internal paid/refundable ledger and use Stripe idempotency.

Real Stripe test-mode Checkout and a real signed webhook were **not run**. `pnpm stripe:test-webhook` verifies a locally generated fixture signature only. Therefore the honest status is: **Stripe implementation complete; real Stripe test-mode verification pending**.

## Delivery and reporting

`GET /api/boost/serve` selects only eligible active campaigns and returns signed short-lived opportunity/click tokens. The browser qualifies an impression only after 50% visibility for 1 continuous second by default. Token replay, expiry, frequency caps, owner self-view, bots, and failed viewability do not count as billable delivery. Pacing defaults to even delivery.

Reports distinguish opportunities, rendered, qualified, invalid, clicks, valid/unique clicks, tracker-confirmed attributed visits, and engaged visits. CTR and cost metrics use valid non-zero denominators; unavailable attribution is shown as `Not available`. Paid redirects use `paid_surgedindex_referral`; organic referral attribution remains separate.

## Organic separation

Paid spend, paid impressions, sponsored clicks/CTR, campaign/payment/refund state, and placement never enter ranking or Heat Score inputs. Paid tracker events are persisted with origin/campaign metadata but excluded from organic visitors, pageviews, active sessions, referrals, baselines, and score recalculation. Public sponsored cards are visually separate and labeled on desktop/mobile. The regression contract is covered at the pure-domain and data-filter boundaries; no source sums tracker and paid values.

## Database migrations

Added/generated migration layers:

- `packages/db/drizzle/0008_ordinary_groot.sql`: placement/package catalog, campaign state/creative/transition, inventory windows/reservations, order/payment/Customer/Checkout/refund/dispute ledgers, signed opportunity/impression/click/attribution/frequency/delivery tables, webhook environment metadata, and paid-origin fields.
- `packages/db/drizzle/0009_foamy_sumo.sql`: attribution campaign/source links and tracker-event paid-origin/campaign links.
- `packages/db/drizzle/0010_windy_ultragirl.sql`: payment-attempt ledger for delayed/retried Checkout outcomes.

All currency fields are integer minor units. Foreign keys, unique event/order/session/environment constraints, request IDs, and audit timestamps are used. Migrations were generated and typechecked; no production database was modified in this run.

## UI, admin, and notices

Owner surfaces include `/dashboard/boosts`, `/dashboard/boosts/new`, `/dashboard/boosts/[campaignId]`, and `/dashboard/billing` support copy. Public homepage delivery uses a separate sponsored card with IntersectionObserver qualification and an explicit demo label. Terms, privacy, pricing, and methodology explain paid/organic separation, measurement, attribution limits, underdelivery/refunds, and professional-review requirements. Admin moderation/approve/reject/extend/refund/suspend routes use `requireApiAdmin`, Zod, same-origin checks, request IDs, and audit rows.

## Security controls

- HMAC-signed, expiring impression/click tokens with visitor/route/campaign binding
- token replay and event-ID deduplication
- anonymous rotating visitor hashes; raw IPs are not stored
- owner self-view exclusion, bot/headless checks, frequency caps, and suspicious-event classification
- canonical same-domain destination validation and no open redirect
- server-only Stripe secret/webhook handling and raw-body signature verification
- environment-separated Stripe Customers, sessions, payments, refunds, disputes, and webhook IDs
- admin authorization plus reason/request-ID audit trail

## Validation and external infrastructure

Fixture/contract commands executed or available:

- `pnpm typecheck` — pass
- `pnpm lint` — pass
- `pnpm test` — pass (97 passed, 2 intentionally skipped in the configured workspace suite)
- `pnpm build` — pass with `APP_MODE=demo DATA_PROVIDER=demo SURGEINDEX_NEXT_DIST_DIR=.next-batch6-final`; 58/58 static routes generated
- `pnpm test:e2e` — pass (3/3 Chromium scenarios)
- `pnpm boost:fixture` — pass; deterministic forecast, pacing, delivery/reporting, and unavailable-attribution fixture output
- `pnpm stripe:test-webhook` — pass for a locally generated HMAC fixture (`evt_fixture_batch6`); no network or charge
- `pnpm -F @surge/db generate` — pass; generated migration metadata is present and no production database was modified
- `git diff --check` — pass
- Demo-mode production job guards — pass; forecast, pacing, aggregation, completion, underdelivery, payment reconciliation, reservation release, and Stripe replay seams exit disabled without a production Postgres/provider

No Stripe CLI, Stripe test account, live charge, external Postgres, Cloudflare scheduler, or production delivery environment was used. The local HMAC fixture is not evidence of a real Stripe signed webhook.

## Known limitations and P2 issues

- Real Stripe test-mode Checkout, signed webhook forwarding, async-payment, refund, dispute, and test/live read-back remain pending.
- Production scheduler/queue/alerting and authenticated Stripe event replay need deployment wiring.
- Inventory forecasting is a bounded heuristic until production placement inventory history is calibrated.
- Admin dashboard is an initial protected operations view; campaign owners can download a scoped CSV aggregate report, while full queue replay/alerting remains deployment work.
- The paid card demo path is intentionally non-billable and does not prove production serving scale.
- Attribution remains unavailable when the destination has no active compatible tracker; the report does not estimate it.
- Legal, tax, advertising, refund, acceptable-use, pricing, and privacy terms require professional review before commercial launch.

## Launch blockers

Do not enable live keys or accept real payments until pricing/tax/refund policy is approved, terms/privacy are reviewed, inventory capacity and staging delivery are validated, signed webhook monitoring is active, admin refunds are tested, and explicit production launch approval is recorded.
