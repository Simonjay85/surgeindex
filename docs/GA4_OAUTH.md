# GA4 OAuth and connection security

Batch 5 uses a server-side OAuth 2.0 authorization-code flow. The browser starts an authorization request, but Google tokens are exchanged, encrypted, refreshed, and revoked only by the server provider boundary.

## Scope contract

The only Analytics scope requested by the implementation is:

`https://www.googleapis.com/auth/analytics.readonly`

It is sufficient for Analytics Admin discovery, Core Data API reports, and Realtime Data API reports. Edit scopes are rejected if they appear in a token response. SurgeIndex does not create or modify properties, streams, events, key events, audiences, dimensions, metrics, or user bindings.

## Transaction sequence

1. The authenticated owner requests `POST /api/sites/{siteId}/ga4/connect`.
2. The server checks the existing SurgeIndex site-owner relationship, active site state, non-demo state, and safe return path.
3. The server creates a 32-byte random state and an S256 PKCE verifier/challenge.
4. Only the SHA-256 state hash and encrypted PKCE verifier are stored in `ga_oauth_transaction`. The raw state is returned only inside the authorization URL.
5. The transaction binds `user_id`, `site_id`, the validated return path, a ten-minute expiry, and a one-time completion timestamp.
6. Google redirects to the static configured callback `/api/ga4/callback`. The callback validates its origin/path against `GA4_OAUTH_REDIRECT_URI`, then looks up the transaction by the state hash.
7. The server verifies expiry and one-time use, decrypts the PKCE verifier with connection-specific associated data, and exchanges the code.
8. The granted scopes are checked for read-only Analytics access. A missing refresh token is handled explicitly: a prior refresh token may be retained during reconnection; otherwise the connection becomes `reauthorization_required`.
9. The server stores the encrypted credential and exposes only a property-selection state to the browser.

The legacy site-specific callback route remains available for the deterministic fixture path. A real Google OAuth client should register one exact callback per environment, never a wildcard:

- Local: `http://localhost:3000/api/ga4/callback`
- Staging: the exact staging origin plus `/api/ga4/callback`
- Production: the exact approved production origin plus `/api/ga4/callback`

The final host is supplied by deployment configuration; it is not hardcoded in the application.

## CSRF and account-link protection

The state hash is bound to both the site and the authenticated user through the transaction. A callback with the wrong site, expired state, reused state, invalid PKCE verifier, or missing transaction is rejected. Property and stream IDs submitted by the browser are treated as selectors only; the server re-reads them with the granted token before activation.

Google property access never grants SurgeIndex ownership. Ownership verification remains a separate authorization gate.

## Failure behavior

`access_denied`, invalid state, expired state, invalid grant, invalid scope, malformed provider responses, and token refresh failures produce safe internal error codes and actionable UI messages. Raw authorization codes, access tokens, refresh tokens, client secrets, and provider payloads are not returned or logged.
