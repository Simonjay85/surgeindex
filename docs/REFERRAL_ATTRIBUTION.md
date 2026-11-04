# SurgeIndex referral attribution

The existing /go/{siteSlug} redirect remains the only outbound destination path. It resolves the site from the server-side repository and redirects only to the approved canonical domain.

## Flow

1. A user clicks a SurgeIndex listing.
2. SurgeIndex records an outbound click and click-quality decision.
3. For a valid click, the server creates a signed opaque token containing only the site binding, click ID, and expiry.
4. The token is appended as the _si_at query parameter to the approved destination while preserving that destination's existing query parameters.
5. The tracker reads the token on the landing page, sends it with the landing pageview, and removes only _si_at with history.replaceState. Other site query parameters remain intact.
6. The collector verifies the signature, site binding, and expiry, then stores only a keyed token hash plus the internal click linkage.
7. The event provider creates one attribution record for the landing event. A later engaged event marks the same attributed session engaged.

## Security and replay rules

- Tokens contain no personal information.
- The token is signed server-side and short-lived by ATTRIBUTION_TTL_MINUTES.
- A token is bound to one site and approved click.
- A token cannot be reused to create an unrelated session attribution.
- Invalid, expired, or replayed tokens do not affect public metrics.
- Full landing query strings are never persisted.
- The redirect does not accept a destination URL from the browser.

## Reporting

The dashboard separates outbound clicks, valid clicks, unique clicks, attributed visits, and attributed engaged visits. A redirect click alone is never reported as a visit. A visit requires an accepted destination tracker event.
