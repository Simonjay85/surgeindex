import { buildBoostReport, deliveryPacing, forecastInventory, qualifiesViewability } from "@surge/boost";

const forecast = forecastInventory({ estimatedOpportunities: 250_000, qualifiedViewabilityRate: 0.6, reservedImpressions: 20_000, requestedImpressions: 35_000, safetyMargin: 0.15 });
const report = buildBoostReport({ targetQualifiedImpressions: 35_000, qualifiedImpressions: 17_500, renderedImpressions: 22_000, invalidImpressions: 1_200, clicks: 700, validClicks: 650, uniqueClicks: 590, attributedVisits: null, attributedEngagedVisits: null, amountPaidCents: 39_900, currency: "USD" });
const pacing = deliveryPacing({ targetQualifiedImpressions: 35_000, qualifiedImpressionsDelivered: 17_500, startsAt: new Date("2026-08-01T00:00:00Z"), endsAt: new Date("2026-08-15T00:00:00Z"), now: new Date("2026-08-08T00:00:00Z"), maxOverdeliveryPercent: 10 });
console.log(JSON.stringify({ mode: "fixture", demoDeliveryOnly: true, paidDoesNotEnterOrganicScore: true, viewability: qualifiesViewability({ visiblePercent: 50, visibleMilliseconds: 1000, requiredPercent: 50, requiredMilliseconds: 1000 }), forecast, pacing, report }, null, 2));
