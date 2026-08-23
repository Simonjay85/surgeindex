# Scoring operations

The admin scoring page is `/admin/scoring`. It displays score version, state/league/breakout/freshness distributions, recent job runs, durations, and failure counts.

Allowed operator actions are recomputation, baseline rebuild, and breakout re-evaluation through protected endpoints. They recompute evidence; they cannot type an arbitrary organic score. Requests require an admin session, same-origin mutation protection, a reason where the surrounding admin workflow requires it, and a request ID in the response.

Public score explanations expose version, state, freshness, confidence, baseline method/sample information, component contributions, lift, penalties at a safe label level, and reason codes. Raw abuse thresholds, raw IPs, raw browser identifiers, provider tokens, and private event payloads are not exposed.
