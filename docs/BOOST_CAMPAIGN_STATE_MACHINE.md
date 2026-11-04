# Boost campaign state machine

The state machine is implemented in `packages/boost/src/state-machine.ts`; routes and webhooks call the domain transition service rather than setting a status directly.

```text
draft -> inventory_check -> inventory_reserved -> pending_payment
pending_payment -> payment_processing -> paid
paid -> scheduled -> active -> delivery_complete -> completed
active -> paused -> active
active/scheduled/paid -> cancel_requested -> cancelled or refund_pending
payment_failed / checkout_expired -> draft or cancelled
any paid delivery state -> disputed or suspended when policy permits
```

The implementation also represents `paid_pending_inventory_review`, `underdelivered`, `partially_refunded`, and `refunded` explicitly. Every transition stores previous state, new state, reason, actor, request ID, and timestamp in `boost_campaign_state_transition`. Legacy status is synchronized for older repository consumers.

Payment confirmation, activation, campaign completion, refund processing, reservation release, and webhook handling are idempotent. Invalid transitions return a structured conflict and never partially publish a campaign.
