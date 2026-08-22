# SurgeIndex MVP build report

Date: 2026-08-23  
Branch: `feat/surgeindex-mvp`  
Mode: deterministic local demo with production integration seams

## Result

The SurgeIndex production-minded MVP is implemented as a runnable pnpm monorepo. The main product surface is a public, responsive web experience for discovering rising websites, with a clear distinction between organic ranking, verified traffic, SurgeIndex referrals, demo values, and paid distribution.

The build includes the requested public pages, owner/admin surfaces, score and anti-fraud packages, tracker bundle, Cloudflare worker seams, Drizzle schema, API routes, referral redirect, responsive visual system, tests, and deployment skeleton.

## Implemented scope

### Public discovery

- Homepage hero with the “Watch websites go viral in real time.” positioning, line-chart treatment, search, category filters, time-window tabs, live-style ranking cards, and activity strip.
- Rankings, Breakouts, Categories, category detail, Search, and custom 404 routes.
- Site profiles with Heat Score, five-factor breakdown, rank history, visitor trend, related sites, source labels, claim state, and referral CTA.
- Submission flow with safe URL/domain parsing, demo acceptance state, and waitlist-ready positioning.
- Methodology page explaining scoring and trust rules.

### Trust, verification, and monetization

- `Demo Data`, `Tracker Verified`, `GA4 Verified`, `SurgeIndex Referral`, `Sponsored`, and `Unverified` labels are visible at the point of use.
- Claim flow supports meta tag, HTML file, DNS TXT, and tracker method presentation while keeping proof server-side in the production architecture.
- `/go/[siteSlug]` validates the site and destination before redirecting; no arbitrary user-provided redirect URL is accepted.
- Boost pages, pricing, campaign ledger, owner boosts, and billing are present with the paid/organic separation repeated in the UI.
- Demo sign-in routes to a non-authenticated workspace and explicitly says that no real session or credentials are created.

### Data and infrastructure seams

- Drizzle PostgreSQL schema covers users/sessions, sites, claims, verifications, tracker keys, current metrics, snapshots, ranks, activity, referrals, boosts, payments, fraud flags, moderation, feature flags, and raw tracker events.
- Scoring package implements Heat Score v1 with versioned weights, small-base protection, explainable components, and deterministic ranking.
- Anti-fraud package validates event timestamps, heartbeat sequence, replay, impossible points, and click quality without mutating the raw record.
- First-party tracker batches pageview, visibility, engagement, heartbeat, and outbound-click events with retry and consent handling.
- Analytics package exposes a provider contract plus demo and Tinybird-compatible adapters.
- Collector, queue consumer, and Durable Object realtime worker configs are included.
- OpenNext Cloudflare configuration is included at `apps/web/wrangler.jsonc`; KV and Queue IDs remain explicit deployment placeholders.

## Validation evidence

The following checks passed after the final implementation changes:

| Check | Result |
| --- | --- |
| `pnpm typecheck` | PASS across all workspace projects |
| `pnpm lint` | PASS with no warnings |
| `pnpm test` | PASS: web demo tests, 16 anti-fraud tests, 13 scoring tests, 8 tracker tests |
| `pnpm build` | PASS: tracker bundle copied, Next production build generated 31 routes |
| `pnpm test:e2e` | PASS: homepage controls, submission flow, profile/claim/dashboard reachability |
| Production HTTP smoke checks | PASS: leaderboard JSON 200, badge SVG 200, referral route 302 with allowlisted destination |
| Responsive browser QA | PASS: desktop homepage/profile/dashboard/boost and mobile homepage screenshots reviewed |

The E2E suite is at `apps/web/tests/e2e/surgeindex.spec.ts` and starts a clean Next dev server on port 3100 using `apps/web/playwright.config.ts`.

## Browser evidence

Screenshots captured during the review pass:

- [Homepage desktop](output/playwright/home-production-final.png)
- [Homepage mobile](output/playwright/home-production-mobile-final.png)
- [Site profile](output/playwright/site-production-final.png)
- [Owner dashboard](output/playwright/dashboard-production-final.png)
- [Boost separation](output/playwright/boost-desktop.png)

The visual direction uses warm off-white surfaces, charcoal editorial type, coral as the single active accent, peach signal cards, compact source pills, tabular metrics, and rounded but restrained panels. It is designed to make live attention feel legible rather than casino-like. No external imagery was needed: the product is data- and typography-led, so generated imagery would have added noise instead of improving hierarchy.

## Deliberate demo boundary

This is a production-minded MVP, not a claim that third-party systems are already provisioned. The public web pages currently render deterministic fictional data from `apps/web/lib/demo-data.ts` so the product can be reviewed offline and without leaking credentials.

The following require a production configuration pass before launch:

1. Wire Next route handlers and dashboard mutations to the Drizzle repository and Neon/Postgres environment.
2. Enable Better Auth sessions, email/Google providers, secure cookie policy, and actual user/admin role checks.
3. Connect GA4 OAuth, token encryption/rotation, property selection, quota handling, and source-specific freshness/error states.
4. Connect Tinybird ingestion/reads, Cloudflare KV cache writes, queue bindings, and Durable Object broadcasts.
5. Set real Turnstile keys, tracker signing/hash secrets, allowed-origin policy, rate limits, webhook signing, and observability alerts.
6. Connect Stripe Checkout and idempotent webhook handling before accepting payment; demo receipts are not charges.
7. Replace the KV placeholder in `apps/web/wrangler.jsonc`, create the queue, and perform a staged Cloudflare deployment.
8. Add production SSRF revalidation, domain ownership proof persistence, moderation actions, and legal/business review for terms, privacy, acceptable use, refunds, and pricing.

No production deployment, real payment, real OAuth connection, or external data mutation was performed during this build. That boundary is intentional and is reflected in the UI labels and this report.

## Handoff

Start with [README.md](README.md) for setup and architecture. For a fast review, run `pnpm dev`, open `/`, then visit `/rankings`, `/breakouts`, `/site/launchpilot-ai`, `/claim/site-launchpilot`, `/dashboard`, `/admin`, and `/boost`.
