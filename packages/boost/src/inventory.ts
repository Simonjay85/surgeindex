import type { InventoryForecast, InventoryForecastInput } from "./types";

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function forecastInventory(input: InventoryForecastInput): InventoryForecast {
  const generatedAt = input.generatedAt ?? new Date();
  const expiresAt = input.expiresAt ?? new Date(generatedAt.getTime() + 15 * 60 * 1000);
  if (!Number.isFinite(input.estimatedOpportunities) || !Number.isFinite(input.requestedImpressions) || input.estimatedOpportunities < 0 || input.requestedImpressions <= 0) {
    return {
      status: "unknown",
      estimatedOpportunities: 0,
      estimatedQualifiedImpressions: 0,
      reservedImpressions: Math.max(0, input.reservedImpressions),
      availableImpressions: 0,
      confidence: "low",
      generatedAt: generatedAt.toISOString(),
      expiresAt: expiresAt.toISOString(),
    };
  }
  const viewabilityRate = clamp(input.qualifiedViewabilityRate, 0, 1);
  const safetyMargin = clamp(input.safetyMargin, 0, 0.95);
  const estimatedQualifiedImpressions = Math.max(0, Math.floor(input.estimatedOpportunities * viewabilityRate));
  const safeCapacity = Math.max(0, Math.floor(estimatedQualifiedImpressions * (1 - safetyMargin)));
  const availableImpressions = Math.max(0, safeCapacity - Math.max(0, input.reservedImpressions));
  const confidence = viewabilityRate >= 0.6 && safetyMargin <= 0.2 ? "high" : viewabilityRate >= 0.35 ? "medium" : "low";
  const status = availableImpressions >= input.requestedImpressions
    ? "available"
    : availableImpressions > 0
      ? "limited"
      : "unavailable";
  return {
    status,
    estimatedOpportunities: Math.floor(input.estimatedOpportunities),
    estimatedQualifiedImpressions,
    reservedImpressions: Math.max(0, Math.floor(input.reservedImpressions)),
    availableImpressions,
    confidence,
    generatedAt: generatedAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
  };
}
