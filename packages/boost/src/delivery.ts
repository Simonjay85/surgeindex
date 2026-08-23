import type { DeliveryPacingInput, DeliveryPacingResult } from "./types";

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function deliveryPacing(input: DeliveryPacingInput): DeliveryPacingResult {
  const duration = input.endsAt.getTime() - input.startsAt.getTime();
  const elapsed = input.now.getTime() - input.startsAt.getTime();
  if (input.targetQualifiedImpressions <= 0) return { expectedProgress: 1, actualProgress: 1, state: "complete", allowedDelivery: false };
  if (elapsed <= 0) return { expectedProgress: 0, actualProgress: input.qualifiedImpressionsDelivered / input.targetQualifiedImpressions, state: "not_started", allowedDelivery: false };
  if (input.now.getTime() >= input.endsAt.getTime()) {
    const actualProgress = clamp(input.qualifiedImpressionsDelivered / input.targetQualifiedImpressions, 0, 2);
    return { expectedProgress: 1, actualProgress, state: actualProgress >= 1 ? "complete" : "expired", allowedDelivery: false };
  }
  const expectedProgress = clamp(elapsed / Math.max(duration, 1), 0, 1);
  const actualProgress = clamp(input.qualifiedImpressionsDelivered / input.targetQualifiedImpressions, 0, 2);
  const tolerance = Math.max(0, input.maxOverdeliveryPercent) / 100;
  const state = actualProgress >= 1 ? "complete" : actualProgress > expectedProgress + tolerance ? "ahead" : actualProgress + tolerance < expectedProgress ? "behind" : "on_track";
  return { expectedProgress, actualProgress, state, allowedDelivery: state !== "ahead" && state !== "complete" };
}

export function qualifiesViewability(input: { visiblePercent: number; visibleMilliseconds: number; requiredPercent: number; requiredMilliseconds: number }): boolean {
  return input.visiblePercent >= input.requiredPercent && input.visibleMilliseconds >= input.requiredMilliseconds;
}
