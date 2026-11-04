# Boost impression measurement

A server response creates an opportunity record and signs a short-lived token containing campaign, site, placement, creative version, visitor-context hash, route context, issue time, expiry, and a nonce. The token is HMAC-authenticated and stored only by hash in the opportunity ledger.

The client uses `IntersectionObserver`. The default qualification rule is at least 50% visible for at least 1 continuous second. It then posts the token, an event ID, visibility percentage, and visible milliseconds to `/api/boost/impressions`.

The server verifies the signature, expiry, visitor context, opportunity, campaign state/window, creative version, owner self-view policy, frequency cap, and event-id deduplication. Only `qualified` events increment billable delivery. `rendered`, `invalid`, `duplicate`, `suspected`, `viewability_failed`, `expired_token`, `frequency_capped`, and `owner_self_view` remain distinct operational classifications and do not consume package inventory.

Frequency caps use an anonymous first-party context hash with expiring records. Raw IP addresses are not stored. Owner self-view, bots, replayed tokens, expired tokens, suspended campaigns, and failed viewability are excluded from qualified delivery.
