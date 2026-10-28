import { BOOST_CAMPAIGN_STATES, type BoostCampaignState } from "./types";

const transitions: Record<BoostCampaignState, readonly BoostCampaignState[]> = {
  draft: ["inventory_check", "cancelled"],
  inventory_check: ["awaiting_checkout", "draft", "cancelled"],
  awaiting_checkout: ["inventory_reserved", "checkout_expired", "cancelled"],
  inventory_reserved: ["pending_payment", "checkout_expired", "cancelled"],
  pending_payment: ["payment_processing", "paid", "payment_failed", "checkout_expired", "cancelled"],
  payment_processing: ["paid", "payment_failed", "checkout_expired"],
  paid: ["scheduled", "active", "paid_pending_inventory_review", "cancel_requested", "refund_pending", "disputed", "suspended"],
  paid_pending_inventory_review: ["scheduled", "active", "refund_pending", "cancel_requested", "disputed", "suspended"],
  scheduled: ["active", "delivery_complete", "paused", "cancel_requested", "refund_pending", "disputed", "suspended"],
  active: ["paused", "delivery_complete", "cancel_requested", "refund_pending", "disputed", "suspended"],
  paused: ["scheduled", "active", "cancel_requested", "refund_pending", "disputed", "suspended"],
  delivery_complete: ["completed", "underdelivered", "refund_pending"],
  completed: ["refund_pending", "partially_refunded", "refunded"],
  underdelivered: ["scheduled", "active", "refund_pending", "partially_refunded", "completed"],
  cancel_requested: ["cancelled", "refund_pending", "partially_refunded", "refunded"],
  cancelled: ["refund_pending", "partially_refunded", "refunded"],
  refund_pending: ["partially_refunded", "refunded", "refund_pending"],
  partially_refunded: ["refunded"],
  refunded: [],
  // Allow owners to restart the inventory/checkout flow after a failed or
  // expired attempt without losing the campaign draft. `cancelled` remains an
  // explicit terminal alternative.
  payment_failed: ["pending_payment", "draft", "cancelled"],
  checkout_expired: ["draft", "cancelled"],
  disputed: ["suspended", "refund_pending", "completed"],
  suspended: ["paused", "cancel_requested", "refund_pending", "disputed"],
};

export function isBoostCampaignState(value: string): value is BoostCampaignState {
  return (BOOST_CAMPAIGN_STATES as readonly string[]).includes(value);
}

export function allowedBoostTransitions(state: BoostCampaignState): readonly BoostCampaignState[] {
  return transitions[state];
}

export function canTransitionBoostCampaign(from: BoostCampaignState, to: BoostCampaignState): boolean {
  return transitions[from].includes(to);
}

export function assertBoostTransition(from: BoostCampaignState, to: BoostCampaignState): void {
  if (!canTransitionBoostCampaign(from, to)) {
    throw new Error(`invalid_boost_transition:${from}:${to}`);
  }
}

export function transitionBoostCampaign(from: BoostCampaignState, to: BoostCampaignState): BoostCampaignState {
  assertBoostTransition(from, to);
  return to;
}
