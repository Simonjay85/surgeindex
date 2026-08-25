# Security hardening report

## Request and identity boundaries

- `requestId()` accepts a bounded, safe caller ID or generates a UUID. JSON
  success and error responses return it in the body/header where applicable.
- Mutation routes use `assertSameOrigin()` and server-side Better Auth/session
  authorization. Admin routes use `requireApiAdmin()`; owner/editor routes
  check the site-owner relation server-side.
- `X-Forwarded-For` is never trusted by application code. The single shared
  `getTrustedClientIp()` implementation accepts a validated `X-Real-IP` only
  when an explicit proxy mode is configured; otherwise it returns `unknown`.
- Supplied Nginx vhosts overwrite X-Real-IP and clear XFF. The Cloudflare mode
  is documented as requiring an allowlist of current Cloudflare CIDRs before
  it may be enabled.
- Production rate limiting uses an atomic Postgres bucket keyed by a
  deployment-local SHA-256 digest; raw IPs and caller identifiers are not
  persisted. The process-local
  Map remains only for demo/development/test, where it is an intentional test
  adapter. Nginx adds a separate anonymous request limit to auth, submission,
  claim, waitlist, and tracker collection paths.

## SSRF and outbound fetch

The public metadata/claim fetcher now:

- resolves every A/AAAA answer and rejects any mixed private/public answer;
- blocks loopback, private, link-local, metadata, multicast, unspecified,
  documentation, carrier-grade, reserved, and mapped-private IPv4/IPv6 ranges;
- connects to the just-validated address while retaining Host and TLS SNI;
- follows redirects manually, re-resolves every hop, caps redirects, rejects
  credential-bearing URLs and HTTPS-to-HTTP downgrade;
- caps connection/total time, response bytes, and HTML content types; and
- fails closed when DNS, fetch, content, or metadata parsing is unsafe.

The SSRF fixture suite covers mixed answers, IPv4/IPv6 private ranges,
redirect-to-private, downgrade, pinned address/rebinding seam, content type,
declared and streamed response size, and a stalled response timeout. A real
network staging test remains separate evidence.

## Auth, anti-bot, and email

- Signup, submission, waitlist, claim start/verify, owner settings, password
  recovery, and verification resend have server-side Turnstile hooks or are
  authenticated. Production Turnstile is required when configured and checks
  success, expected action, and optional exact hostname; tokens are never
  logged or stored.
- Better Auth requires email verification in production. Password reset,
  verification resend, expiry/used-token handling, and transactional email
  callbacks are configured. Email delivery is an abstraction with disabled,
  console, and HTTP provider modes; production rejects disabled/console modes.
- Auth actions have durable rate limits and same-origin checks. The browser
  receives no provider credentials. The shared client-IP suite proves that
  changing X-Forwarded-For does not create a new limiter identity.

## Ownership and owner editing

- The V1 claim enum is exactly `meta_tag` and `dns_txt`. Tracker and GA4 remain
  traffic-source integrations, not ownership proof.
- Legacy unsupported claim rows are marked failed during migration rather than
  being treated as verified.
- Owner listing updates are limited to metadata, taxonomy, aliases, asset URLs,
  and two disclosure flags. Organic metrics, scores, rank, breakout,
  verification, and provider rows are not writable through the editor.
- PATCH input is strict Zod-validated, asset overrides require HTTPS, aliases
  are normalized as public domains, optimistic timestamps prevent lost updates,
  and each successful update writes an audit row with request ID.

## Payments, data, and secrets

- `/api/webhooks/stripe` is the only active Stripe webhook. The old
  `/api/stripe/webhook` path returns 410.
- Stripe verification uses the raw body and signature, checks event
  livemode/environment, deduplicates events, records safe status/error fields,
  and supports an explicit confirmed replay of failed records through the
  canonical processor.
- Stripe/Boost live mode remains disabled and test-mode-required. No live key,
  token, credential, dump, or private data was added to the repository.
- Revenue/page-metric disclosure defaults false and is controlled by the site
  owner setting. Provider payloads cannot opt a site into public disclosure.
- The production importer accepts only metadata and creates pending,
  non-demo sites. It rejects metric-like fields and requires an explicit apply
  confirmation in a production Postgres environment.
- Secret scanning is part of `launch:check`; environment examples contain
  empty placeholders, not credentials.

## Evidence still required

The code and deterministic tests do not prove provider credentials, real
mailbox delivery, Cloudflare configuration, Google property access, Stripe
test-mode Checkout/webhooks, public staging exposure, or production backups.
Those checks are intentionally listed as external gates in
`EXTERNAL_SMOKE_TEST_CHECKLIST.md`.
