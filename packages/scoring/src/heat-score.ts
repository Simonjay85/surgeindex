import {
  DEFAULT_SCORING_CONFIG,
  SCORING_CONFIG_VERSION,
  type FreshnessState,
  type RankingState,
  type ScoringConfig,
  type ScoringLeague,
  type ScoreComponentName,
} from "./config";

/**
 * Heat Score v1 is deliberately pure. It receives accepted aggregate facts,
 * never boost/payment records, and returns an auditable component breakdown.
 */
export const SCORE_VERSION = SCORING_CONFIG_VERSION;
export const SCORE_WEIGHTS = DEFAULT_SCORING_CONFIG.weights;
export type League = ScoringLeague;

export interface HeatScoreInput {
  /** Verified unique visitors in the last 24h; null when unverified. */
  visitors24h: number | null;
  /** Site's own expected daily visitor level. */
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
  /** Legacy residual suspicion multiplier, retained for compatibility. */
  fraudPenalty: number;
  domainOwnershipVerified: boolean;
  visitors7d?: number | null;
  acceptedEvents24h?: number;
  suspectedEvents24h?: number;
  invalidEvents24h?: number;
  baselineSampleCount?: number;
  baselineConfidence?: number;
  dataCompleteness?: number;
  completedDataDays?: number;
  suspicionRatio?: number;
  freshnessState?: FreshnessState;
  previousSmoothedScore?: number | null;
  previousLeague?: League | null;
  rankingState?: RankingState | null;
  siteStatus?: "pending" | "active" | "suspended" | "rejected";
  fraudReview?: boolean;
}

export interface HeatScoreBreakdown {
  growthVelocity: number;
  liveAcceleration: number;
  trafficVolume: number;
  engagementQuality: number;
  trustConfidence: number;
}

export interface ScoreComponentExplanation {
  name: ScoreComponentName;
  normalizedValue: number;
  weight: number;
  contribution: number;
  available: boolean;
  detail: string;
}

export interface HeatScoreResult {
  score: number;
  rawScore: number;
  smoothedScore: number;
  displayedScore: number;
  version: string;
  league: League;
  state: RankingState;
  freshness: FreshnessState;
  confidence: number;
  breakdown: HeatScoreBreakdown;
  components: ScoreComponentExplanation[];
  penalties: Array<{ code: string; amount: number; detail: string }>;
  notes: string[];
  reasonCodes: string[];
  relativeLift: number | null;
  absoluteLift: number | null;
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function round4(n: number): number {
  return Math.round(n * 10_000) / 10_000;
}

function freshnessFor(input: HeatScoreInput, config: ScoringConfig): FreshnessState {
  if (input.verification === "unverified") return "offline";
  if (input.freshnessState) return input.freshnessState;
  const age = input.dataFreshnessSeconds;
  if (age == null) return "delayed";
  if (age <= config.freshness.liveSeconds) return "live";
  if (age <= config.freshness.freshSeconds) return "fresh";
  if (age <= config.freshness.delayedSeconds) return "delayed";
  if (age <= config.freshness.staleSeconds) return "stale";
  return "offline";
}

function suspicionRatioFor(input: HeatScoreInput): number {
  if (input.suspicionRatio != null) return clamp(input.suspicionRatio, 0, 1);
  const accepted = Math.max(0, input.acceptedEvents24h ?? 0);
  const suspected = Math.max(0, input.suspectedEvents24h ?? 0);
  const invalid = Math.max(0, input.invalidEvents24h ?? 0);
  const total = accepted + suspected + invalid;
  return total ? clamp(suspected / total, 0, 1) : clamp(input.fraudPenalty, 0, 1);
}

function growthSignal(input: HeatScoreInput, notes: string[], config: ScoringConfig): { score: number; available: boolean; relativeLift: number | null; absoluteLift: number | null; detail: string } {
  const current = input.visitors24h;
  const baseline = input.baselineDailyVisitors;
  if (current == null || baseline == null) {
    notes.push("No growth signal: missing verified traffic or baseline.");
    return { score: 20, available: false, relativeLift: null, absoluteLift: null, detail: "Baseline or accepted visitors are not available." };
  }
  const actual = Math.max(0, current);
  const expected = Math.max(0, baseline);
  const absoluteLift = Math.max(0, actual - expected);
  const relativeLift = actual / Math.max(expected, 10);
  if (actual <= config.eligibility.minimumVisitors24h) {
    notes.push(`Below minimum volume threshold (${config.eligibility.minimumVisitors24h} visitors/24h) — growth is not trusted yet.`);
    return { score: 0, available: true, relativeLift, absoluteLift, detail: "The absolute sample is too small to trust a growth spike." };
  }
  const relativeSignal = clamp(Math.log1p(Math.max(0, relativeLift - 1)) / Math.log1p(5), 0, 1);
  const absoluteSignal = clamp(Math.log1p(absoluteLift) / Math.log1p(50_000), 0, 1);
  const baseSupport = clamp(Math.log1p(Math.max(expected, 1)) / Math.log1p(2_000), 0, 1);
  const confidence = clamp(input.baselineConfidence ?? baseSupport, 0, 1);
  if (confidence < 1) notes.push(`Growth confidence reduced to ${Math.round(confidence * 100)}% by baseline support.`);
  const score = 100 * (relativeSignal * 0.45 + absoluteSignal * 0.4 + baseSupport * 0.15) * (0.65 + confidence * 0.35);
  const detail = `${actual.toLocaleString()} visitors versus an expected ${expected.toLocaleString()} (${relativeLift.toFixed(1)}×; ${Math.round(absoluteLift).toLocaleString()} additional visitors).`;
  return { score: clamp(score, 0, 100), available: true, relativeLift, absoluteLift, detail };
}

function liveSignal(input: HeatScoreInput, notes: string[]): { score: number; available: boolean; detail: string } {
  const { activeNow, typicalActiveNow } = input;
  if (activeNow == null || typicalActiveNow == null) {
    notes.push("No live acceleration signal for this data source.");
    return { score: 35, available: false, detail: "Realtime activity is not supported by this connected source." };
  }
  const active = Math.max(0, activeNow);
  const typical = Math.max(0, typicalActiveNow);
  if (typical === 0) {
    const score = active > 10 ? 80 : active > 0 ? 55 : 35;
    return { score, available: true, detail: `${active} active visitors against a zero or unavailable typical level.` };
  }
  const ratio = active / typical;
  const relative = clamp(Math.log1p(Math.max(0, ratio - 1)) / Math.log1p(4), 0, 1);
  const absolute = clamp(Math.log1p(Math.max(0, active - typical)) / Math.log1p(1_000), 0, 1);
  const score = ratio < 1 ? clamp(45 - (1 - ratio) * 35, 0, 100) : clamp(42 + relative * 43 + absolute * 15, 0, 100);
  return { score, available: true, detail: `${active} active visitors versus a typical ${typical} (${ratio.toFixed(1)}×).` };
}

function volumeSignal(input: HeatScoreInput, notes: string[]): { score: number; available: boolean; detail: string } {
  if (input.visitors24h == null || input.verification === "unverified") {
    notes.push("Traffic volume is not scored without verified data.");
    return { score: 0, available: false, detail: "No accepted verified visitor volume is available." };
  }
  const score = clamp(Math.log1p(Math.max(0, input.visitors24h)) / Math.log1p(200_000) * 100, 0, 100);
  return { score, available: true, detail: `${Math.max(0, input.visitors24h).toLocaleString()} accepted unique visitors in the 24-hour window.` };
}

function engagementSignal(input: HeatScoreInput, notes: string[]): { score: number; available: boolean; detail: string } {
  const rate = input.engagementRate;
  const seconds = input.avgEngagementSeconds;
  if (rate == null && seconds == null) {
    notes.push("Engagement metrics unavailable — neutral score applied with a confidence adjustment.");
    return { score: 50, available: false, detail: "The connected source does not expose supported engagement metrics." };
  }
  const parts: number[] = [];
  if (rate != null) parts.push(clamp(rate, 0, 1) * 100);
  if (seconds != null) parts.push(clamp(seconds / 180, 0, 1) * 100);
  return {
    score: parts.reduce((sum, value) => sum + value, 0) / parts.length,
    available: true,
    detail: `${rate == null ? "Engagement rate unavailable" : `${Math.round(rate * 100)}% engaged sessions`}; ${seconds == null ? "duration unavailable" : `${Math.round(seconds)}s average visible engagement`}.`,
  };
}

function trustSignal(input: HeatScoreInput, freshness: FreshnessState, baselineConfidence: number, dataCompleteness: number, notes: string[], config: ScoringConfig): { score: number; detail: string } {
  let score = input.verification === "tracker" ? 100 : input.verification === "ga4" ? 85 : 20;
  if (input.verification === "unverified") notes.push("Traffic is unverified — data confidence is low.");
  if (input.domainOwnershipVerified) score += 5;
  if (freshness === "delayed") score *= config.penalties.delayedConfidenceMultiplier;
  if (freshness === "stale") score *= 0.45;
  if (freshness === "offline") score *= 0.15;
  score *= 0.55 + clamp(baselineConfidence, 0, 1) * 0.3 + clamp(dataCompleteness, 0, 1) * 0.15;
  return { score: clamp(score, 0, 100), detail: `${input.verification === "unverified" ? "Unverified" : input.verification.toUpperCase()} source, ${freshness} freshness, ${Math.round(baselineConfidence * 100)}% baseline confidence.` };
}

function determineLeague(input: HeatScoreInput, config: ScoringConfig): League {
  const days = input.completedDataDays ?? 0;
  const visitors7d = input.visitors7d ?? input.visitors24h ?? 0;
  const previous = input.previousLeague ?? null;
  if (previous === "established" && days >= config.leagues.establishedMinimumDays && visitors7d >= config.leagues.establishedDowngradeVisitors7d) return "established";
  if (previous === "emerging" && days >= config.leagues.emergingMinimumDays && visitors7d >= config.leagues.emergingMaximumVisitors7d * 0.8) return "emerging";
  if (days < config.leagues.emergingMinimumDays || visitors7d < config.eligibility.provisionalMinimumVisitors7d) return "new";
  if (days >= config.leagues.establishedMinimumDays && visitors7d >= config.leagues.establishedMinimumVisitors7d) return "established";
  return "emerging";
}

function determineState(input: HeatScoreInput, freshness: FreshnessState, confidence: number, baselineReady: boolean, suspicionRatio: number, config: ScoringConfig): { state: RankingState; reasonCodes: string[] } {
  const reasons: string[] = [];
  if (input.siteStatus === "suspended" || input.siteStatus === "rejected") return { state: "suspended", reasonCodes: ["site_suspended"] };
  if (input.verification === "unverified") return { state: "unverified", reasonCodes: ["traffic_not_verified"] };
  if (input.fraudReview || suspicionRatio >= config.eligibility.maximumSuspicionRatio) return { state: "fraud_review", reasonCodes: ["fraud_review_required"] };
  if (freshness === "stale" || freshness === "offline") return { state: "stale", reasonCodes: ["source_stale"] };
  if (!baselineReady || (input.baselineSampleCount ?? 0) < config.eligibility.provisionalMinimumBaselineSamples) return { state: "building_baseline", reasonCodes: ["baseline_insufficient"] };
  if ((input.completedDataDays ?? 0) < config.eligibility.eligibleMinimumDays || confidence < config.eligibility.minimumConfidenceForEligible || (input.visitors7d ?? input.visitors24h ?? 0) < config.eligibility.eligibleMinimumVisitors7d) {
    reasons.push("confidence_or_history_below_full_threshold");
    return { state: "provisional", reasonCodes: reasons };
  }
  if (input.visitors24h != null && input.visitors24h < config.eligibility.minimumVisitors24h) reasons.push("low_current_volume");
  return { state: reasons.length ? "provisional" : "eligible", reasonCodes: reasons };
}

function scoreCap(state: RankingState, config: ScoringConfig): number {
  if (state === "provisional") return config.penalties.provisionalScoreCap;
  if (state === "stale") return config.penalties.staleScoreCap;
  if (state === "fraud_review") return config.penalties.fraudReviewScoreCap;
  if (["unverified", "building_baseline", "suspended", "ineligible"].includes(state)) return 0;
  return 100;
}

function smoothing(raw: number, previous: number | null | undefined, config: ScoringConfig): number {
  if (previous == null || !Number.isFinite(previous)) return raw;
  const delta = raw - previous;
  const alpha = Math.abs(delta) >= config.smoothing.majorSurgeDelta ? Math.max(config.smoothing.alpha, 0.8) : config.smoothing.alpha;
  return previous + delta * alpha;
}

export function scoreSite(input: HeatScoreInput, config: ScoringConfig = DEFAULT_SCORING_CONFIG): HeatScoreResult {
  const notes: string[] = [];
  const scoringInput: HeatScoreInput = {
    ...input,
    baselineConfidence: input.baselineConfidence ?? (input.baselineDailyVisitors == null ? 0 : 1),
    dataCompleteness: input.dataCompleteness ?? (input.baselineDailyVisitors == null ? 0 : 1),
    baselineSampleCount: input.baselineSampleCount ?? (input.baselineDailyVisitors == null ? 0 : config.eligibility.eligibleMinimumBaselineSamples),
    completedDataDays: input.completedDataDays ?? (input.baselineDailyVisitors == null ? 0 : config.eligibility.eligibleMinimumDays),
  };
  const freshness = freshnessFor(scoringInput, config);
  const baselineConfidence = clamp(scoringInput.baselineConfidence ?? 0, 0, 1);
  const dataCompleteness = clamp(scoringInput.dataCompleteness ?? 0, 0, 1);
  const suspicionRatio = suspicionRatioFor(scoringInput);
  const growth = growthSignal(scoringInput, notes, config);
  const live = liveSignal(scoringInput, notes);
  const volume = volumeSignal(scoringInput, notes);
  const engagement = engagementSignal(scoringInput, notes);
  const trust = trustSignal(scoringInput, freshness, baselineConfidence, dataCompleteness, notes, config);
  const breakdown: HeatScoreBreakdown = {
    growthVelocity: round1(growth.score),
    liveAcceleration: round1(live.score),
    trafficVolume: round1(volume.score),
    engagementQuality: round1(engagement.score),
    trustConfidence: round1(trust.score),
  };
  const componentInputs: Array<[ScoreComponentName, number, boolean, string]> = [
    ["growthVelocity", breakdown.growthVelocity, growth.available, growth.detail],
    ["liveAcceleration", breakdown.liveAcceleration, live.available, live.detail],
    ["trafficVolume", breakdown.trafficVolume, volume.available, volume.detail],
    ["engagementQuality", breakdown.engagementQuality, engagement.available, engagement.detail],
    ["trustConfidence", breakdown.trustConfidence, true, trust.detail],
  ];
  const components = componentInputs.map(([name, normalizedValue, available, detail]) => ({
    name,
    normalizedValue,
    weight: config.weights[name],
    contribution: round1(normalizedValue * config.weights[name]),
    available,
    detail,
  }));
  const baseRaw = components.reduce((sum, component) => sum + component.normalizedValue * component.weight, 0);
  const penalties: HeatScoreResult["penalties"] = [];
  if (suspicionRatio > 0.05) penalties.push({ code: "suspected_traffic", amount: clamp(suspicionRatio * 0.6, 0, 0.6), detail: "A portion of recent traffic requires quality review." });
  if (!engagement.available) penalties.push({ code: "engagement_unavailable", amount: 1 - config.penalties.missingEngagementConfidenceMultiplier, detail: "Engagement was not available from the connected source." });
  if (freshness === "stale" || freshness === "offline") penalties.push({ code: "stale_data", amount: 0.25, detail: "Freshness limits the score until valid data resumes." });
  if (scoringInput.fraudPenalty > 0) {
    penalties.push({ code: "legacy_fraud_penalty", amount: clamp(scoringInput.fraudPenalty, 0, 1), detail: "A persisted traffic-quality penalty was applied." });
    notes.push(`Fraud/suspicion penalty applied (${Math.round(scoringInput.fraudPenalty * 100)}%).`);
  }
  const penaltyAmount = clamp(penalties.reduce((sum, penalty) => sum + penalty.amount, 0), 0, 0.8);
  const rawScore = clamp(baseRaw * (1 - penaltyAmount), 0, 100);
  const stateResult = determineState(scoringInput, freshness, trust.score / 100, baselineConfidence > 0 && (scoringInput.baselineSampleCount ?? 0) >= config.baseline.rollingMinimumSamples, suspicionRatio, config);
  const league = determineLeague(scoringInput, config);
  const smoothedScore = clamp(smoothing(rawScore, scoringInput.previousSmoothedScore, config), 0, 100);
  const displayedScore = Math.round(Math.min(smoothedScore, scoreCap(stateResult.state, config)));
  if (stateResult.state === "building_baseline") notes.push("Building baseline: more accepted history is required before a public score is shown.");
  if (stateResult.state === "provisional") notes.push("Provisional score: the site can participate in its league while confidence grows.");
  if (stateResult.state === "stale") notes.push("Data stale: historical records remain, but the live score is capped.");
  return {
    score: displayedScore,
    rawScore: round4(rawScore),
    smoothedScore: round4(smoothedScore),
    displayedScore,
    version: config.version,
    league,
    state: stateResult.state,
    freshness,
    confidence: round4(trust.score / 100),
    breakdown,
    components,
    penalties,
    notes,
    reasonCodes: stateResult.reasonCodes,
    relativeLift: growth.relativeLift,
    absoluteLift: growth.absoluteLift,
  };
}

/** Backwards-compatible public helper used by demo fixtures and existing UI. */
export function computeHeatScore(input: HeatScoreInput): HeatScoreResult {
  return scoreSite(input);
}

export interface RankableSite {
  heatScore: number;
  visitors24h: number | null;
  growthPct: number | null;
  domain: string;
}

/** Legacy comparator retained for callers outside the ranking job. */
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
