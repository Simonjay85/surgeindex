import "server-only";

import Stripe from "stripe";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { BoostServiceError, prepareBoostOrder, releaseBoostReservation, transitionCampaignTx } from "./boost-service";
import { getBoostPackage } from "./boost-config";
import { getServerEnv } from "@surge/config";
import { boostCampaign, boostCampaignCreative, boostDispute, boostInventoryReservation, boostOrder, boostPayment, boostRefund, boostStripeCheckoutSession, processedWebhookEvent, stripeCustomer, user, getPostgresDb } from "@surge/db";

export class StripeServiceError extends Error {
  constructor(public readonly code: "stripe_disabled" | "stripe_configuration" | "stripe_mode_mismatch" | "checkout_unavailable" | "checkout_object_invalid" | "webhook_invalid" | "payment_not_found" | "refund_invalid", message: string, public readonly status = 409) {
    super(message);
    this.name = "StripeServiceError";
  }
}

function stripeEnvironmentFromSecret(secret: string): "test" | "live" {
  if (secret.startsWith("sk_test_")) return "test";
  if (secret.startsWith("sk_live_")) return "live";
  throw new StripeServiceError("stripe_configuration", "Stripe secret key format is invalid.", 500);
}

function stripeContext(): { client: Stripe; environment: "test" | "live" } {
  const env = getServerEnv();
  if (env.APP_MODE !== "production") throw new StripeServiceError("stripe_disabled", "Stripe Checkout is disabled in demo mode.", 409);
  if (!env.STRIPE_ENABLED || !env.STRIPE_SECRET_KEY) throw new StripeServiceError("stripe_disabled", "Stripe Checkout is not enabled for this environment.", 409);
  const environment = stripeEnvironmentFromSecret(env.STRIPE_SECRET_KEY);
  if (env.STRIPE_TEST_MODE_REQUIRED && environment !== "test") throw new StripeServiceError("stripe_mode_mismatch", "This environment only accepts Stripe test-mode records.", 409);
  return { client: new Stripe(env.STRIPE_SECRET_KEY, { apiVersion: env.STRIPE_API_VERSION as Stripe.LatestApiVersion, maxNetworkRetries: 0, timeout: env.GA4_REQUEST_TIMEOUT_MS }), environment };
}

function checkoutUrl(input: string | undefined, campaignId: string): string {
  if (!input) throw new StripeServiceError("stripe_configuration", "Checkout return URLs are not configured.", 500);
  return input.replaceAll("{CAMPAIGN_ID}", encodeURIComponent(campaignId));
}

async function ensureCustomer(client: Stripe, environment: "test" | "live", userId: string, email: string, name: string) {
  const db = getPostgresDb();
  const [existing] = await db.select().from(stripeCustomer).where(and(eq(stripeCustomer.userId, userId), eq(stripeCustomer.stripeEnvironment, environment))).limit(1);
  if (existing) return existing.stripeCustomerId;
  const created = await client.customers.create({ email, name: name.slice(0, 120), metadata: { surgeindex_user_id: userId } }, { idempotencyKey: `surgeindex-customer:${environment}:${userId}` });
  await db.insert(stripeCustomer).values({ userId, stripeCustomerId: created.id, stripeEnvironment: environment }).onConflictDoNothing({ target: [stripeCustomer.userId, stripeCustomer.stripeEnvironment] });
  const [saved] = await db.select({ stripeCustomerId: stripeCustomer.stripeCustomerId }).from(stripeCustomer).where(and(eq(stripeCustomer.userId, userId), eq(stripeCustomer.stripeEnvironment, environment))).limit(1);
  return saved?.stripeCustomerId ?? created.id;
}

export async function createBoostCheckout(input: { userId: string; campaignId: string; requestId: string }) {
  const env = getServerEnv();
  const { client, environment } = stripeContext();
  const db = getPostgresDb();
  const order = await prepareBoostOrder({ userId: input.userId, campaignId: input.campaignId, stripeEnvironment: environment, requestId: input.requestId });
  if (order.stripeEnvironment !== environment) throw new StripeServiceError("stripe_mode_mismatch", "This order belongs to a different Stripe environment.", 409);
  const [existing] = await db.select().from(boostStripeCheckoutSession).where(eq(boostStripeCheckoutSession.orderId, order.id)).limit(1);
  if (existing) {
    const session = await client.checkout.sessions.retrieve(existing.stripeSessionId);
    return { sessionId: session.id, url: session.url, environment, reused: true };
  }
  const pkg = getBoostPackage(order.packageKey);
  if (!pkg?.stripePriceId || pkg.amountCents == null || !pkg.targetQualifiedImpressions) throw new StripeServiceError("checkout_unavailable", "This package is not configured for Stripe Checkout.", 409);
  let price: Stripe.Price;
  try {
    price = await client.prices.retrieve(pkg.stripePriceId);
  } catch {
    throw new StripeServiceError("checkout_unavailable", "The configured Stripe price could not be verified.", 503);
  }
  if (!price.active || price.type !== "one_time" || price.unit_amount !== pkg.amountCents || price.currency.toUpperCase() !== order.currency.toLowerCase().toUpperCase()) throw new StripeServiceError("checkout_object_invalid", "The configured Stripe price does not match the server package snapshot.", 409);
  const [payer] = await db.select({ email: user.email, name: user.name }).from(user).where(eq(user.id, input.userId)).limit(1);
  if (!payer) throw new StripeServiceError("checkout_unavailable", "The payer account was not found.", 404);
  const customerId = await ensureCustomer(client, environment, input.userId, payer.email, payer.name);
  const reservation = await db.select({ id: boostInventoryReservation.id }).from(boostInventoryReservation).where(and(eq(boostInventoryReservation.campaignId, order.campaignId), inArray(boostInventoryReservation.status, ["held", "confirmed"]))).orderBy(desc(boostInventoryReservation.createdAt)).limit(1);
  if (!reservation[0]) throw new StripeServiceError("checkout_unavailable", "Inventory reservation expired. Forecast again before checkout.", 409);
  const idempotencyKey = `surgeindex-checkout:${environment}:${order.id}`;
  let session: Stripe.Checkout.Session;
  try {
    session = await client.checkout.sessions.create({
      mode: "payment",
      customer: customerId,
      client_reference_id: order.id,
      line_items: [{ price: pkg.stripePriceId, quantity: 1 }],
      success_url: checkoutUrl(env.STRIPE_CHECKOUT_SUCCESS_URL, order.campaignId),
      cancel_url: checkoutUrl(env.STRIPE_CHECKOUT_CANCEL_URL, order.campaignId),
      expires_at: Math.floor((Date.now() + Math.max(30, env.BOOST_RESERVATION_MINUTES) * 60_000) / 1000),
      automatic_tax: env.STRIPE_TAX_ENABLED ? { enabled: true } : undefined,
      metadata: { campaign_id: order.campaignId, order_id: order.id, site_id: String((order.packageSnapshot.siteId as string | undefined) ?? ""), package_id: order.packageKey, environment },
    }, { idempotencyKey });
  } catch {
    throw new StripeServiceError("checkout_unavailable", "Stripe Checkout could not be created. Your reservation remains subject to its expiry window.", 503);
  }
  await db.transaction(async (tx) => {
    await tx.insert(boostStripeCheckoutSession).values({ orderId: order.id, stripeSessionId: session.id, stripeEnvironment: environment, idempotencyKey, paymentIntentId: typeof session.payment_intent === "string" ? session.payment_intent : null, status: session.status ?? "open", expiresAt: session.expires_at ? new Date(session.expires_at * 1000) : null }).onConflictDoNothing({ target: boostStripeCheckoutSession.orderId });
    await tx.update(boostInventoryReservation).set({ stripeCheckoutSessionId: session.id }).where(eq(boostInventoryReservation.id, reservation[0].id));
  });
  return { sessionId: session.id, url: session.url, environment, reused: false };
}

function metadataValue(metadata: Stripe.Metadata, key: string): string | null {
  const value = metadata[key];
  return typeof value === "string" && value.length <= 200 ? value : null;
}

async function confirmCheckoutSession(session: Stripe.Checkout.Session, environment: "test" | "live", requestId: string) {
  const campaignId = metadataValue(session.metadata ?? {}, "campaign_id");
  const orderId = metadataValue(session.metadata ?? {}, "order_id");
  const metadataEnvironment = metadataValue(session.metadata ?? {}, "environment");
  if (!campaignId || !orderId || metadataEnvironment !== environment || session.payment_status !== "paid") throw new StripeServiceError("checkout_object_invalid", "The completed Checkout object failed server-side payment validation.", 409);
  const db = getPostgresDb();
  return db.transaction(async (tx) => {
    const [order] = await tx.select().from(boostOrder).where(and(eq(boostOrder.id, orderId), eq(boostOrder.campaignId, campaignId), eq(boostOrder.stripeEnvironment, environment))).limit(1);
    const [campaign] = await tx.select().from(boostCampaign).where(eq(boostCampaign.id, campaignId)).limit(1);
    if (!order || !campaign || session.currency?.toLowerCase() !== order.currency.toLowerCase() || session.amount_total !== order.expectedAmountCents) throw new StripeServiceError("checkout_object_invalid", "The completed Checkout amount or campaign binding did not match the internal order.", 409);
    if (order.paymentStatus === "succeeded") return { activated: false, alreadyProcessed: true, campaignId };
    await tx.update(boostOrder).set({ paymentStatus: "succeeded", paidAmountCents: session.amount_total, paidAt: new Date(), updatedAt: new Date() }).where(eq(boostOrder.id, order.id));
    await tx.insert(boostPayment).values({ orderId: order.id, stripeEnvironment: environment, status: "succeeded", amountCents: session.amount_total, currency: order.currency, stripePaymentIntentId: typeof session.payment_intent === "string" ? session.payment_intent : null, paidAt: new Date() }).onConflictDoNothing();
    const [reservation] = await tx.select().from(boostInventoryReservation).where(and(eq(boostInventoryReservation.campaignId, campaign.id), inArray(boostInventoryReservation.status, ["held", "confirmed"]))).orderBy(desc(boostInventoryReservation.createdAt)).limit(1);
    if (reservation) await tx.update(boostInventoryReservation).set({ status: "confirmed" }).where(eq(boostInventoryReservation.id, reservation.id));
    if (!["paid", "scheduled", "active", "paid_pending_inventory_review"].includes(campaign.state)) await transitionCampaignTx(tx, campaign.id, reservation ? "paid" : "paid_pending_inventory_review", "Signed Stripe payment confirmation matched the internal order.", null, requestId);
    const [creative] = await tx.select({ state: boostCampaignCreative.state }).from(boostCampaignCreative).where(and(eq(boostCampaignCreative.campaignId, campaign.id), eq(boostCampaignCreative.version, campaign.creativeVersion))).limit(1);
    if (reservation && creative?.state === "approved" && campaign.startAt && campaign.startAt <= new Date()) {
      const [fresh] = await tx.select({ state: boostCampaign.state }).from(boostCampaign).where(eq(boostCampaign.id, campaign.id)).limit(1);
      if (fresh?.state === "paid") await transitionCampaignTx(tx, campaign.id, "active", "Payment confirmed and approved creative is eligible to serve.", null, requestId);
    } else if (reservation && creative?.state === "approved") {
      const [fresh] = await tx.select({ state: boostCampaign.state }).from(boostCampaign).where(eq(boostCampaign.id, campaign.id)).limit(1);
      if (fresh?.state === "paid") await transitionCampaignTx(tx, campaign.id, "scheduled", "Payment confirmed; campaign is scheduled for its approved start.", null, requestId);
    }
    return { activated: true, alreadyProcessed: false, campaignId };
  });
}

async function markCheckoutFailed(session: Stripe.Checkout.Session, environment: "test" | "live", requestId: string, state: "payment_failed" | "checkout_expired") {
  const campaignId = metadataValue(session.metadata ?? {}, "campaign_id");
  const orderId = metadataValue(session.metadata ?? {}, "order_id");
  if (!campaignId || !orderId) return { ignored: true };
  const db = getPostgresDb();
  await db.transaction(async (tx) => {
    await tx.update(boostOrder).set({ paymentStatus: state === "checkout_expired" ? "expired" : "failed", updatedAt: new Date() }).where(and(eq(boostOrder.id, orderId), eq(boostOrder.stripeEnvironment, environment)));
    const [campaign] = await tx.select({ state: boostCampaign.state }).from(boostCampaign).where(eq(boostCampaign.id, campaignId)).limit(1);
    if (campaign && ["pending_payment", "payment_processing", "inventory_reserved"].includes(campaign.state)) {
      await tx.update(boostInventoryReservation).set({ status: state === "checkout_expired" ? "expired" : "released", releasedAt: new Date() }).where(and(eq(boostInventoryReservation.campaignId, campaignId), inArray(boostInventoryReservation.status, ["held", "confirmed"])));
      await transitionCampaignTx(tx, campaignId, state, state === "checkout_expired" ? "Stripe Checkout expired and the reservation was released." : "Stripe reported a failed payment and the reservation was released.", null, requestId);
    }
  });
  return { ignored: false };
}

async function handleRefund(charge: Stripe.Charge, environment: "test" | "live", requestId: string) {
  const paymentIntentId = typeof charge.payment_intent === "string" ? charge.payment_intent : null;
  if (!paymentIntentId) return;
  const db = getPostgresDb();
  const [payment] = await db.select().from(boostPayment).where(and(eq(boostPayment.stripePaymentIntentId, paymentIntentId), eq(boostPayment.stripeEnvironment, environment))).limit(1);
  if (!payment) return;
  const amount = charge.amount_refunded;
  await db.transaction(async (tx) => {
    await tx.update(boostPayment).set({ status: amount >= payment.amountCents ? "refunded" : "partially_refunded", updatedAt: new Date() }).where(eq(boostPayment.id, payment.id));
    await tx.update(boostOrder).set({ paymentStatus: amount >= payment.amountCents ? "refunded" : "partially_refunded", refundedAmountCents: amount, refundedAt: new Date(), updatedAt: new Date() }).where(eq(boostOrder.id, payment.orderId));
    await tx.insert(boostRefund).values({ orderId: payment.orderId, stripeEnvironment: environment, stripeRefundId: charge.refunds?.data[0]?.id ?? null, amountCents: amount, status: "succeeded", reason: "stripe_charge_refunded", requestId }).onConflictDoNothing();
    const [order] = await tx.select({ campaignId: boostOrder.campaignId }).from(boostOrder).where(eq(boostOrder.id, payment.orderId)).limit(1);
    if (order) {
      const [campaign] = await tx.select({ state: boostCampaign.state }).from(boostCampaign).where(eq(boostCampaign.id, order.campaignId)).limit(1);
      if (campaign && campaign.state !== "refunded" && ["refund_pending", "partially_refunded", "completed", "underdelivered", "cancelled", "active", "paused", "scheduled"].includes(campaign.state)) {
        const next = amount >= payment.amountCents ? "refunded" : "partially_refunded";
        if (campaign.state === "active" || campaign.state === "scheduled" || campaign.state === "paused") await transitionCampaignTx(tx, order.campaignId, "refund_pending", "Stripe refund confirmation stopped future delivery.", null, requestId);
        await transitionCampaignTx(tx, order.campaignId, next, "Stripe refund confirmation was recorded.", null, requestId);
      }
    }
  });
}

async function handleDispute(dispute: Stripe.Dispute, environment: "test" | "live", requestId: string, closed = false) {
  const paymentIntentId = typeof dispute.payment_intent === "string" ? dispute.payment_intent : null;
  if (!paymentIntentId) return;
  const db = getPostgresDb();
  const [payment] = await db.select().from(boostPayment).where(and(eq(boostPayment.stripePaymentIntentId, paymentIntentId), eq(boostPayment.stripeEnvironment, environment))).limit(1);
  if (!payment) return;
  const status = closed ? (dispute.status === "won" ? "won" : dispute.status === "lost" ? "lost" : "closed") : "open";
  await db.transaction(async (tx) => {
    await tx.insert(boostDispute).values({ paymentId: payment.id, orderId: payment.orderId, stripeEnvironment: environment, stripeDisputeId: dispute.id, status, reason: dispute.reason ?? null, evidenceSnapshot: { amount: dispute.amount, currency: dispute.currency, requestId } }).onConflictDoNothing();
    if (!closed) {
      await tx.update(boostPayment).set({ status: "disputed", updatedAt: new Date() }).where(eq(boostPayment.id, payment.id));
      const [order] = await tx.select({ campaignId: boostOrder.campaignId }).from(boostOrder).where(eq(boostOrder.id, payment.orderId)).limit(1);
      if (order) {
        const [campaign] = await tx.select({ state: boostCampaign.state }).from(boostCampaign).where(eq(boostCampaign.id, order.campaignId)).limit(1);
        if (campaign && ["active", "scheduled", "paused", "paid"].includes(campaign.state)) await transitionCampaignTx(tx, order.campaignId, "disputed", "Stripe dispute opened; delivery is paused pending review.", null, requestId);
      }
    }
  });
}

export async function processStripeWebhook(input: { rawBody: string; signature: string | null; requestId: string }) {
  const { client, environment } = stripeContext();
  if (!input.signature) throw new StripeServiceError("webhook_invalid", "Stripe signature is required.", 400);
  let event: Stripe.Event;
  try {
    event = client.webhooks.constructEvent(input.rawBody, input.signature, getServerEnv().STRIPE_WEBHOOK_SECRET!);
  } catch {
    throw new StripeServiceError("webhook_invalid", "Stripe webhook signature is invalid.", 400);
  }
  const db = getPostgresDb();
  const [inserted] = await db.insert(processedWebhookEvent).values({ provider: "stripe", eventId: event.id, stripeEnvironment: environment, eventType: event.type, requestId: input.requestId, processingResult: "received" }).onConflictDoNothing({ target: [processedWebhookEvent.provider, processedWebhookEvent.stripeEnvironment, processedWebhookEvent.eventId] }).returning({ id: processedWebhookEvent.id });
  if (!inserted) return { eventId: event.id, type: event.type, duplicate: true };
  try {
    switch (event.type) {
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded":
        await confirmCheckoutSession(event.data.object as Stripe.Checkout.Session, environment, input.requestId);
        break;
      case "checkout.session.async_payment_failed":
        await markCheckoutFailed(event.data.object as Stripe.Checkout.Session, environment, input.requestId, "payment_failed");
        break;
      case "checkout.session.expired":
        await markCheckoutFailed(event.data.object as Stripe.Checkout.Session, environment, input.requestId, "checkout_expired");
        break;
      case "payment_intent.succeeded": {
        const paymentIntent = event.data.object as Stripe.PaymentIntent;
        const [session] = await db.select({ stripeSessionId: boostStripeCheckoutSession.stripeSessionId }).from(boostStripeCheckoutSession).where(and(eq(boostStripeCheckoutSession.paymentIntentId, paymentIntent.id), eq(boostStripeCheckoutSession.stripeEnvironment, environment))).limit(1);
        if (session) await confirmCheckoutSession(await client.checkout.sessions.retrieve(session.stripeSessionId), environment, input.requestId);
        break;
      }
      case "payment_intent.payment_failed": {
        const paymentIntent = event.data.object as Stripe.PaymentIntent;
        await db.update(boostPayment).set({ status: "failed", updatedAt: new Date() }).where(and(eq(boostPayment.stripePaymentIntentId, paymentIntent.id), eq(boostPayment.stripeEnvironment, environment)));
        break;
      }
      case "charge.refunded":
        await handleRefund(event.data.object as Stripe.Charge, environment, input.requestId);
        break;
      case "charge.dispute.created":
        await handleDispute((event.data.object as Stripe.Charge).dispute as unknown as Stripe.Dispute, environment, input.requestId);
        break;
      case "charge.dispute.closed":
        await handleDispute((event.data.object as Stripe.Charge).dispute as unknown as Stripe.Dispute, environment, input.requestId, true);
        break;
      default:
        break;
    }
    await db.update(processedWebhookEvent).set({ processingResult: "processed" }).where(eq(processedWebhookEvent.id, inserted.id));
    return { eventId: event.id, type: event.type, duplicate: false };
  } catch (error) {
    await db.update(processedWebhookEvent).set({ processingResult: "failed", errorCode: error instanceof StripeServiceError ? error.code : "internal_error" }).where(eq(processedWebhookEvent.id, inserted.id));
    throw error;
  }
}

export async function requestBoostRefund(input: { adminUserId: string; orderId: string; amountCents: number; reason: string; requestId: string }) {
  const { client, environment } = stripeContext();
  const db = getPostgresDb();
  const [order] = await db.select().from(boostOrder).where(eq(boostOrder.id, input.orderId)).limit(1);
  if (!order || order.stripeEnvironment !== environment) throw new StripeServiceError("payment_not_found", "The payment order was not found in this Stripe environment.", 404);
  const [payment] = await db.select().from(boostPayment).where(and(eq(boostPayment.orderId, order.id), eq(boostPayment.stripeEnvironment, environment))).orderBy(desc(boostPayment.createdAt)).limit(1);
  const refundable = order.paidAmountCents - order.refundedAmountCents;
  if (!payment?.stripePaymentIntentId || input.amountCents <= 0 || input.amountCents > refundable) throw new StripeServiceError("refund_invalid", "The refund amount is outside the refundable balance.", 422);
  const [refund] = await db.insert(boostRefund).values({ orderId: order.id, stripeEnvironment: environment, amountCents: input.amountCents, status: "requested", reason: input.reason, requestedByUserId: input.adminUserId, approvedByUserId: input.adminUserId, requestId: input.requestId }).returning();
  if (!refund) throw new StripeServiceError("refund_invalid", "The refund request could not be recorded.", 500);
  try {
    const stripeRefund = await client.refunds.create({ payment_intent: payment.stripePaymentIntentId, amount: input.amountCents, metadata: { surgeindex_refund_id: refund.id, order_id: order.id } }, { idempotencyKey: `surgeindex-refund:${environment}:${refund.id}` });
    await db.update(boostRefund).set({ stripeRefundId: stripeRefund.id, status: "processing", updatedAt: new Date() }).where(eq(boostRefund.id, refund.id));
    return { refundId: refund.id, stripeRefundId: stripeRefund.id, status: "processing" as const };
  } catch {
    await db.update(boostRefund).set({ status: "failed", updatedAt: new Date() }).where(eq(boostRefund.id, refund.id));
    throw new StripeServiceError("refund_invalid", "Stripe did not accept the refund request.", 503);
  }
}

export function stripeTestModeStatus(): { configured: boolean; environment: "test" | "live" | "unknown"; liveChargesEnabled: boolean } {
  const env = getServerEnv();
  const environment = env.STRIPE_SECRET_KEY?.startsWith("sk_test_") ? "test" : env.STRIPE_SECRET_KEY?.startsWith("sk_live_") ? "live" : "unknown";
  return { configured: Boolean(env.STRIPE_ENABLED && env.STRIPE_SECRET_KEY && env.STRIPE_WEBHOOK_SECRET), environment, liveChargesEnabled: Boolean(env.BOOST_LIVE_MODE_ENABLED && environment === "live") };
}
