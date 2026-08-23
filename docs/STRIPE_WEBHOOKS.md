# Stripe webhooks

`POST /api/webhooks/stripe` reads the raw request body exactly once and verifies `stripe-signature` with the server webhook secret. Invalid signatures are rejected before application mutation. The handler stores provider, environment, event ID, event type, request ID, and processing result in `processed_webhook_event`.

Handled event families include Checkout completion/async success/failure/expiration, PaymentIntent success/failure, charge refund, and dispute created/closed. Duplicate events are no-ops. Event order is not trusted: successful payment re-fetches a Checkout session when reached through a PaymentIntent event, then validates metadata, environment, campaign/order binding, amount, currency, payment status, and package snapshot before fulfillment.

Payment confirmation is transactional: payment/order ledgers update, reservations confirm, creative snapshots remain frozen for serving, and a campaign moves to `paid`, `scheduled`, `active`, or `paid_pending_inventory_review`. Browser success pages only display safe state. They never activate campaigns.

Webhook payloads, secrets, authorization data, card data, access tokens, and raw IPs are not logged. Real signed Stripe test-mode delivery was not run in this batch; the local `stripe:test-webhook` command verifies a generated fixture signature only.
