# Boost inventory and reservations

Forecasting combines the selected placement, category, date window, historical eligible pageviews, qualified viewability rate, frequency policy, existing active/reserved delivery, and a safety margin. It returns `available`, `limited`, `unavailable`, or `unknown` plus estimated opportunities, estimated qualified impressions, reserved impressions, available capacity, confidence, and an expiry timestamp.

Forecasts are estimates, not guarantees. Low-confidence output is shown as “Inventory estimate is limited.” The server ignores client-submitted price and impression quantities; the package target is authoritative.

## Reservation sequence

1. Validate the ownership-verified, active, non-suspended site.
2. Validate the server package and placement.
3. Forecast the requested window.
4. Acquire an advisory transaction lock for the placement/category/window.
5. Insert a held reservation and transition the campaign through `inventory_check` to `inventory_reserved`.
6. Create Checkout with the reservation/session identifiers.
7. Confirm the hold only after a verified paid webhook, or release it on Checkout expiration/failure.

The reservation has an expiry, status (`held`, `confirmed`, `released`, `expired`), campaign/window binding, and optional Checkout session ID. Cleanup is idempotent and does not silently discard a confirmed payment. If capacity changes after payment, the campaign enters `paid_pending_inventory_review` and requires an admin resolution.

## Oversell protection

PostgreSQL transaction locks serialize overlapping reservations. Duplicate owner requests reuse the active reservation/order where safe. Failed or expired attempts can be reopened only after the old hold and Checkout record are reconciled. No browser value can increase capacity.
