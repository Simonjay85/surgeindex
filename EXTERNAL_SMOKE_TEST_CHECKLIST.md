# External smoke-test checklist

This checklist is an evidence template, not a claim that any external test has
passed. Fill in the operator, UTC timestamp, environment, request IDs, and
read-back references for every checked item. Never paste credentials or raw
provider tokens into this file.

## Common evidence fields

- Environment and canonical URL:
- Release/build SHA:
- Operator and approval ticket:
- Start/end UTC:
- Browser/device:
- Request IDs / safe event IDs:
- Database read-back query or screenshot reference:
- Result: `PASS` / `FAIL` / `BLOCKED`

## Tracker staging

1. Confirm staging reports `APP_MODE=production`, `DATA_PROVIDER=postgres`,
   explicit proxy mode, and tracker gate ready from `pnpm launch:gates`.
2. Create/approve one real staging site through `/submit` and admin
   moderation. Confirm it is not demo data and is not automatically claimed by
   the submitter.
3. Start a meta-tag or DNS-TXT ownership claim and verify the proof. Confirm
   owner relation and audit row; confirm a tracker connection is still a
   separate action.
4. Install the exact staging tracker key on a controlled page. Generate one
   pageview, heartbeat, navigation, and opt-out event.
5. Read back collector acceptance, fraud decision, active session, path
   normalization, attribution, aggregation, and `system_job_run` success.
6. Confirm Online Now uses the tracker heartbeat window and is not labeled as
   GA4 Realtime.
7. Send an XFF-spoof request through the public Nginx edge and confirm the
   rate-limit identity cannot be changed by the client header.
8. Call `/api/health/live` and `/api/health/ready`; record status and migration
   count without recording secrets.

## Auth and email

1. Sign up with a controlled mailbox and Turnstile; record the sanitized
   request ID and mailbox receipt timestamp.
2. Confirm sign-in is rejected before email verification and succeeds after the
   one-time verification link is consumed.
3. Request verification resend; confirm rate limiting and a fresh one-time
   email.
4. Request password reset; confirm the response does not reveal whether an
   email exists, receive the link, reset once, confirm the old link cannot be
   reused, and sign in with the new password.
5. Confirm expired/invalid tokens return a safe error and no stack/provider
   details.

## GA4

1. Set `GA4_PROVIDER_MODE=google` with approved OAuth credentials and the exact
   registered callback `/api/ga4/callback`.
2. Complete OAuth consent and callback; read back an encrypted token record,
   never the token value.
3. List properties and select one property/stream whose domain matches the
   claimed site; record IDs only if approved for the evidence system.
4. Run domain validation and a test report. Confirm the source remains separate
   from tracker and the ranking-source transition is explicitly recorded.
5. Run Core, Realtime, and one bounded backfill batch. Read back sync run,
   quota, freshness, partial/data-may-change, and job-status records.
6. Exercise token refresh, disconnect, reconnect, revoke, and a quota/error
   response. Confirm disconnect/revoke stops future sync.
7. Confirm GA4 active-user windows are labeled separately from tracker Online
   Now.

## Stripe test mode

1. Keep `STRIPE_TEST_MODE_REQUIRED=true`, `BOOST_LIVE_MODE_ENABLED=false`, and
   use only approved `sk_test_` credentials.
2. Verify package Price IDs server-side against amount/currency/type/active
   state. Record safe Price IDs and environment, not secret keys.
3. Create a campaign draft, reserve inventory, and create Checkout. Confirm
   campaign/order binding and reservation state in the database.
4. Complete Checkout with Stripe test payment details. Deliver the signed
   event to `/api/webhooks/stripe` using Stripe CLI or the approved endpoint.
5. Read back the processed webhook row, order/payment/campaign transitions,
   environment, request ID, and no duplicate mutation on redelivery.
6. Exercise expired Checkout, async success/failure, duplicate and out-of-order
   events, payment after inventory loss, partial/full refund, and dispute
   created/closed. Record each state read-back.
7. Force a failed webhook row in the approved test procedure, run the guarded
   replay command after review, and confirm the canonical processor changes it
   from failed to processed exactly once.
8. Confirm the old `/api/stripe/webhook` route returns 410.

## Five Boost placements

For each placement, capture desktop and mobile screenshots plus a safe API
response reference:

- `homepage_boosted` at `/`
- `category_boosted` at `/categories/<slug>`
- `ranking_feed_insert` at `/rankings`
- `site_profile_recommendation` at `/site/<slug>`
- `breakout_sponsor` at `/breakouts`

For each placement, verify that the package only offers it while its kill switch
is on; the route context is the public page, not `/api/boost/serve`; mismatched
routes are rejected; Sponsored/Paid labels remain visible at mobile and
desktop; server-returned viewability thresholds are used; replay, self-view,
and frequency caps work; click and attribution read back; and disabling the
kill switch stops package availability/serving without changing organic rank.

## Release, backup, and monitoring

1. Run `pnpm launch:check` with an explicitly named disposable PostgreSQL 17
   database and archive output.
2. Run the production build, deploy to a versioned release directory, run
   `pnpm db:migrate`, and read back readiness before symlink promotion.
3. Confirm all systemd timers/services use bundled Node artifacts, documented
   service accounts, `system_job_run`, and non-zero failure exits.
4. Run local/encrypted offsite backup and the disposable restore drill.
5. Confirm Nginx effective configuration, loopback-only database listener,
   firewall, disk headroom, web restart behavior, and alert routing.
