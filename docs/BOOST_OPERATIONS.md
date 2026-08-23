# Boost operations

The admin operations surface is intended to expose draft/review queues, reservations, pending/processing payments, active campaigns, pacing risk, underdelivery, refund requests, disputes, invalid-impression rates, fraud health, environment-separated revenue, and webhook health. Admin actions require admin authorization, a reason, request ID, and audit row. Admin cannot edit organic Heat Score or rank.

Scheduled seams are provided by:

- `pnpm boost:release-reservations`
- `pnpm boost:reconcile-payments`
- `pnpm boost:pace`
- `pnpm boost:aggregate`
- `pnpm boost:complete` / `pnpm boost:underdelivery` when deployment schedulers are wired
- `pnpm stripe:replay-event --event=<id>` for an authenticated provider reconciliation workflow

The local commands are batchable and idempotent at their ledger boundaries. Demo mode prints an explicit disabled result; it does not mutate production-like delivery. Production scheduler, queue, alert sink, and secret-manager wiring remain deployment work.

Operational logs should include campaign, placement, target, qualified delivered, remaining, pacing state, expected/actual progress, delivery time, event ID, request ID, status, duration, and error code. Never log card details, Stripe secrets, raw IPs, attribution secrets, or tokens.
