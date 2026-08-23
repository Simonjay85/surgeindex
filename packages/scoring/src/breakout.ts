import { DEFAULT_SCORING_CONFIG, type FreshnessState, type ScoringConfig } from "./config";

export type BreakoutState = "none" | "watch" | "breaking_out" | "surging" | "cooling" | "resolved" | "invalidated";
export type BreakoutStrength = "moderate" | "strong" | "exceptional";

export interface BreakoutInput {
  currentVisitors: number | null;
  baselineVisitors: number | null;
  activeNow: number | null;
  typicalActiveNow: number | null;
  dataConfidence: number;
  freshness: FreshnessState;
  suspicionRatio: number;
  validTraffic: boolean;
}

export interface PreviousBreakout {
  state: BreakoutState;
  activeSince: Date | string | null;
  lastEvaluatedAt: Date | string | null;
  cooldownUntil: Date | string | null;
}

export interface BreakoutEvaluation {
  state: BreakoutState;
  strength: BreakoutStrength | null;
  relativeLift: number;
  absoluteLift: number;
  liveRatio: number;
  confidence: number;
  activeSince: string | null;
  durationSeconds: number;
  shouldPublish: boolean;
  explanation: string;
  reasonCodes: string[];
  cooldownUntil?: string | null;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function asTime(value: Date | string | null | undefined): number | null {
  if (!value) return null;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : null;
}

function strength(relativeLift: number, liveRatio: number, config: ScoringConfig): BreakoutStrength {
  if (relativeLift >= config.breakout.exceptionalRelativeLift && liveRatio >= config.breakout.exceptionalLiveRatio) return "exceptional";
  if (relativeLift >= config.breakout.minimumRelativeLift * 1.35 || liveRatio >= config.breakout.minimumLiveRatio * 1.5) return "strong";
  return "moderate";
}

/** Rule-based breakout state machine with entry/exit hysteresis and cooldown. */
export function evaluateBreakout(
  input: BreakoutInput,
  previous: PreviousBreakout | null = null,
  now = new Date(),
  config: ScoringConfig = DEFAULT_SCORING_CONFIG,
): BreakoutEvaluation {
  const current = Math.max(0, input.currentVisitors ?? 0);
  const baseline = Math.max(0, input.baselineVisitors ?? 0);
  const relativeLift = current / Math.max(baseline, 1);
  const absoluteLift = Math.max(0, current - baseline);
  const liveRatio = input.activeNow == null || input.typicalActiveNow == null
    ? 1
    : input.activeNow / Math.max(input.typicalActiveNow, 1);
  const confidence = clamp(input.dataConfidence, 0, 1);
  const reasons: string[] = [];
  const safe = input.validTraffic && input.freshness !== "stale" && input.freshness !== "offline" && confidence >= 0.45 && input.suspicionRatio < config.eligibility.maximumSuspicionRatio;
  if (!safe) {
    if (!input.validTraffic) reasons.push("insufficient_valid_traffic");
    if (input.freshness === "stale" || input.freshness === "offline") reasons.push("data_not_fresh");
    if (input.suspicionRatio >= config.eligibility.maximumSuspicionRatio) reasons.push("fraud_review");
    return {
      state: previous?.state === "breaking_out" || previous?.state === "surging" ? "invalidated" : "none",
      strength: null,
      relativeLift,
      absoluteLift,
      liveRatio,
      confidence,
      activeSince: null,
      durationSeconds: 0,
      shouldPublish: false,
      explanation: "No public breakout: valid, fresh traffic evidence is not sufficient.",
      reasonCodes: reasons,
    };
  }

  const thresholdMet = relativeLift >= config.breakout.minimumRelativeLift && absoluteLift >= config.breakout.minimumAbsoluteLift && (input.typicalActiveNow == null || liveRatio >= config.breakout.minimumLiveRatio);
  const previousSince = asTime(previous?.activeSince);
  const activeSince = thresholdMet ? previousSince ?? now.getTime() : null;
  const durationSeconds = activeSince == null ? 0 : Math.max(0, (now.getTime() - activeSince) / 1000);
  const persistenceMet = durationSeconds >= config.breakout.persistenceMinutes * 60;
  const priorState = previous?.state ?? "none";
  const previousCooldownUntil = asTime(previous?.cooldownUntil);

  if (priorState === "resolved" && previousCooldownUntil != null && now.getTime() < previousCooldownUntil) {
    return {
      state: "resolved",
      strength: null,
      relativeLift,
      absoluteLift,
      liveRatio,
      confidence,
      activeSince: null,
      durationSeconds: 0,
      shouldPublish: false,
      explanation: "The resolved breakout is inside its cooldown window; a new signal must persist before publication.",
      reasonCodes: ["cooldown_active"],
      cooldownUntil: new Date(previousCooldownUntil).toISOString(),
    };
  }

  if (!thresholdMet) {
    if (["breaking_out", "surging"].includes(priorState)) {
      const cooldownSince = asTime(previous?.lastEvaluatedAt) ?? now.getTime();
      const coolingDuration = Math.max(0, (now.getTime() - cooldownSince) / 1000);
      if (relativeLift < config.breakout.resolutionRelativeLift && coolingDuration >= config.breakout.resolutionMinutes * 60) {
        return {
          state: "resolved",
          strength: null,
          relativeLift,
          absoluteLift,
          liveRatio,
          confidence,
          activeSince: previousSince ? new Date(previousSince).toISOString() : null,
          durationSeconds,
          shouldPublish: true,
          explanation: "Traffic has returned close to its expected level; the breakout resolved.",
          reasonCodes: ["below_exit_threshold"],
          cooldownUntil: new Date(now.getTime() + config.breakout.cooldownMinutes * 60_000).toISOString(),
        };
      }
      return {
        state: "cooling",
        strength: strength(relativeLift, liveRatio, config),
        relativeLift,
        absoluteLift,
        liveRatio,
        confidence,
        activeSince: previousSince ? new Date(previousSince).toISOString() : null,
        durationSeconds,
        shouldPublish: true,
        explanation: "Traffic is cooling after a sustained breakout.",
        reasonCodes: ["below_entry_threshold"],
      };
    }
    return {
      state: "none",
      strength: null,
      relativeLift,
      absoluteLift,
      liveRatio,
      confidence,
      activeSince: null,
      durationSeconds: 0,
      shouldPublish: false,
      explanation: "Traffic is within the expected range for this site.",
      reasonCodes: ["entry_threshold_not_met"],
    };
  }

  if (!persistenceMet) {
    return {
      state: "watch",
      strength: strength(relativeLift, liveRatio, config),
      relativeLift,
      absoluteLift,
      liveRatio,
      confidence,
      activeSince: new Date(activeSince!).toISOString(),
      durationSeconds,
      shouldPublish: false,
      explanation: `Traffic is ${relativeLift.toFixed(1)}× above the expected level, but persistence is still being established.`,
      reasonCodes: ["persistence_required"],
    };
  }

  const breakoutStrength = strength(relativeLift, liveRatio, config);
  const nextState = breakoutStrength === "exceptional" ? "surging" : "breaking_out";
  return {
    state: nextState,
    strength: breakoutStrength,
    relativeLift,
    absoluteLift,
    liveRatio,
    confidence,
    activeSince: new Date(activeSince!).toISOString(),
    durationSeconds,
    shouldPublish: priorState !== nextState,
    explanation: `Traffic is ${relativeLift.toFixed(1)}× above the expected level with ${Math.round(absoluteLift).toLocaleString()} additional valid visitors.`,
    reasonCodes: ["relative_lift", "absolute_lift", "persistence_met"],
  };
}
