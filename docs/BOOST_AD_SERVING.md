# Boost ad serving

`GET /api/boost/serve` is the server-controlled selection boundary. The browser sends placement/category/route context; it cannot select an arbitrary campaign ID. Production selection considers only active, scheduled, approved, non-suspended campaigns with remaining delivery, matching placement/category, schedule, frequency cap, and pacing eligibility.

Selection is independent of organic Heat Score and rank. It is not a highest-bid auction and no organic score is used as a paid multiplier. The response contains sanitized creative and short-lived signed impression/click tokens. The destination is not client-controlled.

The public UI renders the response in a separate sponsored block. Cards say `Sponsored`, show a paid-placement explanation, and remain labeled on mobile. The response uses `Cache-Control: private, no-store` because a selection token is visitor- and route-bound.

## Pacing

V1 defaults to even pacing. Expected progress is derived from elapsed campaign time, target qualified impressions, start/end timestamps, and the configured overdelivery buffer. A campaign ahead of pace is temporarily ineligible; one behind pace receives more eligible share within remaining safe inventory. Pacing never creates synthetic events.
