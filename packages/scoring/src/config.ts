/**
 * Versioned scoring configuration. Keep thresholds here so the product and
 * scheduled jobs use one contract instead of duplicating numbers in routes.
 */
export const SCORING_CONFIG_VERSION = "heat-v1";

export const DEFAULT_SCORING_CONFIG = {
  version: SCORING_CONFIG_VERSION,
  weights: {
    growthVelocity: 0.35,
    liveAcceleration: 0.25,
    trafficVolume: 0.2,
    engagementQuality: 0.1,
    trustConfidence: 0.1,
  },
  baseline: {
    lookbackDays: 28,
    sameWeekdayHourMinimumSamples: 3,
    sameHourMinimumSamples: 4,
    rollingMinimumSamples: 3,
    targetSamples: 7,
  },
  eligibility: {
    minimumVisitors24h: 20,
    provisionalMinimumDays: 3,
    eligibleMinimumDays: 14,
    provisionalMinimumBaselineSamples: 3,
    eligibleMinimumBaselineSamples: 7,
    provisionalMinimumVisitors7d: 100,
    eligibleMinimumVisitors7d: 500,
    minimumConfidenceForEligible: 0.65,
    maximumSuspicionRatio: 0.2,
  },
  leagues: {
    newMaximumDays: 7,
    emergingMinimumDays: 7,
    establishedMinimumDays: 14,
    emergingMaximumVisitors7d: 50_000,
    establishedMinimumVisitors7d: 50_000,
    establishedDowngradeVisitors7d: 40_000,
    hysteresisDays: 2,
  },
  freshness: {
    liveSeconds: 120,
    freshSeconds: 6 * 60 * 60,
    delayedSeconds: 24 * 60 * 60,
    staleSeconds: 48 * 60 * 60,
  },
  smoothing: {
    alpha: 0.7,
    majorSurgeDelta: 20,
  },
  penalties: {
    staleScoreCap: 60,
    delayedConfidenceMultiplier: 0.85,
    provisionalScoreCap: 79,
    fraudReviewScoreCap: 45,
    missingEngagementConfidenceMultiplier: 0.95,
  },
  breakout: {
    version: "breakout-v1",
    minimumRelativeLift: 2.5,
    minimumAbsoluteLift: 50,
    minimumLiveRatio: 1.5,
    persistenceMinutes: 15,
    resolutionRelativeLift: 1.4,
    resolutionMinutes: 30,
    cooldownMinutes: 60,
    exceptionalRelativeLift: 4,
    exceptionalLiveRatio: 2,
  },
} as const;

export type ScoringConfig = typeof DEFAULT_SCORING_CONFIG;

export type RankingState =
  | "unverified"
  | "building_baseline"
  | "provisional"
  | "eligible"
  | "stale"
  | "suspended"
  | "fraud_review"
  | "ineligible";

export type FreshnessState = "live" | "fresh" | "delayed" | "stale" | "offline";

export type ScoringLeague = "new" | "emerging" | "established";

export type ScoreComponentName =
  | "growthVelocity"
  | "liveAcceleration"
  | "trafficVolume"
  | "engagementQuality"
  | "trustConfidence";

export function cloneScoringConfig(): ScoringConfig {
  // The config is immutable by convention and contains only primitives.
  // Returning it keeps this package compatible with the repository's ES2022
  // type target without depending on a runtime structuredClone global.
  return DEFAULT_SCORING_CONFIG;
}
