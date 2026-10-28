import Stripe from "stripe";

const secret = "whsec_fixture_batch6";
const rawBody = JSON.stringify({ id: "evt_fixture_batch6", object: "event", api_version: "2025-06-30.basil", created: Math.floor(Date.now() / 1000), data: { object: { id: "cs_fixture_batch6", object: "checkout.session", mode: "payment", payment_status: "paid", metadata: { environment: "test", campaign_id: "fixture-campaign", order_id: "fixture-order" } } }, livemode: false, pending_webhooks: 1, request: null, type: "checkout.session.completed" });
const signature = Stripe.webhooks.generateTestHeaderString({ payload: rawBody, secret });
const event = Stripe.webhooks.constructEvent(rawBody, signature, secret);
console.log(JSON.stringify({ status: "fixture_verified", signed: true, eventId: event.id, type: event.type, liveCharge: false, externalNetwork: false }, null, 2));
