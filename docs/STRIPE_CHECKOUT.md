# Stripe Checkout

Boost uses one-time Stripe Checkout Sessions with `mode=payment`. The server obtains the package snapshot, verifies the configured one-time Price object (active, amount, currency), resolves the authenticated payer’s environment-specific Customer, and creates the session with server-controlled success/cancel URLs.

Metadata includes only internal identifiers: campaign, order, site, package, and `test`/`live` environment. The client cannot provide the amount, currency, Price ID, success URL, payment state, or activation state. Stripe Customer IDs are stored per user and environment; card details are never stored.

Checkout creation has an idempotency key derived from environment and internal order. A pending order, Checkout session, payment attempt, reservation, and campaign state are separate application records. Repeated clicks reuse a session when safe; failed/expired attempts can be reconciled and reopened after the old hold is released.

Demo mode has no Stripe Checkout and never charges. Live keys remain disabled until pricing, tax, terms, inventory, webhook monitoring, refund operations, and explicit production launch approval are complete.
