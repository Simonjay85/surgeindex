import { DEFAULT_SCORING_CONFIG, type ScoringConfig } from "./config";

export type BaselineMethod = "same_weekday_hour" | "same_hour" | "rolling_recent" | "none";

export interface BaselineObservation {
  capturedAt: Date | string;
  visitors: number;
  sessions?: number;
  pageviews?: number;
  engagedSessions?: number;
  activeNow?: number;
  valid?: boolean;
}

export interface HistoricalBaseline {
  status: "ready" | "building_baseline";
  method: BaselineMethod;
  expectedVisitors: number | null;
  lowerBound: number | null;
  upperBound: number | null;
  typicalActiveNow: number | null;
  sampleCount: number;
  lookbackDays: number;
  confidence: number;
  dataCompleteness: number;
  updatedAt: string;
}

function asDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

export function median(values: number[]): number | null {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

export function medianAbsoluteDeviation(values: number[], center = median(values) ?? 0): number {
  return median(values.map((value) => Math.abs(value - center))) ?? 0;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function sameWeekdayHour(observation: BaselineObservation, now: Date): boolean {
  const date = asDate(observation.capturedAt);
  return date.getUTCDay() === now.getUTCDay() && date.getUTCHours() === now.getUTCHours();
}

function sameHour(observation: BaselineObservation, now: Date): boolean {
  return asDate(observation.capturedAt).getUTCHours() === now.getUTCHours();
}

function withinDays(observation: BaselineObservation, now: Date, days: number): boolean {
  const age = now.getTime() - asDate(observation.capturedAt).getTime();
  return age >= 0 && age <= days * 24 * 60 * 60 * 1000;
}

function summarize(
  observations: BaselineObservation[],
  method: BaselineMethod,
  now: Date,
  config: ScoringConfig,
): HistoricalBaseline {
  if (!observations.length) {
    return {
      status: "building_baseline",
      method: "none",
      expectedVisitors: null,
      lowerBound: null,
      upperBound: null,
      typicalActiveNow: null,
      sampleCount: 0,
      lookbackDays: config.baseline.lookbackDays,
      confidence: 0,
      dataCompleteness: 0,
      updatedAt: now.toISOString(),
    };
  }
  const visitors = observations.map((observation) => Math.max(0, observation.visitors));
  const expected = median(visitors) ?? 0;
  const mad = medianAbsoluteDeviation(visitors, expected);
  const spread = Math.max(mad * 2.5, expected * 0.15, 1);
  const first = Math.min(...observations.map((observation) => asDate(observation.capturedAt).getTime()));
  const spanDays = Math.max(1, (now.getTime() - first) / (24 * 60 * 60 * 1000));
  const dataCompleteness = clamp(observations.length / Math.max(1, Math.min(config.baseline.targetSamples, spanDays * 24)), 0, 1);
  const confidence = clamp(
    Math.min(1, observations.length / config.baseline.targetSamples) * 0.65 + dataCompleteness * 0.35,
    0,
    1,
  );
  return {
    status: observations.length >= config.baseline.rollingMinimumSamples ? "ready" : "building_baseline",
    method: observations.length >= config.baseline.rollingMinimumSamples ? method : "none",
    expectedVisitors: Math.round(expected),
    lowerBound: Math.max(0, Math.round(expected - spread)),
    upperBound: Math.round(expected + spread),
    typicalActiveNow: median(observations.map((observation) => Math.max(0, observation.activeNow ?? 0))),
    sampleCount: observations.length,
    lookbackDays: Math.max(1, Math.ceil(spanDays)),
    confidence: Number(confidence.toFixed(4)),
    dataCompleteness: Number(dataCompleteness.toFixed(4)),
    updatedAt: now.toISOString(),
  };
}

/**
 * Selects the strongest available same-time baseline and uses median/MAD so a
 * single historical spike cannot permanently redefine normal traffic.
 */
export function buildHistoricalBaseline(
  input: BaselineObservation[],
  now = new Date(),
  config: ScoringConfig = DEFAULT_SCORING_CONFIG,
): HistoricalBaseline {
  const observations = input
    .filter((observation) => observation.valid !== false)
    .filter((observation) => Number.isFinite(observation.visitors) && observation.visitors >= 0)
    .filter((observation) => withinDays(observation, now, config.baseline.lookbackDays))
    .sort((a, b) => asDate(a.capturedAt).getTime() - asDate(b.capturedAt).getTime());

  const weekdayHour = observations.filter((observation) => sameWeekdayHour(observation, now));
  if (weekdayHour.length >= config.baseline.sameWeekdayHourMinimumSamples) {
    return summarize(weekdayHour, "same_weekday_hour", now, config);
  }
  const hour = observations.filter((observation) => sameHour(observation, now));
  if (hour.length >= config.baseline.sameHourMinimumSamples) {
    return summarize(hour, "same_hour", now, config);
  }
  const recent = observations.filter((observation) => withinDays(observation, now, 7));
  if (recent.length >= config.baseline.rollingMinimumSamples) {
    return summarize(recent, "rolling_recent", now, config);
  }
  return summarize([], "none", now, config);
}
