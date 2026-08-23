# Boost product rules

Boost is a prepaid, one-time sponsored-distribution product. The rule is: **earn the rank, buy the reach**.

## Non-negotiable boundaries

- Budget, Stripe amounts, paid impressions, sponsored clicks, CTR, payment state, refunds, placement, and campaign age are never inputs to Heat Score, organic rank, breakout state, or organic eligibility.
- Every paid unit is labeled `Sponsored`, `Boosted`, or `Paid placement` and remains visually separate from the organic board.
- A client redirect, success query parameter, or client-provided campaign status cannot activate a campaign. Activation requires server-side Stripe state validation and an idempotent webhook/event ledger.
- A rendered card is not a qualified impression. A click is not a visit. A confirmed attributed visit requires the destination tracker.
- Demo delivery is labeled and cannot run as production delivery. Production never fabricates impressions to meet a package target.

## V1 placements and packages

V1 placements are `homepage_boosted`, `category_boosted`, `ranking_feed_insert`, `site_profile_recommendation`, and `breakout_sponsor`. Packages are Starter, Growth, Launch, and an inactive Custom quote path. Amounts, targets, currency, eligibility, and duration are server-owned. The campaign stores a package snapshot so later configuration changes do not rewrite history.

Boost sells qualified sponsored impressions, not clicks, leads, sales, conversions, rank movement, verification, or editorial endorsement.

Before live commercial launch, pricing, tax, acceptable-use, refund, advertising, and legal terms require professional review.
