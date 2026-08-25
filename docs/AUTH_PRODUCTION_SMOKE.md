# Production authentication smoke procedure

This is an external verification procedure, not a fixture report. Run it only
against an approved staging or production-like host with a real Turnstile site
key/secret, the exact configured hostname, and an approved controlled mailbox.
Never store passwords, reset URLs, verification tokens, Turnstile secrets, or
provider credentials in the evidence.

## Evidence header

Record before starting:

| Field | Value |
| --- | --- |
| Environment / canonical host | |
| Release SHA | |
| Operator / approval ticket | |
| Browser and device | |
| Start/end UTC | |
| Safe request IDs | |
| Mailbox receipt timestamps | |
| Result | `PASS` / `FAIL` / `BLOCKED` |

## Preconditions

- `APP_MODE=production` and `DATA_PROVIDER=postgres`.
- `TURNSTILE_REQUIRED=true`.
- The Turnstile site key is registered for the exact host under test.
- The expected Turnstile hostname and each action (`signup`,
  `password-reset`, and `verification-resend`) are configured and read back
  from provider responses without recording the token.
- `EMAIL_PROVIDER=http` with an approved sender and sandbox/mailbox route.
- The database and job/readiness checks are green for the release SHA.
- Use a new controlled mailbox for the signup and a separate nonexistent
  address for the reset non-enumeration check.

## Required flow

| # | Action | Required observation | Safe evidence |
| --- | --- | --- | --- |
| 1 | Open the exact HTTPS hostname | Real Turnstile widget renders; no localhost/demo indicator. | Host, browser, screenshot reference. |
| 2 | Sign up with a new controlled mailbox | Signup succeeds only with a valid real Turnstile token and correct action/hostname. | Request ID, account-safe identifier, receipt timestamp. |
| 3 | Try login before verification | Login is rejected without creating an authenticated session. | Request ID and error code only. |
| 4 | Read the verification mailbox | One-time link arrives from the approved sender. | Receipt timestamp, message ID if safe. Never record the link/token. |
| 5 | Consume the verification link once | Verification succeeds; a second use is rejected or has no effect. | Request IDs and safe result codes. |
| 6 | Login after verification | Login succeeds and the server session cookie is set with production attributes. | Response status and cookie-attribute assertion, not cookie value. |
| 7 | Request verification resend | Fresh valid message is delivered; repeated requests are rate-limited. | Receipt timestamp and rate-limit response metadata. |
| 8 | Request password reset for the real account | Non-enumerating success response and mailbox message. | Response status, request ID, receipt timestamp. |
| 9 | Request password reset for a nonexistent address | Same outward response shape/status as the real account where policy requires. | Sanitized response comparison only. |
| 10 | Consume reset link | New password works; old session/token behavior follows the approved policy. | Request IDs and status codes, never the token. |
| 11 | Reuse the reset link | Used token is rejected. | Safe error code. |
| 12 | Use an expired reset token | Expired token is rejected without stack/provider details. | Safe error code. |
| 13 | Use a malformed/invalid token | Invalid token is rejected without account enumeration. | Safe error code. |
| 14 | Exercise signup/reset/resend limits | Rate limits trigger and recover according to policy; Turnstile failures fail closed. | Status codes, retry metadata, request IDs. |

## Closeout

Attach only sanitized evidence to `RELEASE_EVIDENCE.md` and the release ticket.
If email delivery, Turnstile hostname/action, database read-back, or rate-limit
behavior cannot be executed, mark the gate `BLOCKED` or `PENDING`; do not use a
fixture token or console mail as a production `PASS`.
