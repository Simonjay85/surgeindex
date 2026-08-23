import "server-only";

import { and, desc, eq, gt, gte, isNull, lt, lte, or, sql } from "drizzle-orm";
import { assertBoostTransition, buildBoostReport, forecastInventory, type BoostCampaignState, type BoostPlacementKey, type BoostReport, type InventoryForecast } from "@surge/boost";
import { getServerEnv } from "@surge/config";
import { boostCampaign, boostCampaignCreative, boostCampaignStateTransition, boostClickEvent, boostFrequencyCap, boostImpressionAggregate, boostImpressionEvent, boostImpressionOpportunity, boostInventoryReservation, boostInventoryWindow, boostOrder, category, getPostgresDb, site, siteMetricCurrent, siteOwner } from "@surge/db";
import { getBoostPackage, getBoostPlacement, legacyPlacementFor, packageSnapshot, sanitizeCreative } from "./boost-config";
import { hashBoostToken, signClickToken, signImpressionToken, verifyImpressionToken } from "./boost-tokens";

export class BoostServiceError extends Error {
  constructor(public readonly code: "boost_disabled" | "site_not_eligible" | "site_not_found" | "package_not_found" | "placement_not_found" | "package_placement_mismatch" | "invalid_duration" | "invalid_category" | "creative_invalid" | "campaign_not_found" | "invalid_state" | "inventory_unavailable" | "reservation_not_found" | "token_invalid" | "impression_invalid" | "campaign_not_active" | "frequency_capped" | "duplicate_event" | "demo_only", message: string, public readonly status = 422) {
    super(message);
    this.name = "BoostServiceError";
  }
}

function legacyStatus(state: BoostCampaignState): "draft" | "pending_payment" | "scheduled" | "active" | "paused" | "completed" | "cancelled" | "refunded" {
  if (state === "draft" || state === "inventory_check" || state === "awaiting_checkout" || state === "inventory_reserved") return "draft";
  if (["pending_payment", "payment_processing", "payment_failed", "checkout_expired"].includes(state)) return "pending_payment";
  if (["scheduled", "paid", "paid_pending_inventory_review"].includes(state)) return "scheduled";
  if (state === "active") return "active";
  if (["paused", "suspended", "cancel_requested", "disputed"].includes(state)) return "paused";
  if (["cancelled"].includes(state)) return "cancelled";
  if (["refunded", "partially_refunded", "refund_pending"].includes(state)) return "refunded";
  return "completed";
}

function assertUuidLike(value: string, field: string): void {
  if (!/^[0-9a-f-]{36}$/i.test(value)) throw new BoostServiceError("campaign_not_found", `${field} was not found.`, 404);
}

async function ownedSite(userId: string, siteId: string) {
  assertUuidLike(siteId, "site");
  const db = getPostgresDb();
  const [row] = await db
    .select({ site, ownerRole: siteOwner.role })
    .from(site)
    .innerJoin(siteOwner, eq(siteOwner.siteId, site.id))
    .where(and(eq(site.id, siteId), eq(siteOwner.userId, userId), or(eq(siteOwner.role, "owner"), eq(siteOwner.role, "editor")), isNull(site.deletedAt)))
    .limit(1);
  if (!row) throw new BoostServiceError("site_not_found", "The site was not found or you are not authorized to manage it.", 404);
  if (row.site.status !== "active" || row.site.ownership !== "claimed" || row.site.isDemo) throw new BoostServiceError("site_not_eligible", "Only an active, ownership-verified site can advertise.", 409);
  return row.site;
}

function validatePackageAndPlacement(packageKey: string, placementKey: string) {
  const pkg = getBoostPackage(packageKey);
  if (!pkg || !pkg.active || pkg.targetQualifiedImpressions == null || pkg.amountCents == null) throw new BoostServiceError("package_not_found", "Choose an active server-configured package.", 422);
  const placement = getBoostPlacement(placementKey);
  if (!placement || !placement.active) throw new BoostServiceError("placement_not_found", "Choose an active sponsored placement.", 422);
  if (!pkg.eligiblePlacements.includes(placement.key)) throw new BoostServiceError("package_placement_mismatch", "That package is not eligible for the selected placement.", 422);
  return { pkg, placement };
}

export async function createBoostCampaign(input: {
  userId: string;
  siteId: string;
  packageKey: string;
  placementKey: string;
  categoryId?: string | null;
  durationDays?: number;
  startsAt?: Date;
  creative?: { headline?: string; description?: string; ctaLabel?: string; destinationUrl?: string; logoUrl?: string | null };
  requestId: string;
}) {
  const env = getServerEnv();
  if (!env.BOOST_ENABLED && env.APP_MODE !== "demo") throw new BoostServiceError("boost_disabled", "Boost is not enabled for this environment.", 409);
  const targetSite = await ownedSite(input.userId, input.siteId);
  const { pkg, placement } = validatePackageAndPlacement(input.packageKey, input.placementKey);
  const durationDays = input.durationDays ?? pkg.defaultDurationDays;
  if (!Number.isInteger(durationDays) || durationDays < 1 || durationDays > Math.min(pkg.maximumDurationDays, env.BOOST_MAX_CAMPAIGN_DAYS)) throw new BoostServiceError("invalid_duration", "Choose a campaign duration within the configured limit.", 422);
  if (input.categoryId) {
    const [categoryRow] = await getPostgresDb().select({ id: category.id }).from(category).where(eq(category.id, input.categoryId)).limit(1);
    if (!categoryRow) throw new BoostServiceError("invalid_category", "The selected category was not found.", 422);
  }
  let creative;
  try {
    creative = sanitizeCreative({ ...input.creative, siteDomain: targetSite.domain, logoUrl: input.creative?.logoUrl ?? targetSite.logoUrl }, placement);
  } catch {
    throw new BoostServiceError("creative_invalid", "The creative or destination could not be approved for this site.", 422);
  }
  const startsAt = input.startsAt ?? new Date(Date.now() + 30 * 60 * 1000);
  const endsAt = new Date(startsAt.getTime() + durationDays * 24 * 60 * 60 * 1000);
  const db = getPostgresDb();
  const [campaign] = await db.transaction(async (tx) => {
    const [created] = await tx.insert(boostCampaign).values({
      siteId: targetSite.id,
      ownerId: input.userId,
      status: "draft",
      state: "draft",
      placement: legacyPlacementFor(placement.key),
      placementKey: placement.key,
      categoryId: input.categoryId ?? targetSite.categoryId,
      packageKey: pkg.id,
      packageSnapshot: packageSnapshot(pkg),
      packageId: null,
      headline: creative.headline,
      shortDescription: creative.description,
      ctaLabel: creative.ctaLabel,
      destinationUrl: creative.destinationUrl,
      logoUrl: creative.logoUrl,
      creativeVersion: 1,
      pacingMode: "even",
      budgetCents: pkg.amountCents,
      currency: pkg.currency,
      targetImpressions: pkg.targetQualifiedImpressions,
      startAt: startsAt,
      endAt: endsAt,
      isDemo: false,
    }).returning({ id: boostCampaign.id });
    if (!created) throw new Error("boost_campaign_insert_failed");
    await tx.insert(boostCampaignCreative).values({ campaignId: created.id, version: 1, state: "pending_review", headline: creative.headline, description: creative.description, ctaLabel: creative.ctaLabel, destinationUrl: creative.destinationUrl, logoUrl: creative.logoUrl });
    await tx.insert(boostCampaignStateTransition).values({ campaignId: created.id, previousState: null, newState: "draft", reason: "Campaign draft created by authorized site owner.", actorUserId: input.userId, requestId: input.requestId });
    return tx.select().from(boostCampaign).where(eq(boostCampaign.id, created.id)).limit(1);
  });
  return campaign;
}

export async function getOwnedBoostCampaign(userId: string, campaignId: string) {
  assertUuidLike(campaignId, "campaign");
  const [campaign] = await getPostgresDb().select().from(boostCampaign).where(and(eq(boostCampaign.id, campaignId), eq(boostCampaign.ownerId, userId))).limit(1);
  if (!campaign) throw new BoostServiceError("campaign_not_found", "The campaign was not found.", 404);
  return campaign;
}

export async function prepareBoostOrder(input: { userId: string; campaignId: string; stripeEnvironment: "test" | "live"; requestId: string }) {
  const campaign = await getOwnedBoostCampaign(input.userId, input.campaignId);
  const db = getPostgresDb();
  return db.transaction(async (tx) => {
    const [existing] = await tx.select().from(boostOrder).where(eq(boostOrder.campaignId, campaign.id)).limit(1);
    if (existing) return existing;
    if (!["inventory_reserved", "awaiting_checkout", "pending_payment", "payment_processing"].includes(campaign.state)) throw new BoostServiceError("invalid_state", "Reserve inventory before opening Checkout.", 409);
    if (campaign.packageKey === "custom" || campaign.budgetCents <= 0) throw new BoostServiceError("package_not_found", "Custom campaigns require an approved server-side quote.", 422);
    if (!["pending_payment", "payment_processing"].includes(campaign.state)) await transitionCampaignTx(tx, campaign.id, "pending_payment", "Server created a payment order after inventory reservation.", input.userId, input.requestId);
    const [order] = await tx.insert(boostOrder).values({ campaignId: campaign.id, userId: input.userId, packageKey: campaign.packageKey, packageSnapshot: campaign.packageSnapshot, currency: campaign.currency, expectedAmountCents: campaign.budgetCents, stripeEnvironment: input.stripeEnvironment, paymentStatus: "pending" }).returning();
    if (!order) throw new Error("boost_order_insert_failed");
    return order;
  });
}

export async function getBoostCampaignReport(userId: string, campaignId: string): Promise<{ campaign: typeof boostCampaign.$inferSelect; report: BoostReport; sourceLabels: Record<string, string> }> {
  const campaign = await getOwnedBoostCampaign(userId, campaignId);
  const [order] = await getPostgresDb().select({ paidAmountCents: boostOrder.paidAmountCents }).from(boostOrder).where(eq(boostOrder.campaignId, campaign.id)).limit(1);
  return {
    campaign,
    report: buildBoostReport({
      targetQualifiedImpressions: campaign.targetImpressions,
      qualifiedImpressions: campaign.validImpressions,
      renderedImpressions: campaign.renderedImpressions,
      invalidImpressions: campaign.invalidImpressions,
      clicks: campaign.clicks,
      validClicks: campaign.validClicks,
      uniqueClicks: campaign.uniqueClicks,
      attributedVisits: campaign.attributedVisits,
      attributedEngagedVisits: campaign.attributedEngagedVisits,
      amountPaidCents: order?.paidAmountCents ?? 0,
      currency: campaign.currency,
    }),
    sourceLabels: {
      delivery: "SurgeIndex ad delivery",
      clicks: "SurgeIndex click redirect",
      attribution: "Destination tracker attribution",
      payment: "Stripe payment",
    },
  };
}

export async function transitionCampaignTx(tx: Parameters<Parameters<ReturnType<typeof getPostgresDb>["transaction"]>[0]>[0], campaignId: string, next: BoostCampaignState, reason: string, actorUserId: string | null, requestId: string) {
  const [current] = await tx.select({ id: boostCampaign.id, state: boostCampaign.state }).from(boostCampaign).where(eq(boostCampaign.id, campaignId)).limit(1);
  if (!current) throw new BoostServiceError("campaign_not_found", "The campaign was not found.", 404);
  const from = current.state as BoostCampaignState;
  if (from === next) return;
  try {
    assertBoostTransition(from, next);
  } catch {
    throw new BoostServiceError("invalid_state", `The campaign cannot move from ${from} to ${next}.`, 409);
  }
  await tx.update(boostCampaign).set({ state: next, status: legacyStatus(next), updatedAt: new Date() }).where(eq(boostCampaign.id, campaignId));
  await tx.insert(boostCampaignStateTransition).values({ campaignId, previousState: from, newState: next, reason, actorUserId, requestId });
}

export async function transitionBoostCampaignForSystem(input: { campaignId: string; next: BoostCampaignState; reason: string; actorUserId?: string | null; requestId: string }) {
  return getPostgresDb().transaction(async (tx) => {
    await transitionCampaignTx(tx, input.campaignId, input.next, input.reason, input.actorUserId ?? null, input.requestId);
    const [campaign] = await tx.select().from(boostCampaign).where(eq(boostCampaign.id, input.campaignId)).limit(1);
    return campaign ?? null;
  });
}

export async function forecastBoostInventory(input: { userId: string; siteId: string; placementKey: string; categoryId?: string | null; startsAt: Date; endsAt: Date; requestedImpressions: number }): Promise<InventoryForecast> {
  const targetSite = await ownedSite(input.userId, input.siteId);
  const placement = getBoostPlacement(input.placementKey);
  if (!placement) throw new BoostServiceError("placement_not_found", "Choose an active sponsored placement.", 422);
  if (!Number.isInteger(input.requestedImpressions) || input.requestedImpressions <= 0) throw new BoostServiceError("inventory_unavailable", "The requested delivery target is invalid.", 422);
  const db = getPostgresDb();
  const [current] = await db.select({ pageviews24h: siteMetricCurrent.pageviews24h, visitors24h: siteMetricCurrent.visitors24h }).from(siteMetricCurrent).where(eq(siteMetricCurrent.siteId, targetSite.id)).limit(1);
  const durationDays = Math.max(1, (input.endsAt.getTime() - input.startsAt.getTime()) / (24 * 60 * 60 * 1000));
  const estimatedOpportunities = current ? Math.max(0, Math.floor(Math.max(current.pageviews24h ?? 0, current.visitors24h ?? 0) * durationDays * 0.5)) : 0;
  const reservedResult = await db.execute(sql`select coalesce(sum(reserved_impressions), 0)::int as reserved from boost_inventory_reservation where placement_key = ${placement.key} and status in ('held','confirmed') and starts_at < ${input.endsAt} and ends_at > ${input.startsAt} and (${input.categoryId}::uuid is null or category_id = ${input.categoryId}::uuid)`);
  const reserved = Number((reservedResult.rows[0] as { reserved?: unknown } | undefined)?.reserved ?? 0);
  return forecastInventory({ estimatedOpportunities, qualifiedViewabilityRate: 0.6, reservedImpressions: reserved, requestedImpressions: input.requestedImpressions, safetyMargin: 0.15 });
}

export async function reserveBoostInventory(input: { userId: string; campaignId: string; requestId: string }) {
  const campaign = await getOwnedBoostCampaign(input.userId, input.campaignId);
  const env = getServerEnv();
  const pkg = getBoostPackage(campaign.packageKey);
  if (!pkg || !campaign.startAt || !campaign.endAt) throw new BoostServiceError("inventory_unavailable", "The campaign package or dates are not available.", 422);
  const db = getPostgresDb();
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`${campaign.placementKey}:${campaign.categoryId ?? "all"}:${campaign.startAt.toISOString()}:${campaign.endAt.toISOString()}`}))`);
    const existing = await tx.select().from(boostInventoryReservation).where(and(eq(boostInventoryReservation.campaignId, campaign.id), or(eq(boostInventoryReservation.status, "held"), eq(boostInventoryReservation.status, "confirmed")))).orderBy(desc(boostInventoryReservation.createdAt)).limit(1);
    if (existing[0]) return existing[0];
    const reservedResult = await tx.execute(sql`select coalesce(sum(reserved_impressions), 0)::int as reserved from boost_inventory_reservation where placement_key = ${campaign.placementKey} and status in ('held','confirmed') and starts_at < ${campaign.endAt} and ends_at > ${campaign.startAt} and (${campaign.categoryId}::uuid is null or category_id = ${campaign.categoryId}::uuid)`);
    const reserved = Number((reservedResult.rows[0] as { reserved?: unknown } | undefined)?.reserved ?? 0);
    const [current] = await tx.select({ pageviews24h: siteMetricCurrent.pageviews24h, visitors24h: siteMetricCurrent.visitors24h }).from(siteMetricCurrent).where(eq(siteMetricCurrent.siteId, campaign.siteId)).limit(1);
    const durationDays = Math.max(1, (campaign.endAt.getTime() - campaign.startAt.getTime()) / (24 * 60 * 60 * 1000));
    const estimatedOpportunities = current ? Math.max(0, Math.floor(Math.max(current.pageviews24h ?? 0, current.visitors24h ?? 0) * durationDays * 0.5)) : 0;
    const forecast = forecastInventory({ estimatedOpportunities, qualifiedViewabilityRate: 0.6, reservedImpressions: reserved, requestedImpressions: campaign.targetImpressions, safetyMargin: 0.15 });
    if (forecast.status === "unknown" || forecast.status === "unavailable" || forecast.availableImpressions < campaign.targetImpressions) throw new BoostServiceError("inventory_unavailable", "Inventory is not available for the selected dates. Your last valid estimate was not reserved.", 409);
    const [window] = await tx.insert(boostInventoryWindow).values({ placementKey: campaign.placementKey, categoryId: campaign.categoryId, startsAt: campaign.startAt, endsAt: campaign.endAt, estimatedOpportunities: forecast.estimatedOpportunities, estimatedQualifiedImpressions: forecast.estimatedQualifiedImpressions, reservedImpressions: reserved + campaign.targetImpressions, safeCapacity: forecast.availableImpressions + reserved, confidence: forecast.confidence, generatedAt: new Date(forecast.generatedAt), expiresAt: new Date(forecast.expiresAt) }).returning({ id: boostInventoryWindow.id });
    const [reservation] = await tx.insert(boostInventoryReservation).values({ campaignId: campaign.id, windowId: window.id, placementKey: campaign.placementKey, categoryId: campaign.categoryId, reservedImpressions: campaign.targetImpressions, startsAt: campaign.startAt, endsAt: campaign.endAt, expiresAt: new Date(Date.now() + env.BOOST_RESERVATION_MINUTES * 60 * 1000), status: "held" }).returning();
    if (!reservation) throw new Error("boost_reservation_insert_failed");
    await transitionCampaignTx(tx, campaign.id, "inventory_check", "Inventory forecast checked before checkout.", input.userId, input.requestId);
    await transitionCampaignTx(tx, campaign.id, "inventory_reserved", "Inventory reserved transactionally before checkout.", input.userId, input.requestId);
    return reservation;
  });
}

export async function releaseBoostReservation(input: { campaignId: string; reason: string; requestId: string; nextState?: "draft" | "checkout_expired" }) {
  const db = getPostgresDb();
  return db.transaction(async (tx) => {
    const [reservation] = await tx.select().from(boostInventoryReservation).where(and(eq(boostInventoryReservation.campaignId, input.campaignId), or(eq(boostInventoryReservation.status, "held"), eq(boostInventoryReservation.status, "confirmed")))).orderBy(desc(boostInventoryReservation.createdAt)).limit(1);
    if (!reservation) return false;
    await tx.update(boostInventoryReservation).set({ status: input.nextState === "checkout_expired" ? "expired" : "released", releasedAt: new Date() }).where(eq(boostInventoryReservation.id, reservation.id));
    const [campaign] = await tx.select({ state: boostCampaign.state }).from(boostCampaign).where(eq(boostCampaign.id, input.campaignId)).limit(1);
    if (campaign && ["inventory_reserved", "pending_payment", "payment_processing"].includes(campaign.state)) await transitionCampaignTx(tx, input.campaignId, input.nextState ?? "draft", input.reason, null, input.requestId);
    return true;
  });
}

export async function createImpressionOpportunity(input: { campaignId: string; siteId: string; placementKey: string; creativeVersion: number; visitorContextHash: string; routeContext: string; expiresAt: Date }) {
  const token = signImpressionToken({ campaignId: input.campaignId, siteId: input.siteId, placementKey: input.placementKey, creativeVersion: input.creativeVersion, visitorContextHash: input.visitorContextHash, routeContext: input.routeContext, issuedAt: Date.now(), expiresAt: input.expiresAt.getTime() });
  const db = getPostgresDb();
  const [opportunity] = await db.insert(boostImpressionOpportunity).values({ campaignId: input.campaignId, placementKey: input.placementKey, creativeVersion: input.creativeVersion, visitorContextHash: input.visitorContextHash, routeContext: input.routeContext, tokenHash: hashBoostToken(token), expiresAt: input.expiresAt }).returning({ id: boostImpressionOpportunity.id });
  return { token, opportunityId: opportunity?.id ?? null };
}

export async function qualifyBoostImpression(input: { token: string; eventId: string; visitorContextHash: string; visiblePercent: number; visibleMilliseconds: number; requestId: string; isOwner: boolean }) {
  const payload = verifyImpressionToken(input.token);
  if (!payload || payload.visitorContextHash !== input.visitorContextHash) throw new BoostServiceError("token_invalid", "The impression token is invalid or expired.", 422);
  const placement = getBoostPlacement(payload.placementKey);
  if (!placement) throw new BoostServiceError("placement_not_found", "The placement is no longer active.", 422);
  const db = getPostgresDb();
  return db.transaction(async (tx) => {
    const [campaign] = await tx.select().from(boostCampaign).where(eq(boostCampaign.id, payload.campaignId)).limit(1);
    const [opportunity] = await tx.select().from(boostImpressionOpportunity).where(eq(boostImpressionOpportunity.tokenHash, hashBoostToken(input.token))).limit(1);
    const insertEvent = async (classification: "duplicate" | "invalid" | "expired_token" | "viewability_failed" | "frequency_capped" | "owner_self_view" | "qualified", reasonCode: string) => {
      const [event] = await tx.insert(boostImpressionEvent).values({ eventId: input.eventId, opportunityId: opportunity?.id ?? null, campaignId: payload.campaignId, siteId: payload.siteId, visitorHash: input.visitorContextHash, classification, visiblePercent: input.visiblePercent, visibleMilliseconds: input.visibleMilliseconds, reasonCode, isDemo: false }).onConflictDoNothing({ target: boostImpressionEvent.eventId }).returning({ id: boostImpressionEvent.id });
      return event;
    };
    if (!campaign || !opportunity) { await insertEvent("invalid", "campaign_or_opportunity_not_found"); throw new BoostServiceError("impression_invalid", "The impression opportunity is no longer valid.", 422); }
    if (opportunity.usedAt) { await insertEvent("duplicate", "opportunity_replayed"); throw new BoostServiceError("duplicate_event", "This impression opportunity has already been used.", 409); }
    if (opportunity.expiresAt <= new Date() || campaign.state !== "active" || !campaign.startAt || !campaign.endAt || campaign.startAt > new Date() || campaign.endAt <= new Date()) { await insertEvent("expired_token", "outside_schedule_or_expired"); throw new BoostServiceError("impression_invalid", "The impression opportunity is outside the active campaign window.", 422); }
    if (input.isOwner && campaign.ownerSelfViewExcluded) { await insertEvent("owner_self_view", "owner_self_view"); throw new BoostServiceError("impression_invalid", "Owner self-view is not billable.", 422); }
    if (input.visiblePercent < placement.viewability.minimumPercent || input.visibleMilliseconds < placement.viewability.minimumMilliseconds) { await insertEvent("viewability_failed", "viewability_threshold_not_met"); throw new BoostServiceError("impression_invalid", "The card did not meet the configured viewability threshold.", 422); }
    const windowStart = new Date();
    windowStart.setUTCHours(0, 0, 0, 0);
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`${campaign.id}:${input.visitorContextHash}:${windowStart.toISOString()}`}))`);
    const [frequency] = await tx.select().from(boostFrequencyCap).where(and(eq(boostFrequencyCap.campaignId, campaign.id), eq(boostFrequencyCap.visitorHash, input.visitorContextHash), eq(boostFrequencyCap.windowStart, windowStart))).limit(1);
    if (frequency && frequency.exposureCount >= placement.frequencyCapPerVisitorPerDay) { await insertEvent("frequency_capped", "frequency_cap_reached"); throw new BoostServiceError("frequency_capped", "The visitor frequency cap has been reached.", 409); }
    if (frequency) await tx.update(boostFrequencyCap).set({ exposureCount: sql`${boostFrequencyCap.exposureCount} + 1`, updatedAt: new Date() }).where(eq(boostFrequencyCap.id, frequency.id));
    else await tx.insert(boostFrequencyCap).values({ campaignId: campaign.id, visitorHash: input.visitorContextHash, windowStart, exposureCount: 1, expiresAt: new Date(windowStart.getTime() + 24 * 60 * 60 * 1000) });
    const inserted = await insertEvent("qualified", "viewability_qualified");
    if (!inserted) throw new BoostServiceError("duplicate_event", "This impression event has already been recorded.", 409);
    await tx.update(boostImpressionOpportunity).set({ usedAt: new Date() }).where(eq(boostImpressionOpportunity.id, opportunity.id));
    await tx.update(boostCampaign).set({ deliveredImpressions: sql`${boostCampaign.deliveredImpressions} + 1`, validImpressions: sql`${boostCampaign.validImpressions} + 1`, updatedAt: new Date() }).where(eq(boostCampaign.id, campaign.id));
    const bucketStart = new Date();
    bucketStart.setMinutes(0, 0, 0);
    await tx.insert(boostImpressionAggregate).values({ campaignId: campaign.id, bucketStart, opportunities: 1, renderedImpressions: 1, qualifiedImpressions: 1 }).onConflictDoUpdate({ target: [boostImpressionAggregate.campaignId, boostImpressionAggregate.bucketStart], set: { opportunities: sql`${boostImpressionAggregate.opportunities} + 1`, renderedImpressions: sql`${boostImpressionAggregate.renderedImpressions} + 1`, qualifiedImpressions: sql`${boostImpressionAggregate.qualifiedImpressions} + 1`, updatedAt: new Date() } });
    return { classification: "qualified" as const, campaignId: campaign.id };
  });
}

export async function recordBoostClick(input: { payload: { campaignId: string; siteId: string; creativeVersion: number; destinationUrl: string; placementKey: string }; visitorContextHash: string; userAgent: string | null; referrerPath: string | null; requestId: string }) {
  const db = getPostgresDb();
  const recent = await db.select({ id: boostClickEvent.id }).from(boostClickEvent).where(and(eq(boostClickEvent.campaignId, input.payload.campaignId), eq(boostClickEvent.visitorHash, input.visitorContextHash), gt(boostClickEvent.occurredAt, new Date(Date.now() - 30 * 60 * 1000)))).limit(1);
  const isUnique = recent.length === 0;
  const invalidBot = /bot|crawler|spider|headless|curl|wget/i.test(input.userAgent ?? "");
  const decision: "invalid" | "valid" = invalidBot ? "invalid" : "valid";
  const [click] = await db.transaction(async (tx) => {
    const [created] = await tx.insert(boostClickEvent).values({ campaignId: input.payload.campaignId, siteId: input.payload.siteId, visitorHash: input.visitorContextHash, destinationUrl: input.payload.destinationUrl, valid: decision === "valid", uniqueClick: isUnique, decision, referrerPath: input.referrerPath, creativeVersion: input.payload.creativeVersion, isDemo: false }).returning();
    if (created && decision === "valid") await tx.update(boostCampaign).set({ clicks: sql`${boostCampaign.clicks} + 1`, validClicks: sql`${boostCampaign.validClicks} + 1`, uniqueClicks: isUnique ? sql`${boostCampaign.uniqueClicks} + 1` : boostCampaign.uniqueClicks, updatedAt: new Date() }).where(eq(boostCampaign.id, input.payload.campaignId));
    return [created];
  });
  return { click, valid: decision === "valid", unique: isUnique };
}

export async function servedBoost(input: { placementKey: BoostPlacementKey; categoryId?: string | null; routeContext: string; visitorContextHash: string; request: Request }) {
  const env = getServerEnv();
  if (env.APP_MODE === "demo") {
    const now = Date.now();
    const impressionToken = signImpressionToken({ campaignId: "demo-boost-campaign", siteId: "demo-boost-site", placementKey: input.placementKey, creativeVersion: 1, visitorContextHash: input.visitorContextHash, routeContext: input.routeContext, issuedAt: now, expiresAt: now + 5 * 60 * 1000 });
    return { isDemo: true, campaignId: "demo-boost-campaign", siteId: "demo-boost-site", siteSlug: "demo-boost", placementKey: input.placementKey, creativeVersion: 1, headline: "A demo sponsored recommendation", description: "Demo delivery is clearly labeled and never affects organic rank.", ctaLabel: "View demo", destinationUrl: "https://example.com", impressionToken, clickToken: signClickToken({ campaignId: "demo-boost-campaign", siteId: "demo-boost-site", siteSlug: "demo-boost", placementKey: input.placementKey, creativeVersion: 1, visitorContextHash: input.visitorContextHash, destinationUrl: "https://example.com", issuedAt: now, expiresAt: now + 5 * 60 * 1000 }) };
  }
  if (!env.BOOST_ENABLED) return null;
  const now = new Date();
  const db = getPostgresDb();
  const rows = await db.select({ campaign: boostCampaign, siteSlug: site.slug, siteDomain: site.domain, siteName: site.name, siteDescription: site.description, siteLogo: site.logoUrl, siteVerification: site.verification }).from(boostCampaign).innerJoin(site, eq(site.id, boostCampaign.siteId)).where(and(eq(boostCampaign.state, "active"), eq(boostCampaign.placementKey, input.placementKey), eq(site.status, "active"), eq(site.isDemo, false), lte(boostCampaign.startAt, now), gte(boostCampaign.endAt, now), gt(boostCampaign.targetImpressions, boostCampaign.deliveredImpressions))).orderBy(desc(boostCampaign.updatedAt)).limit(50);
  for (const row of rows) {
    if (input.categoryId && row.campaign.categoryId && input.categoryId !== row.campaign.categoryId) continue;
    const [frequency] = await db.select({ exposureCount: boostFrequencyCap.exposureCount }).from(boostFrequencyCap).where(and(eq(boostFrequencyCap.campaignId, row.campaign.id), eq(boostFrequencyCap.visitorHash, input.visitorContextHash), gte(boostFrequencyCap.expiresAt, now))).limit(1);
    if (frequency && Number(frequency.exposureCount) >= env.BOOST_MAX_FREQUENCY_PER_VISITOR_PER_DAY) continue;
    const opportunity = await createImpressionOpportunity({ campaignId: row.campaign.id, siteId: row.campaign.siteId, placementKey: row.campaign.placementKey as BoostPlacementKey, creativeVersion: row.campaign.creativeVersion, visitorContextHash: input.visitorContextHash, routeContext: input.routeContext, expiresAt: new Date(Date.now() + 5 * 60 * 1000) });
    const clickToken = signClickToken({ v: 1, kind: "click", campaignId: row.campaign.id, siteId: row.campaign.siteId, siteSlug: row.siteSlug, placementKey: row.campaign.placementKey, creativeVersion: row.campaign.creativeVersion, visitorContextHash: input.visitorContextHash, destinationUrl: row.campaign.destinationUrl ?? `https://${row.siteDomain}`, issuedAt: Date.now(), expiresAt: Date.now() + 5 * 60 * 1000 });
    return { isDemo: false, campaignId: row.campaign.id, siteId: row.campaign.siteId, siteSlug: row.siteSlug, siteName: row.siteName, domain: row.siteDomain, description: row.siteDescription, logoUrl: row.siteLogo, verification: row.siteVerification, placementKey: row.campaign.placementKey, creativeVersion: row.campaign.creativeVersion, headline: row.campaign.headline, descriptionText: row.campaign.shortDescription, ctaLabel: row.campaign.ctaLabel, destinationUrl: row.campaign.destinationUrl, impressionToken: opportunity.token, clickToken };
  }
  return null;
}

export function parseServedImpressionToken(token: string) {
  return verifyImpressionToken(token);
}
