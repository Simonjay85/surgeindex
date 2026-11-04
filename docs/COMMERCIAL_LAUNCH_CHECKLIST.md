# Commercial launch checklist

This checklist is a release gate, not legal advice or a payment-provider
approval. Each item needs an owner, an approval/reference, and a current
`PASS`, `FAIL`, `BLOCKED`, or `PENDING` result. Do not mark a review complete
because the repository contains a draft page or because a fixture passed.

## Customer-facing documents

- [ ] Privacy Policy is reviewed and published for the target jurisdictions.
- [ ] Terms of Service are reviewed and published.
- [ ] Acceptable Use Policy is approved and published or explicitly included in
      the reviewed Terms.
- [ ] Tracker disclosure explains event fields, first-party identifiers,
      hashing, opt-out, Do Not Track behavior, and retention.
- [ ] Cookies, local storage, session identifiers, and anonymous visitor
      identifiers are disclosed with the applicable consent behavior.
- [ ] Retention periods and deletion workflow are approved and operational.
- [ ] GA4 disclosure explains OAuth scope, imported data, token storage,
      disconnect, revoke, and deletion behavior.
- [ ] Sponsored-content disclosure and ad labels are visible on every approved
      Boost placement on desktop and mobile.

## Commercial and advertising controls

- [ ] Ad attribution rules distinguish rendered, qualified, click, valid click,
      tracker-confirmed visit, and engaged visit.
- [ ] Prohibited advertising categories and creative/content review rules are
      approved.
- [ ] Domain/category/creative mismatch and misleading-claim handling are
      tested.
- [ ] Organic rank, Heat Score, breakout, and baseline inputs are proven
      unchanged by paid Boost traffic.
- [ ] Underdelivery policy covers extension, placement move, account credit,
      partial refund, full refund, and owner-consented acceptance.
- [ ] Dispute handling, campaign suspension, cancellation, and support
      escalation are staffed and tested.

## Payment and tax

- [ ] Stripe test-mode Checkout and signed webhook flow has real provider
      evidence, including duplicate/out-of-order/idempotent processing.
- [ ] Pricing, currency, package Price IDs, inventory reservation, and payment
      state are server-controlled and read back from the database.
- [ ] Refund policy covers partial/full refunds, underdelivery, cancellation,
      and dispute outcomes.
- [ ] Stripe processor disclosure and card-data boundary are reviewed.
- [ ] Tax collection/invoicing/registration responsibility is approved for the
      target jurisdictions.
- [ ] Payment-provider account, webhook endpoint, product/Price configuration,
      payout, dispute, and prohibited-business review are complete.
- [ ] `STRIPE_TEST_MODE_REQUIRED=true` remains enforced until an explicit
      separately approved live-mode release.

## Evidence and approval

| Area | Owner | Reference | Result |
| --- | --- | --- | --- |
| Privacy / data protection | | | `PENDING` |
| Terms / acceptable use | | | `PENDING` |
| Advertising / sponsored disclosure | | | `PENDING` |
| Refund / underdelivery / disputes | | | `PENDING` |
| Stripe / payment provider | | | `PENDING` |
| Tax | | | `PENDING` |
| Jurisdiction-specific review | | | `PENDING` |

Commercial launch is blocked while any required review is `PENDING`,
`BLOCKED`, or `FAIL`. A `PUBLIC_FREE` release must keep live Stripe, live
Boost, and optional GA4 disabled and must not be interpreted as commercial
approval.
