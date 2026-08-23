# Refunds, disputes, cancellation, and underdelivery

Refunds are server-side admin actions with a validated refundable balance, integer minor-unit amount, idempotency key, internal refund row, Stripe refund ID, and webhook confirmation. Partial and full refunds are represented; a client cannot choose refund status or exceed the paid balance. Site owners may request support review but do not execute refunds directly in V1.

When a campaign ends, the system compares qualified delivery with the package target and configured tolerance. A shortfall becomes `underdelivered` rather than silently `completed`. Admin resolutions are explicit: extend, move placement, account credit, partial refund, full refund, or owner-consented acceptance. Each resolution stores reason, actor, consent where required, and date/amount changes.

Dispute creation marks the payment disputed, pauses active delivery, preserves order/Checkout/delivery/report/acceptance evidence, and alerts admin. Reactivation requires explicit review after dispute closure. Disconnecting or cancelling a campaign stops future delivery but preserves historical reporting; it does not falsely claim that Google/Stripe access was revoked.

Legal, tax, advertising, refund, acceptable-use, and consumer terms require professional review before live commercial launch.
