import type { BoostReport, BoostReportInput } from "./types";

function rate(numerator: number | null | undefined, denominator: number | null | undefined): number | null {
  if (numerator == null || denominator == null || denominator <= 0) return null;
  return numerator / denominator;
}

function cost(amountCents: number, denominator: number | null | undefined): number | null {
  if (denominator == null || denominator <= 0) return null;
  return amountCents / denominator;
}

export function buildBoostReport(input: BoostReportInput): BoostReport {
  const target = Math.max(0, input.targetQualifiedImpressions);
  const qualified = Math.max(0, input.qualifiedImpressions);
  const validClicks = Math.max(0, input.validClicks);
  const visits = input.attributedVisits == null ? null : Math.max(0, input.attributedVisits);
  const engaged = input.attributedEngagedVisits == null ? null : Math.max(0, input.attributedEngagedVisits);
  return {
    targetQualifiedImpressions: target,
    qualifiedImpressions: qualified,
    renderedImpressions: Math.max(0, input.renderedImpressions),
    invalidImpressions: Math.max(0, input.invalidImpressions),
    remainingQualifiedImpressions: Math.max(0, target - qualified),
    deliveryPercentage: rate(qualified, target) == null ? null : rate(qualified, target)! * 100,
    clicks: Math.max(0, input.clicks),
    validClicks,
    uniqueClicks: Math.max(0, input.uniqueClicks),
    ctr: rate(validClicks, qualified),
    attributedVisits: visits,
    attributedEngagedVisits: engaged,
    clickToVisitRate: rate(visits, validClicks),
    visitToEngagedRate: rate(engaged, visits),
    amountPaidCents: Math.max(0, input.amountPaidCents),
    currency: input.currency,
    effectiveCostPerQualifiedImpressionCents: cost(input.amountPaidCents, qualified),
    effectiveCostPerValidClickCents: cost(input.amountPaidCents, validClicks),
    effectiveCostPerAttributedVisitCents: cost(input.amountPaidCents, visits),
    effectiveCostPerEngagedVisitCents: cost(input.amountPaidCents, engaged),
  };
}
