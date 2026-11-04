/**
 * Trend Heat Score — how hot an item is on its own platform right now.
 *
 * Pure and deterministic, like Heat Score v1, but built for public platform
 * charts (Reddit, Hacker News, Google Trends, GitHub, YouTube) instead of
 * verified site traffic. The core input is growth velocity: how fast the
 * item's own metric is climbing per hour. Velocity is normalized per platform
 * on a log scale against a reference "very hot" rate, then winsorized so one
 * runaway item cannot flatten the rest of the board.
 */

export const TREND_HEAT_VERSION = "trend-v1";

export const TREND_HEAT_WEIGHTS = {
  velocity: 0.6,
  position: 0.25,
  momentum: 0.15,
} as const;

/**
 * Per-hour growth rate that counts as "fully hot" on each platform. Anything
 * at or above the reference scores 1.0 on the velocity dimension. `null`
 * means the platform exposes no growth metric at all (e.g. a deals page), so
 * heat is built from chart position and momentum only.
 */
export const TREND_VELOCITY_REFERENCE = {
  reddit: 4_000, // upvotes per hour
  hackernews: 150, // points per hour
  "google-trends": 20_000, // searches per hour (approximate traffic buckets)
  github: 100, // stars per hour (2,400 / day)
  youtube: 300_000, // views per hour
  wikipedia: 25_000, // pageviews per hour (600K / day)
  amazon: 400, // % sales-rank gain per hour (9,600% / 24h on Movers & Shakers)
  news: 6, // distinct outlets × recency decay (6 fresh outlets = blazing)
  ebay: null, // trending deals expose price and discount, not growth
  shopee: null,
  "tiktok-shop": 300, // units sold per hour, measured over 24h (7,200 / day)
  x: 10_000,
} as const satisfies Record<string, number | null>;

export type TrendPlatform = keyof typeof TREND_VELOCITY_REFERENCE;

export interface TrendHeatInput {
  platform: TrendPlatform;
  /** Metric growth per hour. Measured between snapshots when possible. */
  velocityPerHour: number | null;
  /** 1-based position on the platform's own chart. */
  rank: number;
  boardSize: number;
  /** Positive = climbed. null when the item has no previous position. */
  rankDelta: number | null;
  /** True when the item entered the board since the previous snapshot. */
  isNew: boolean;
  /**
   * False when the source exposes no metric at all for this read (e.g. a
   * fallback feed without vote counts). Velocity is then excluded and the
   * remaining weights are renormalized instead of treating it as zero.
   */
  velocityAvailable?: boolean;
}

export interface TrendHeatResult {
  score: number;
  version: string;
  breakdown: { velocity: number; position: number; momentum: number };
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

/** Log-normalize a per-hour rate against the platform reference (0..1). */
export function normalizeVelocity(platform: TrendPlatform, velocityPerHour: number | null): number {
  if (velocityPerHour === null || !Number.isFinite(velocityPerHour) || velocityPerHour <= 0) return 0;
  const reference: number | null = TREND_VELOCITY_REFERENCE[platform];
  if (reference === null) return 0;
  const winsorized = Math.min(velocityPerHour, reference);
  return clamp(Math.log1p(winsorized) / Math.log1p(reference), 0, 1);
}

export function computeTrendHeat(input: TrendHeatInput): TrendHeatResult {
  const size = Math.max(1, input.boardSize);
  const velocity = normalizeVelocity(input.platform, input.velocityPerHour);
  const position = clamp((size - input.rank + 1) / size, 0, 1);
  const momentum = input.isNew
    ? 0.7
    : input.rankDelta === null
      ? 0.4
      : clamp(0.5 + input.rankDelta / 10, 0, 1);
  // No metric this read, or a platform without any growth metric: drop the
  // velocity term and renormalize instead of scoring it as zero.
  const withoutVelocity = input.velocityAvailable === false || TREND_VELOCITY_REFERENCE[input.platform] === null;
  const raw = withoutVelocity
    ? (TREND_HEAT_WEIGHTS.position * position + TREND_HEAT_WEIGHTS.momentum * momentum) /
      (TREND_HEAT_WEIGHTS.position + TREND_HEAT_WEIGHTS.momentum)
    : TREND_HEAT_WEIGHTS.velocity * velocity +
      TREND_HEAT_WEIGHTS.position * position +
      TREND_HEAT_WEIGHTS.momentum * momentum;
  return {
    score: clamp(Math.round(raw * 100), 0, 99),
    version: TREND_HEAT_VERSION,
    breakdown: {
      velocity: Math.round(velocity * 100),
      position: Math.round(position * 100),
      momentum: Math.round(momentum * 100),
    },
  };
}
