# Boost clicks and attribution

The sponsored card links to `/go/[siteSlug]?campaign=<opaque-token>`. The token is signed, short-lived, site/campaign/visitor-bound, and contains the server-approved destination. The route validates the active campaign and canonical destination before redirecting. It never accepts an arbitrary URL and sets `Cache-Control: no-store`.

The funnel is:

```text
qualified impression -> sponsored click -> tracker-confirmed landing visit -> tracker-confirmed engaged visit
```

Paid clicks are recorded as `paid_surgedindex_referral` and are separate from `organic_surgedindex_referral`. The attribution token is created only for a valid redirect event. The destination tracker must present the token and bind the landing event to the click/site; otherwise the report says `Landing attribution unavailable` rather than estimating a visit.

Paid tracker events are stored with campaign/source metadata but are excluded from organic visitor, pageview, active-session, referral, baseline, and scoring aggregates. This prevents paid referral spend from inflating organic rank.
