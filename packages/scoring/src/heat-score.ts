/**
 * Heat Score — the SurgeIndex organic attention score.
 *
 * Pure, deterministic, versioned, and explainable. Paid spend NEVER enters
 * this function. The score blends five dimensions on normalized inputs with
 * small-base protection (log transforms, winsorization, minimum volume
 * thresholds, and confidence weighting).
 */

export const SCORE_VERSION = "v1";

export const SCORE_WEIGHTS = {
  growthVelocity: 0.35,
  liveAcceleration: 0.25,
  trafficVolume: 0.2,
  engagementQuality: 0.1,
  trustConfidence: 0.1,
} as const;

/** Winsorization caps — extreme raw percentages cannot dominate. */
const MAX_GROWTH_PCT = 600;
/** Daily visitor baselines above this get full growth confidence. */
const FULL_CONFIDENCE_BASELINE = 2_000;
/** Daily visitors at/above this score 100 on the volume dimension. */
const FULL_VOLUME_VISITORS = 200_000;
/** Minimum 24h visitors before growth is trusted at all. */
const MIN_VISITORS_FOR_GROWTH = 20;

export type League = "new" | "emerging" | "established";

export interface HeatScoreInput {
  /** Verified unique visitors in the last 24h. null when unverified. */
  visitors24h: number | null;
  /** Site's own baseline: average daily visitors over the prior 7 days. */
  baselineDailyVisitors: number | null;
  /** Live concurrent active users right now (tracker only). */
  activeNow: number | null;
  /** This site's typical concurrent level at this time of day. */
  typicalActiveNow: number | null;
  /** Engaged sessions / total sessions, 0..1. */
  engagementRate: number | null;
  /** Average engagement time per session, seconds. */
  avgEngagementSeconds: number | null;
  verification: "tracker" | "ga4" | "unverified";
  /** Seconds since the last successful data sync. null = unknown. */
  dataFreshnessSeconds: number | null;
  /** Residual suspicion multiplier 0..1 applied to the final score. */
  fraudPenalty: number;
  domainOwnershipVerified: boolean;
}

export interface HeatScoreBreakdown {
  growthVelocity: number;
  liveAcceleration: number;
  trafficVolume: number;
  engagementQuality: number;
  trustConfidence: number;
}

export interface HeatScoreResult {
  score: number;
  version: string;
  league: League;
  breakdown: HeatScoreBreakdown;
  notes: string[];
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function growthSubscore(input: HeatScoreInput, notes: string[]): number {
  const { visitors24h, baselineDailyVisitors } = input;
  if (visitors24h === null || baselineDailyVisitors === null) {
    notes.push("No growth signal: missing verified traffic or baseline.");
    return 20; // neutral-low; trust dimension carries the penalty
  }
  if (visitors24h <= MIN_VISITORS_FOR_GROWTH) {
    notes.push(
      `Below minimum volume threshold (${MIN_VISITORS_FOR_GROWTH} visitors/24h) — growth is not trusted yet.`,
    );
    return 0;
  }
  const growthPct =
    baselineDailyVisitors <= 0
      ? MAX_GROWTH_PCT
      : clamp(((visitors24h - baselineDailyVisitors) / baselineDailyVisitors) * 100, -100, MAX_GROWTH_PCT);
  // Small-base protection: growth confidence scales with baseline volume.
  const confidence = clamp(
    Math.log1p(baselineDailyVisitors) / Math.log1p(FULL_CONFIDENCE_BASELINE),
    0,
    1,
  );
  if (confidence < 1) {
    notes.push(
      `Growth confidence reduced to ${Math.round(confidence * 100)}% because the baseline is small.`,
    );
  }
  // -100%..+600% mapped to 0..100, then confidence-weighted.
  return clamp((growthPct + 100) / 7, 0, 100) * confidence;
}

function liveSubscore(input: HeatScoreInput, notes: string[]): number {
  const { activeNow, typicalActiveNow } = input;
  if (activeNow === null || typicalActiveNow === null) {
    notes.push("No live acceleration signal for this data source.");
    return 35; // GA4-only sites are not punished for lacking realtime data
  }
  if (typicalActiveNow <= 0) return activeNow > 10 ? 90 : 50;
  const ratio = activeNow / typicalActiveNow;
  // A site tracking its normal concurrent baseline should remain healthy,
  // rather than reading as a 20/100 "acceleration" signal. Surges still
  // climb quickly above the baseline, while sub-baseline traffic declines.
  return clamp((ratio - 0.5) * 40 + 20, 0, 100);
}

function volumeSubscore(input: HeatScoreInput, notes: string[]): number {
  const { visitors24h, verification } = input;
  if (visitors24h === null || verification === "unverified") {
    notes.push("Traffic volume is not scored without verified data.");
    return 0;
  }
  // Logarithmic normalization so large traffic matters without permanently
  // dominating the leaderboard.
  return clamp((Math.log1p(visitors24h) / Math.log1p(FULL_VOLUME_VISITORS)) * 100, 0, 100);
}

function engagementSubscore(input: HeatScoreInput, notes: string[]): number {
  const { engagementRate, avgEngagementSeconds } = input;
  if (engagementRate === null && avgEngagementSeconds === null) {
    notes.push("Engagement metrics unavailable — neutral score applied.");
    return 50;
  }
  let subscore = 0;
  let parts = 0;
  if (engagementRate !== null) {
    subscore += clamp(engagementRate, 0, 1) * 80;
    parts += 1;
  }
  if (avgEngagementSeconds !== null) {
    subscore += clamp(avgEngagementSeconds / 180, 0, 1) * 20;
    parts += 1;
  }
  return parts === 0 ? 50 : subscore / parts;
}

function trustSubscore(input: HeatScoreInput, notes: string[]): number {
  const { verification, dataFreshnessSeconds, domainOwnershipVerified } = input;
  let base: number;
  switch (verification) {
    case "tracker":
      base = 100;
      break;
    case "ga4":
      base = 85;
      break;
    default:
      base = 25;
      notes.push("Traffic is unverified — data confidence is low.");
  }
  if (dataFreshnessSeconds !== null) {
    if (dataFreshnessSeconds > 86_400) base -= 60;
    else if (dataFreshnessSeconds > 21_600) base -= 40;
    else if (dataFreshnessSeconds > 3_600) base -= 20;
  }
  if (domainOwnershipVerified) base += 5;
  return clamp(base, 0, 100);
}

function leagueFor(visitors24h: number | null): League {
  if (visitors24h === null || visitors24h < 500) return "new";
  if (visitors24h < 10_000) return "emerging";
  return "established";
}

/** Compute the Heat Score. Deterministic: same input, same output, always. */
export function computeHeatScore(input: HeatScoreInput): HeatScoreResult {
  const notes: string[] = [];
  const breakdown: HeatScoreBreakdown = {
    growthVelocity: round1(growthSubscore(input, notes)),
    liveAcceleration: round1(liveSubscore(input, notes)),
    trafficVolume: round1(volumeSubscore(input, notes)),
    engagementQuality: round1(engagementSubscore(input, notes)),
    trustConfidence: round1(trustSubscore(input, notes)),
  };
  const raw =
    breakdown.growthVelocity * SCORE_WEIGHTS.growthVelocity +
    breakdown.liveAcceleration * SCORE_WEIGHTS.liveAcceleration +
    breakdown.trafficVolume * SCORE_WEIGHTS.trafficVolume +
    breakdown.engagementQuality * SCORE_WEIGHTS.engagementQuality +
    breakdown.trustConfidence * SCORE_WEIGHTS.trustConfidence;
  const penalty = clamp(input.fraudPenalty, 0, 1);
  const penalized = raw * (1 - 0.8 * penalty);
  if (penalty > 0) {
    notes.push(`Fraud/suspicion penalty applied (${Math.round(penalty * 100)}%).`);
  }
  return {
    score: Math.round(clamp(penalized, 0, 100)),
    version: SCORE_VERSION,
    league: leagueFor(input.visitors24h),
    breakdown,
    notes,
  };
}

/**
 * Deterministic ranking comparator: Heat Score desc, then verified visitors
 * desc, then growth desc, then domain asc. Used for global and category ranks.
 */
export interface RankableSite {
  heatScore: number;
  visitors24h: number | null;
  growthPct: number | null;
  domain: string;
}

export function compareForRanking(a: RankableSite, b: RankableSite): number {
  if (b.heatScore !== a.heatScore) return b.heatScore - a.heatScore;
  const av = a.visitors24h ?? -1;
  const bv = b.visitors24h ?? -1;
  if (bv !== av) return bv - av;
  const ag = a.growthPct ?? -Infinity;
  const bg = b.growthPct ?? -Infinity;
  if (bg !== ag) return bg - ag;
  return a.domain < b.domain ? -1 : a.domain > b.domain ? 1 : 0;
}
