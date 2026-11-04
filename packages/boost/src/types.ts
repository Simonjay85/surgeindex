export const BOOST_PLACEMENTS = [
  "homepage_boosted",
  "category_boosted",
  "ranking_feed_insert",
  "site_profile_recommendation",
  "breakout_sponsor",
] as const;

export type BoostPlacementKey = (typeof BOOST_PLACEMENTS)[number];

export const BOOST_CAMPAIGN_STATES = [
  "draft",
  "inventory_check",
  "awaiting_checkout",
  "inventory_reserved",
  "pending_payment",
  "payment_processing",
  "paid",
  "paid_pending_inventory_review",
  "scheduled",
  "active",
  "paused",
  "delivery_complete",
  "completed",
  "underdelivered",
  "cancel_requested",
  "cancelled",
  "refund_pending",
  "partially_refunded",
  "refunded",
  "payment_failed",
  "checkout_expired",
  "disputed",
  "suspended",
] as const;

export type BoostCampaignState = (typeof BOOST_CAMPAIGN_STATES)[number];

export const BOOST_RESERVATION_STATES = ["held", "confirmed", "released", "expired"] as const;
export type BoostReservationState = (typeof BOOST_RESERVATION_STATES)[number];

export const BOOST_CREATIVE_STATES = ["draft", "pending_review", "approved", "rejected", "suspended"] as const;
export type BoostCreativeState = (typeof BOOST_CREATIVE_STATES)[number];

export const BOOST_IMPRESSION_CLASSIFICATIONS = [
  "opportunity",
  "rendered",
  "qualified",
  "duplicate",
  "invalid",
  "suspected",
  "viewability_failed",
  "expired_token",
  "frequency_capped",
  "owner_self_view",
] as const;
export type BoostImpressionClassification = (typeof BOOST_IMPRESSION_CLASSIFICATIONS)[number];

export type TrafficOrigin =
  | "organic_surgedindex_referral"
  | "paid_surgedindex_referral"
  | "external"
  | "direct";

export interface BoostPackageDefinition {
  id: "starter" | "growth" | "launch" | "custom";
  name: string;
  description: string;
  currency: string;
  amountCents: number | null;
  stripePriceId: string | null;
  targetQualifiedImpressions: number | null;
  eligiblePlacements: BoostPlacementKey[];
  eligibleCategories: string[];
  defaultDurationDays: number;
  maximumDurationDays: number;
  active: boolean;
  displayOrder: number;
}

export interface InventoryForecastInput {
  estimatedOpportunities: number;
  qualifiedViewabilityRate: number;
  reservedImpressions: number;
  requestedImpressions: number;
  safetyMargin: number;
  generatedAt?: Date;
  expiresAt?: Date;
}

export interface InventoryForecast {
  status: "available" | "limited" | "unavailable" | "unknown";
  estimatedOpportunities: number;
  estimatedQualifiedImpressions: number;
  reservedImpressions: number;
  availableImpressions: number;
  confidence: "high" | "medium" | "low";
  generatedAt: string;
  expiresAt: string;
}

export interface DeliveryPacingInput {
  targetQualifiedImpressions: number;
  qualifiedImpressionsDelivered: number;
  startsAt: Date;
  endsAt: Date;
  now: Date;
  maxOverdeliveryPercent: number;
}

export interface DeliveryPacingResult {
  expectedProgress: number;
  actualProgress: number;
  state: "not_started" | "on_track" | "ahead" | "behind" | "complete" | "expired";
  allowedDelivery: boolean;
}

export interface BoostReportInput {
  targetQualifiedImpressions: number;
  qualifiedImpressions: number;
  renderedImpressions: number;
  invalidImpressions: number;
  clicks: number;
  validClicks: number;
  uniqueClicks: number;
  attributedVisits: number | null;
  attributedEngagedVisits: number | null;
  amountPaidCents: number;
  currency: string;
}

export interface BoostReport {
  targetQualifiedImpressions: number;
  qualifiedImpressions: number;
  renderedImpressions: number;
  invalidImpressions: number;
  remainingQualifiedImpressions: number;
  deliveryPercentage: number | null;
  clicks: number;
  validClicks: number;
  uniqueClicks: number;
  ctr: number | null;
  attributedVisits: number | null;
  attributedEngagedVisits: number | null;
  clickToVisitRate: number | null;
  visitToEngagedRate: number | null;
  amountPaidCents: number;
  currency: string;
  effectiveCostPerQualifiedImpressionCents: number | null;
  effectiveCostPerValidClickCents: number | null;
  effectiveCostPerAttributedVisitCents: number | null;
  effectiveCostPerEngagedVisitCents: number | null;
}
