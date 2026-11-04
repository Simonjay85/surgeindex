# SurgeIndex tracker installation

The first-party tracker is available only for an active, ownership-verified site. Ownership verification and traffic-source connection are separate states: a claimed site can still be waiting for its first accepted event.

## Generate and manage a key

Open the owner dashboard for the site and use the Tracker installation screen.

- Generate key creates an active public key and an audit/activity event.
- Rotate key revokes the previous key before activating a new version.
- Revoke key stops future collector acceptance for that public key.
- Only an authenticated owner or editor relation for a claimed site can perform these actions.
- Key mutations are same-origin protected and rate-limited.
- The public key is not a secret. It is scoped to the site and does not contain the internal site ID.

The tracker status is derived from accepted events:

| Status | Meaning |
| --- | --- |
| Not installed | No key exists for the site. |
| Waiting for first event | A key exists but no accepted event has arrived. |
| Connected | A valid event was accepted, but the last event is outside the fresh heartbeat window. |
| Active | A valid event arrived within the fresh window. |
| Stale | The key has not produced a valid event for the stale window. |
| Revoked | The key was explicitly revoked and cannot accept events. |
| Error | The dashboard could not read the authenticated tracker state. |

Test installation queries the persisted accepted event ledger for the current site and a recent time window. It never returns success because a browser button was clicked.

## Installation snippet

The generated snippet has this shape:

    <script defer src="https://cdn-staging.example.com/tracker.js" data-site="pk_live_REDACTED" data-collector="https://events-staging.example.com/v1/events"></script>

Use the actual URLs supplied by the dashboard. Do not replace the public key with a database ID and do not put the signing or hash secrets in a page.

### Plain HTML

Paste the snippet before the closing head tag on every page. Publish the site, open a real published page, and then run Test installation.

### Next.js

Use the snippet in app/layout.tsx or pages/_document.tsx. A next/script component with afterInteractive is acceptable. Keep the collector URL and public key in rendered public attributes only.

### WordPress

Add the snippet to the site header through a child theme or a trusted header-injection plugin. Do not paste it into post content. Clear page-cache and CDN cache before testing.

### Shopify

Open Online Store, Themes, Edit code, and theme.liquid. Paste before the closing head tag and test the published storefront rather than only the theme editor preview.

### Webflow

Open Project settings, Custom code, Head code. Paste the snippet, publish the project, and test the published domain.

### Google Tag Manager

Create a Custom HTML tag containing the snippet. Trigger it on All Pages, apply the same consent policy as the site, publish the container, and test the live site.

## Troubleshooting

- Waiting: confirm the snippet is in the published page source, the public key is current, and the collector URL is reachable.
- Disallowed origin: the browser origin must match the allowed domain stored with the key. CORS is not the authorization boundary.
- Stale: visible heartbeats stop while a page is hidden and the active session expires after the configured TTL.
- Revoked: generate or rotate a new key and replace the old page snippet.
- Test says no event: inspect the collector response and request ID; rejected or suspected events do not connect the source.

The development fixture is available at /dev/tracker-fixture only outside production. It loads the real built tracker, supports SPA navigation, consent, opt-out, and visibility checks, and displays anonymous IDs only for local test diagnostics.
