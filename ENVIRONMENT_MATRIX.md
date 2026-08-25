# SurgeIndex environment matrix

The application mode and data provider are explicit. There is no implicit
fallback from production to demo data.

| Capability | Local demo | Disposable CI | Staging | Production |
| --- | --- | --- | --- | --- |
| `APP_MODE` / provider | `demo` / `demo` | `demo` / `demo` plus PostgreSQL migration service | `production` / `postgres` | `production` / `postgres` |
| Canonical URL | `http://localhost:3000` | loopback CI URL | approved HTTPS staging URL | `https://surgeindex.lol` |
| Database | no DB required for public demo | PostgreSQL 17 service | private PostgreSQL with backup | loopback-only PostgreSQL container or approved private DB |
| Proxy trust | `none` | `none` | explicit `direct_nginx` or allowlisted Cloudflare mode | `direct_nginx` for supplied VPS Nginx |
| Turnstile | off or fixture token in tests | fixture/test adapter | real site/secret, hostname/action checked | required; real site/secret and exact hostname |
| Email | disabled/console only for local review | no real delivery | approved transactional sandbox | `EMAIL_PROVIDER=http`, sender, URL, and server-side API key |
| Tracker | disabled unless local fixture | deterministic fixture tests | real staging key/secrets and collector read-back | enable only after staging evidence and durable job monitoring |
| GA4 | fixture provider | fixture provider | Google provider, approved OAuth app and test property | Google provider, approved OAuth app/property, encrypted token key |
| Stripe | disabled; signed local fixture only | disabled; signed local fixture only | test-mode key/webhook/Price IDs and real test Checkout | off until explicit live approval; `STRIPE_TEST_MODE_REQUIRED=true` by default |
| Boost | demo card clearly marked; no billable campaign | disabled in CI | enable one placement at a time after inventory/read-back | kill switches false until each placement is independently approved |
| Future modules | disabled | disabled | disabled | disabled |

## Required production variables

The complete names and safe examples live in
`apps/web/.env.production.example`. Required production configuration includes:

- `APP_MODE=production`, `DATA_PROVIDER=postgres`, a non-local HTTPS
  `NEXT_PUBLIC_APP_URL`, `DATABASE_URL`, `BETTER_AUTH_SECRET`, and an explicit
  `TRUSTED_PROXY_MODE`.
- Turnstile site/secret and expected hostname when `TURNSTILE_REQUIRED=true`.
- A configured transactional email provider; console delivery is rejected in
  production.
- Tracker signing, hash, and rotation secrets when `TRACKER_ENABLED=true`.
- Google OAuth and 32-byte token encryption material when GA4 is enabled.
- Stripe keys, webhook secret, checkout URLs, and server-verified Price IDs
  when Stripe/Boost is enabled. Live mode has an additional explicit approval
  gate and is not enabled by this task.

## Readiness command

Run `pnpm launch:gates` with the target environment loaded. It reports whether
the tracker, GA4, Stripe test, Stripe live, and each of the following placements
are configured to be enabled:

- `homepage_boosted`
- `category_boosted`
- `ranking_feed_insert`
- `site_profile_recommendation`
- `breakout_sponsor`

The command prints no secret values. A gate being `ready` means configuration
checks pass; it does not substitute for external provider or browser
read-back evidence.
