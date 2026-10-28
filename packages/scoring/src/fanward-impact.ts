import type { RankingState, ScoreComponentName } from "./config";

export const FANWARD_IMPACT_VERSION = "fanward-impact-v1" as const;

export type FanwardImpactSource = "tracker" | "ga4";
export type FanwardImpactComponentName =
  | "verifiedReach"
  | "attentionMomentum"
  | "engagementQuality"
  | "trustConfidence";

export interface FanwardSiteScoreComponentInput {
  normalizedValue: number;
  available: boolean;
}

export interface FanwardImpactInput {
  /** False unless the site is active, claimed, non-demo, and exactly owner-linked. */
  eligible: boolean;
  verification: FanwardImpactSource | "unverified";
  rankingState: RankingState;
  sourceConfidence: number;
  sourceVersion: string;
  source: FanwardImpactSource;
  updatedAt: Date | string;
  components: Partial<Record<ScoreComponentName, FanwardSiteScoreComponentInput>>;
}

export interface FanwardImpactComponent {
  score: number | null;
  available: boolean;
  /** Weight in fanward-impact-v1 before missing-evidence normalization. */
  configuredWeight: number;
  /** Effective weight in this result; public scored results sum to exactly 1. */
  appliedWeight: number;
}

export interface FanwardImpactResult {
  score: number | null;
  state: RankingState;
  confidence: number;
  version: typeof FANWARD_IMPACT_VERSION;
  sourceVersion: string;
  source: FanwardImpactSource;
  updatedAt: string;
  components: Record<FanwardImpactComponentName, FanwardImpactComponent>;
}

const OUTER_WEIGHTS: Record<FanwardImpactComponentName, number> = {
  verifiedReach: 0.3,
  attentionMomentum: 0.3,
  engagementQuality: 0.2,
  trustConfidence: 0.2,
};

const FAIL_CLOSED_STATES = new Set<RankingState>([
  "unverified",
  "building_baseline",
  "suspended",
  "fraud_review",
  "ineligible",
]);

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function signal(input: FanwardImpactInput, name: ScoreComponentName): number | null {
  const component = input.components[name];
  return component?.available ? clamp(component.normalizedValue, 0, 100) : null;
}

function weightedAvailable(parts: Array<{ value: number | null; weight: number }>): number | null {
  let weighted = 0;
  let availableWeight = 0;
  for (const part of parts) {
    if (part.value == null) continue;
    weighted += part.value * part.weight;
    availableWeight += part.weight;
  }
  return availableWeight > 0 ? weighted / availableWeight : null;
}

/**
 * Derive the public Fanward Impact Score from an already accepted site score.
 * This function never accepts social, follower, payment, conversion, revenue,
 * or auction facts, so those claims cannot leak into the creator surface.
 */
export function computeFanwardImpact(input: FanwardImpactInput): FanwardImpactResult {
  const reach = signal(input, "trafficVolume");
  const momentum = weightedAvailable([
    { value: signal(input, "growthVelocity"), weight: 0.6 },
    { value: signal(input, "liveAcceleration"), weight: 0.4 },
  ]);
  const engagement = signal(input, "engagementQuality");
  const trust = signal(input, "trustConfidence");
  const values: Record<FanwardImpactComponentName, number | null> = {
    verifiedReach: reach,
    attentionMomentum: momentum,
    engagementQuality: engagement,
    trustConfidence: trust,
  };

  let weighted = 0;
  let coverage = 0;
  for (const [name, weight] of Object.entries(OUTER_WEIGHTS) as Array<[FanwardImpactComponentName, number]>) {
    const value = values[name];
    if (value == null) continue;
    weighted += value * weight;
    coverage += weight;
  }

  const publiclyEligible = input.eligible
    && input.verification !== "unverified"
    && !FAIL_CLOSED_STATES.has(input.rankingState)
    && coverage > 0;
  let score = publiclyEligible ? weighted / coverage : null;
  if (score != null && input.rankingState === "provisional") score = Math.min(score, 79);
  if (score != null && input.rankingState === "stale") score = Math.min(score, 60);

  return {
    score: score == null ? null : round1(clamp(score, 0, 100)),
    state: input.rankingState,
    confidence: publiclyEligible ? round1(clamp(input.sourceConfidence, 0, 1) * coverage * 100) / 100 : 0,
    version: FANWARD_IMPACT_VERSION,
    sourceVersion: input.sourceVersion,
    source: input.source,
    updatedAt: new Date(input.updatedAt).toISOString(),
    components: Object.fromEntries(
      (Object.entries(OUTER_WEIGHTS) as Array<[FanwardImpactComponentName, number]>).map(([name, weight]) => [
        name,
        {
          score: values[name] == null ? null : round1(values[name]),
          available: values[name] != null,
          configuredWeight: weight,
          appliedWeight: publiclyEligible && values[name] != null ? weight / coverage : 0,
        },
      ]),
    ) as Record<FanwardImpactComponentName, FanwardImpactComponent>,
  };
}
