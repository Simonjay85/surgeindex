import "server-only";

import { and, asc, desc, eq, gte, inArray, isNull, lt, sql } from "drizzle-orm";
import { getServerEnv } from "@surge/config";
import {
  activityEvent,
  baselineBucket,
  breakoutEvent,
  breakoutStateTransition,
  category,
  currentRanking,
  fraudFlag,
  gaConnection,
  gaMetricAggregate,
  siteMetricSourcePolicy,
  getPostgresDb,
  rankSnapshot,
  scoringConfig,
  scoringJobRun,
  site,
  siteBaseline,
  siteMetricCurrent,
  siteMetricSnapshot,
  siteScore,
  siteScoreComponent,
  type PostgresDatabase,
} from "@surge/db";
import {
  buildHistoricalBaseline,
  DEFAULT_SCORING_CONFIG,
  evaluateBreakout,
  rankCandidates,
  scoreSite,
  SCORE_VERSION,
  type BaselineObservation,
  type BreakoutState,
  type PreviousBreakout,
  type RankingCandidate,
  type RankingScope,
} from "@surge/scoring";

const SCORE_WINDOW = "live";
const RANK_WINDOW = "live" as const;

function number(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function roundSlot(now: Date, minutes: number): Date {
  const slot = new Date(now);
  slot.setUTCSeconds(0, 0);
  slot.setUTCMinutes(Math.floor(slot.getUTCMinutes() / minutes) * minutes);
  return slot;
}

function dataAgeSeconds(lastEventAt: Date | null, now: Date): number | null {
  return lastEventAt ? Math.max(0, Math.round((now.getTime() - lastEventAt.getTime()) / 1000)) : null;
}

type Ga4ScoreMetrics = {
  visitors24h: number | null;
  visitors7d: number | null;
  sessions24h: number | null;
  pageviews24h: number | null;
  engagedSessions24h: number | null;
  engagementRate: number | null;
  avgEngagementSeconds: number | null;
  baselineVisitors: number | null;
  baselineSampleCount: number;
  freshnessAt: Date | null;
  providerDefinitionVersion: string;
};

async function ensureSourcePolicy(db: PostgresDatabase, siteId: string, now: Date) {
  await db.insert(siteMetricSourcePolicy).values({ siteId, primarySource: "tracker", rankingSourceVersion: "tracker-v1", rankingSourceStartedAt: now }).onConflictDoNothing();
  const [policy] = await db.select().from(siteMetricSourcePolicy).where(eq(siteMetricSourcePolicy.siteId, siteId)).limit(1);
  return policy ?? { primarySource: "tracker" as const, rankingSourceVersion: "tracker-v1", rankingSourceStartedAt: now, rankingSourceLockedUntil: null, previousRankingSource: null, sourceSwitchReason: null, provisionalUntil: null, baselineCompatible: true };
}

async function ga4ScoreMetrics(db: PostgresDatabase, siteId: string, now: Date): Promise<Ga4ScoreMetrics | null> {
  const [connection] = await db.select({ id: gaConnection.id, lastSuccessfulReportAt: gaConnection.lastSuccessfulReportAt, providerSchemaVersion: gaConnection.providerSchemaVersion, rankingEligible: gaConnection.rankingEligible }).from(gaConnection).where(and(eq(gaConnection.siteId, siteId), eq(gaConnection.connectionState, "connected"))).limit(1);
  if (!connection?.rankingEligible) return null;
  const rows = await db.select({ metricName: gaMetricAggregate.metricName, value: gaMetricAggregate.value, bucketStart: gaMetricAggregate.bucketStart, providerDefinitionVersion: gaMetricAggregate.providerDefinitionVersion }).from(gaMetricAggregate).where(and(eq(gaMetricAggregate.siteId, siteId), eq(gaMetricAggregate.connectionId, connection.id), eq(gaMetricAggregate.window, "daily"), gte(gaMetricAggregate.bucketStart, new Date(now.getTime() - 8 * 24 * 60 * 60 * 1000))));
  const byMetric = new Map<string, Array<{ value: number; bucketStart: Date; version: string }>>();
  for (const row of rows) {
    const list = byMetric.get(row.metricName) ?? [];
    list.push({ value: number(row.value), bucketStart: row.bucketStart, version: row.providerDefinitionVersion });
    byMetric.set(row.metricName, list);
  }
  const latest = (metric: string) => [...(byMetric.get(metric) ?? [])].sort((a, b) => b.bucketStart.getTime() - a.bucketStart.getTime())[0] ?? null;
  const sum = (metric: string) => { const values = byMetric.get(metric) ?? []; return values.length ? values.reduce((total, item) => total + item.value, 0) : null; };
  const active = byMetric.get("active_users") ?? [];
  const baselineValues = [...active].sort((a, b) => a.bucketStart.getTime() - b.bucketStart.getTime()).slice(0, -1).map((item) => item.value);
  const baseline = baselineValues.length ? baselineValues.reduce((total, value) => total + value, 0) / baselineValues.length : null;
  const engagement = latest("engagement_rate");
  const duration = latest("average_session_duration");
  const latestActive = latest("active_users");
  const versions = rows.map((row) => row.providerDefinitionVersion).filter(Boolean);
  return { visitors24h: latestActive?.value ?? null, visitors7d: sum("active_users"), sessions24h: latest("sessions")?.value ?? null, pageviews24h: latest("screen_page_views")?.value ?? null, engagedSessions24h: latest("engaged_sessions")?.value ?? null, engagementRate: engagement?.value ?? null, avgEngagementSeconds: duration?.value ?? null, baselineVisitors: baseline, baselineSampleCount: baselineValues.length, freshnessAt: connection.lastSuccessfulReportAt, providerDefinitionVersion: versions[0] ?? connection.providerSchemaVersion };
}

async function ga4BaselineObservations(db: PostgresDatabase, siteId: string, now: Date): Promise<BaselineObservation[]> {
  const rows = await db.select({ metricName: gaMetricAggregate.metricName, value: gaMetricAggregate.value, bucketStart: gaMetricAggregate.bucketStart }).from(gaMetricAggregate).where(and(eq(gaMetricAggregate.siteId, siteId), eq(gaMetricAggregate.source, "ga4"), eq(gaMetricAggregate.window, "daily"), gte(gaMetricAggregate.bucketStart, new Date(now.getTime() - DEFAULT_SCORING_CONFIG.baseline.lookbackDays * 24 * 60 * 60 * 1000))));
  const buckets = new Map<number, BaselineObservation>();
  for (const row of rows) {
    const key = row.bucketStart.getTime();
    const current = buckets.get(key) ?? { capturedAt: row.bucketStart, visitors: 0, sessions: 0, pageviews: 0, engagedSessions: 0, activeNow: 0 };
    const value = number(row.value);
    if (row.metricName === "active_users") current.visitors = value;
    if (row.metricName === "sessions") current.sessions = value;
    if (row.metricName === "screen_page_views") current.pageviews = value;
    if (row.metricName === "engaged_sessions") current.engagedSessions = value;
    buckets.set(key, current);
  }
  return [...buckets.values()].sort((a, b) => new Date(a.capturedAt).getTime() - new Date(b.capturedAt).getTime());
}

function buildConfigRows() {
  return {
    version: SCORE_VERSION,
    description: "Heat Score v1: deterministic, explainable organic attention ranking.",
    weights: DEFAULT_SCORING_CONFIG.weights,
    baselineConfig: DEFAULT_SCORING_CONFIG.baseline,
    eligibilityConfig: DEFAULT_SCORING_CONFIG.eligibility,
    leagueConfig: DEFAULT_SCORING_CONFIG.leagues,
    smoothingConfig: DEFAULT_SCORING_CONFIG.smoothing,
    breakoutConfig: DEFAULT_SCORING_CONFIG.breakout,
    isActive: true,
  };
}

async function ensureScoringConfig(db: PostgresDatabase) {
  const values = buildConfigRows();
  await db
    .insert(scoringConfig)
    .values(values)
    .onConflictDoUpdate({ target: scoringConfig.version, set: { ...values, updatedAt: new Date() } });
  return DEFAULT_SCORING_CONFIG;
}

async function beginJob(db: PostgresDatabase, jobType: string, version: string, runKey: string, force = false) {
  const [existing] = await db
    .select()
    .from(scoringJobRun)
    .where(and(eq(scoringJobRun.jobType, jobType), eq(scoringJobRun.version, version), eq(scoringJobRun.runKey, runKey)))
    .limit(1);
  if (existing?.status === "completed" && !force) return null;
  if (existing?.status === "running") return null;
  const now = new Date();
  const [run] = await db.insert(scoringJobRun).values({ jobType, version, runKey, status: "running", startedAt: now, createdAt: now }).onConflictDoNothing({ target: [scoringJobRun.jobType, scoringJobRun.version, scoringJobRun.runKey] }).returning();
  if (!run) {
    const [raced] = await db.select().from(scoringJobRun).where(and(eq(scoringJobRun.jobType, jobType), eq(scoringJobRun.version, version), eq(scoringJobRun.runKey, runKey))).limit(1);
    if (!raced || raced.status === "running" || (!force && raced.status === "completed")) return null;
    const [restarted] = await db.update(scoringJobRun).set({ status: "running", startedAt: now, finishedAt: null, durationMs: null, error: null, updatedAt: now }).where(eq(scoringJobRun.id, raced.id)).returning();
    return restarted ?? null;
  }
  return run ?? null;
}

async function finishJob(db: PostgresDatabase, runId: string, startedAt: Date, counts: { attempted: number; completed: number; skipped: number; failed: number }, error?: unknown) {
  const finishedAt = new Date();
  await db
    .update(scoringJobRun)
    .set({
      status: error ? "failed" : "completed",
      finishedAt,
      durationMs: Math.max(0, finishedAt.getTime() - startedAt.getTime()),
      sitesAttempted: counts.attempted,
      sitesCompleted: counts.completed,
      sitesSkipped: counts.skipped,
      sitesFailed: counts.failed,
      error: error ? (error instanceof Error ? error.name : "unknown_error") : null,
      updatedAt: finishedAt,
    })
    .where(eq(scoringJobRun.id, runId));
}

async function completedDataDays(db: PostgresDatabase, siteId: string, now: Date): Promise<number> {
  const result = await db.execute(sql`
    select count(distinct (captured_at at time zone 'UTC')::date)::int as days
    from site_metric_snapshot
    where site_id = ${siteId}
      and granularity = 'hour'
      and captured_at >= ${new Date(now.getTime() - 28 * 24 * 60 * 60 * 1000)}
  `);
  return number((result.rows[0] as Record<string, unknown> | undefined)?.days);
}

async function hasOpenFraudReview(db: PostgresDatabase, siteId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: fraudFlag.id })
    .from(fraudFlag)
    .where(and(eq(fraudFlag.siteId, siteId), eq(fraudFlag.decision, "review_required"), isNull(fraudFlag.resolvedAt)))
    .limit(1);
  return Boolean(row);
}

export async function runBaselineJob(options: { now?: Date; force?: boolean } = {}) {
  const db = getPostgresDb();
  const now = options.now ?? new Date();
  const config = await ensureScoringConfig(db);
  const slot = roundSlot(now, 60);
  const run = await beginJob(db, "baseline", config.version, slot.toISOString(), options.force);
  if (!run) return { skipped: true, reason: "already_completed", runKey: slot.toISOString() };
  const counts = { attempted: 0, completed: 0, skipped: 0, failed: 0 };
  try {
    const sites = await db
      .select({ siteId: site.id })
      .from(site)
      .where(and(eq(site.status, "active"), eq(site.isDemo, false), isNull(site.deletedAt)))
      .orderBy(asc(site.id));
    counts.attempted = sites.length;
    for (const target of sites) {
      try {
        const policy = await ensureSourcePolicy(db, target.siteId, now);
        const observations = policy.primarySource === "ga4"
          ? await ga4BaselineObservations(db, target.siteId, now)
          : await db
            .select({ capturedAt: siteMetricSnapshot.capturedAt, visitors: siteMetricSnapshot.visitors, sessions: siteMetricSnapshot.sessions, pageviews: siteMetricSnapshot.pageviews, engagedSessions: siteMetricSnapshot.engagedSessions, activeNow: siteMetricSnapshot.activeNow })
            .from(siteMetricSnapshot)
            .where(and(eq(siteMetricSnapshot.siteId, target.siteId), eq(siteMetricSnapshot.granularity, "hour"), gte(siteMetricSnapshot.capturedAt, new Date(now.getTime() - config.baseline.lookbackDays * 24 * 60 * 60 * 1000))))
            .orderBy(asc(siteMetricSnapshot.capturedAt));
        const baseline = buildHistoricalBaseline(observations satisfies BaselineObservation[], now, config);
        await db.transaction(async (tx) => {
          await tx
            .insert(siteBaseline)
            .values({
              siteId: target.siteId,
              version: config.version,
              method: baseline.method,
              status: baseline.status,
              expectedVisitors: baseline.expectedVisitors,
              lowerBound: baseline.lowerBound,
              upperBound: baseline.upperBound,
              typicalActiveNow: baseline.typicalActiveNow,
              sampleCount: baseline.sampleCount,
              lookbackDays: baseline.lookbackDays,
              confidence: baseline.confidence.toFixed(4),
              dataCompleteness: baseline.dataCompleteness.toFixed(4),
              source: policy.primarySource,
              providerDefinitionVersion: policy.primarySource === "ga4" ? "ga4-daily-v1" : "tracker-v1",
              updatedAt: now,
            })
            .onConflictDoUpdate({ target: siteBaseline.siteId, set: { version: config.version, method: baseline.method, status: baseline.status, expectedVisitors: baseline.expectedVisitors, lowerBound: baseline.lowerBound, upperBound: baseline.upperBound, typicalActiveNow: baseline.typicalActiveNow, sampleCount: baseline.sampleCount, lookbackDays: baseline.lookbackDays, confidence: baseline.confidence.toFixed(4), dataCompleteness: baseline.dataCompleteness.toFixed(4), source: policy.primarySource, providerDefinitionVersion: policy.primarySource === "ga4" ? "ga4-daily-v1" : "tracker-v1", updatedAt: now } });
          for (const observation of observations) {
            const bucketStart = observation.capturedAt instanceof Date ? observation.capturedAt : new Date(observation.capturedAt);
            await tx
              .insert(baselineBucket)
              .values({ siteId: target.siteId, bucketStart, visitors: observation.visitors, sessions: observation.sessions, pageviews: observation.pageviews, engagedSessions: observation.engagedSessions, activeNow: observation.activeNow, validEvents: 0, dataCompleteness: "1", source: policy.primarySource })
              .onConflictDoUpdate({ target: [baselineBucket.siteId, baselineBucket.source, baselineBucket.bucketStart], set: { visitors: observation.visitors, sessions: observation.sessions, pageviews: observation.pageviews, engagedSessions: observation.engagedSessions, activeNow: observation.activeNow, dataCompleteness: "1", source: policy.primarySource } });
          }
          await tx
            .update(siteMetricCurrent)
            .set({ baselineDailyVisitors: baseline.expectedVisitors, typicalActiveNow: baseline.typicalActiveNow, lastBaselineAt: now, updatedAt: now })
            .where(eq(siteMetricCurrent.siteId, target.siteId));
        });
        counts.completed += 1;
      } catch (error) {
        counts.failed += 1;
        console.error(JSON.stringify({ component: "baseline-job", siteId: target.siteId, errorClass: error instanceof Error ? error.name : "unknown" }));
      }
    }
    await finishJob(db, run.id, run.startedAt, counts);
    return { ...counts, completedAt: new Date().toISOString(), runId: run.id };
  } catch (error) {
    await finishJob(db, run.id, run.startedAt, counts, error);
    throw error;
  }
}

async function previousSiteScore(db: PostgresDatabase, siteId: string, version: string, before: Date) {
  const [row] = await db
    .select({ smoothedScore: siteScore.smoothedScore, league: siteScore.league })
    .from(siteScore)
    .where(and(eq(siteScore.siteId, siteId), eq(siteScore.scoreVersion, version), eq(siteScore.calculationWindow, SCORE_WINDOW), lt(siteScore.calculationSlot, before)))
    .orderBy(desc(siteScore.calculationSlot))
    .limit(1);
  return row ? { smoothedScore: number(row.smoothedScore), league: row.league as "new" | "emerging" | "established" } : null;
}

export async function runScoreJob(options: { now?: Date; siteId?: string; force?: boolean } = {}) {
  const db = getPostgresDb();
  const now = options.now ?? new Date();
  const config = await ensureScoringConfig(db);
  const slot = roundSlot(now, 5);
  const runKey = `${slot.toISOString()}${options.siteId ? `:${options.siteId}` : ""}`;
  const run = await beginJob(db, options.siteId ? "score_site" : "score", config.version, runKey, options.force);
  if (!run) return { skipped: true, reason: "already_completed", runKey };
  const counts = { attempted: 0, completed: 0, skipped: 0, failed: 0 };
  try {
    const rows = await db
      .select({ siteId: site.id, status: site.status, ownership: site.ownership, verification: site.verification, createdAt: site.createdAt, current: siteMetricCurrent, baseline: siteBaseline })
      .from(site)
      .leftJoin(siteMetricCurrent, eq(siteMetricCurrent.siteId, site.id))
      .leftJoin(siteBaseline, eq(siteBaseline.siteId, site.id))
      .where(and(eq(site.status, "active"), eq(site.isDemo, false), isNull(site.deletedAt), options.siteId ? eq(site.id, options.siteId) : undefined));
    counts.attempted = rows.length;
    for (const row of rows) {
      try {
        const current = row.current;
        const baseline = row.baseline;
        const policy = await ensureSourcePolicy(db, row.siteId, now);
        const ga4 = policy.primarySource === "ga4" ? await ga4ScoreMetrics(db, row.siteId, now) : null;
        const source = policy.primarySource;
        const providerDefinitionVersion = ga4?.providerDefinitionVersion ?? (source === "ga4" ? "ga4-daily-v1" : "tracker-v1");
        // A GA4 primary source is intentionally not allowed to fall back to
        // tracker values. This prevents an accidental mixed-definition score.
        const visitors24h = source === "ga4" ? ga4?.visitors24h ?? null : current?.visitors24h ?? null;
        const visitors7d = source === "ga4" ? ga4?.visitors7d ?? null : current?.visitors7d ?? null;
        const sessions24h = source === "ga4" ? ga4?.sessions24h ?? null : current?.sessions24h ?? null;
        const pageviews24h = source === "ga4" ? ga4?.pageviews24h ?? null : current?.pageviews24h ?? null;
        const engagedSessions24h = source === "ga4" ? ga4?.engagedSessions24h ?? null : current?.engagedSessions24h ?? null;
        const engagementRate = source === "ga4" ? ga4?.engagementRate ?? null : current?.engagementRate == null ? null : number(current.engagementRate);
        const avgEngagementSeconds = source === "ga4" ? ga4?.avgEngagementSeconds ?? null : current?.avgEngagementSeconds ?? null;
        const ageSeconds = dataAgeSeconds(source === "ga4" ? ga4?.freshnessAt ?? null : current?.lastAcceptedEventAt ?? null, now);
        const dataDays = source === "ga4" ? ga4?.baselineSampleCount ?? 0 : await completedDataDays(db, row.siteId, now);
        const previous = await previousSiteScore(db, row.siteId, config.version, slot);
        const fraudReview = await hasOpenFraudReview(db, row.siteId);
        const baselineVisitors = source === "ga4" ? ga4?.baselineVisitors ?? null : baseline?.expectedVisitors ?? current?.baselineDailyVisitors ?? null;
        const result = scoreSite({
          visitors24h,
          baselineDailyVisitors: baselineVisitors,
          // GA4 realtime active users are a separate public metric and are not
          // passed as tracker-style "active now" scoring input.
          activeNow: source === "ga4" ? null : current?.activeNow ?? null,
          typicalActiveNow: source === "ga4" ? null : baseline?.typicalActiveNow ?? current?.typicalActiveNow ?? null,
          engagementRate,
          avgEngagementSeconds,
          verification: source,
          dataFreshnessSeconds: ageSeconds,
          fraudPenalty: source === "ga4" ? 0 : current?.fraudPenalty == null ? 0 : number(current.fraudPenalty),
          domainOwnershipVerified: row.ownership === "claimed",
          visitors7d,
          acceptedEvents24h: source === "ga4" ? 0 : current?.acceptedEvents24h ?? 0,
          suspectedEvents24h: source === "ga4" ? 0 : current?.suspectedEvents24h ?? 0,
          invalidEvents24h: source === "ga4" ? 0 : current?.invalidEvents24h ?? 0,
          baselineSampleCount: source === "ga4" ? ga4?.baselineSampleCount ?? 0 : baseline?.sampleCount ?? 0,
          baselineConfidence: source === "ga4" ? (ga4 && ga4.baselineSampleCount >= 3 ? 0.75 : 0) : baseline == null ? 0 : number(baseline.confidence),
          dataCompleteness: source === "ga4" ? (ga4 && ga4.baselineSampleCount ? 1 : 0) : baseline == null ? 0 : number(baseline.dataCompleteness),
          completedDataDays: dataDays,
          previousSmoothedScore: previous?.smoothedScore ?? null,
          previousLeague: previous?.league ?? null,
          siteStatus: row.status,
          fraudReview,
        }, config);
        await db.transaction(async (tx) => {
          const [saved] = await tx
            .insert(siteScore)
            .values({
              siteId: row.siteId,
              scoreVersion: result.version,
              calculationWindow: SCORE_WINDOW,
              calculationSlot: slot,
              inputWindowStart: new Date(now.getTime() - 24 * 60 * 60 * 1000),
              inputWindowEnd: now,
              rankingState: result.state,
              freshness: result.freshness,
              league: result.league,
              rawScore: result.rawScore.toFixed(3),
              smoothedScore: result.smoothedScore.toFixed(3),
              displayedScore: result.displayedScore,
              confidence: result.confidence.toFixed(4),
              relativeLift: result.relativeLift == null ? null : result.relativeLift.toFixed(4),
              absoluteLift: result.absoluteLift == null ? null : Math.round(result.absoluteLift),
              penalties: result.penalties,
              reasonCodes: result.reasonCodes,
              baselineSiteId: baseline?.siteId ?? null,
              rankingSource: source,
              providerDefinitionVersion,
              createdAt: now,
            })
            .onConflictDoUpdate({
              target: [siteScore.siteId, siteScore.scoreVersion, siteScore.calculationWindow, siteScore.calculationSlot],
              set: { rankingState: result.state, freshness: result.freshness, league: result.league, rawScore: result.rawScore.toFixed(3), smoothedScore: result.smoothedScore.toFixed(3), displayedScore: result.displayedScore, confidence: result.confidence.toFixed(4), relativeLift: result.relativeLift == null ? null : result.relativeLift.toFixed(4), absoluteLift: result.absoluteLift == null ? null : Math.round(result.absoluteLift), penalties: result.penalties, reasonCodes: result.reasonCodes, baselineSiteId: baseline?.siteId ?? null, rankingSource: source, providerDefinitionVersion, createdAt: now },
            })
            .returning({ id: siteScore.id });
          if (!saved) throw new Error("score_persist_failed");
          await tx.delete(siteScoreComponent).where(eq(siteScoreComponent.scoreId, saved.id));
          if (result.components.length) {
            await tx.insert(siteScoreComponent).values(result.components.map((component) => ({ scoreId: saved.id, component: component.name, normalizedValue: component.normalizedValue.toFixed(3), weight: component.weight.toFixed(4), contribution: component.contribution.toFixed(3), available: component.available, detail: component.detail, inputValues: { source, visitors24h, baselineVisitors, activeNow: source === "ga4" ? null : current?.activeNow ?? null, typicalActiveNow: source === "ga4" ? null : baseline?.typicalActiveNow ?? null, freshness: result.freshness } })));
          }
          const growthPct = visitors24h != null && baselineVisitors != null && baselineVisitors > 0 ? ((visitors24h - baselineVisitors) / baselineVisitors) * 100 : null;
          await tx
            .update(siteMetricCurrent)
            .set({ visitors24h, visitors7d, sessions24h, pageviews24h, engagedSessions24h, engagementRate: engagementRate == null ? null : engagementRate.toFixed(4), avgEngagementSeconds, activeNow: source === "ga4" ? null : current?.activeNow ?? null, activeLast30m: source === "ga4" ? null : current?.activeLast30m ?? null, baselineDailyVisitors: baselineVisitors, typicalActiveNow: source === "ga4" ? null : baseline?.typicalActiveNow ?? current?.typicalActiveNow ?? null, heatScore: result.displayedScore, rawScore: result.rawScore.toFixed(3), smoothedScore: result.smoothedScore.toFixed(3), heatLeague: result.league, rankingState: result.state, freshness: result.freshness, dataConfidence: result.confidence.toFixed(4), scoreVersion: result.version, rankingSource: source, providerDefinitionVersion, fraudPenalty: source === "ga4" ? "0" : Math.min(1, (current?.suspectedEvents24h ?? 0) / Math.max(1, (current?.acceptedEvents24h ?? 0) + (current?.suspectedEvents24h ?? 0) + (current?.invalidEvents24h ?? 0))).toFixed(3), growth24hPct: growthPct == null ? null : growthPct.toFixed(2), lastScoreAt: now, updatedAt: now })
            .where(eq(siteMetricCurrent.siteId, row.siteId));
        });
        counts.completed += 1;
      } catch (error) {
        counts.failed += 1;
        console.error(JSON.stringify({ component: "score-job", siteId: row.siteId, errorClass: error instanceof Error ? error.name : "unknown" }));
      }
    }
    await finishJob(db, run.id, run.startedAt, counts);
    return { ...counts, completedAt: new Date().toISOString(), runId: run.id };
  } catch (error) {
    await finishJob(db, run.id, run.startedAt, counts, error);
    throw error;
  }
}

function candidateForRow(row: { siteId: string; domain: string; categorySlug: string | null; current: typeof siteMetricCurrent.$inferSelect | null }): RankingCandidate {
  return {
    siteId: row.siteId,
    domain: row.domain,
    categorySlug: row.categorySlug,
    state: row.current?.rankingState ?? "unverified",
    league: (row.current?.heatLeague ?? "new") as "new" | "emerging" | "established",
    displayedScore: row.current?.heatScore ?? 0,
    smoothedScore: row.current?.smoothedScore == null ? row.current?.heatScore ?? 0 : number(row.current.smoothedScore),
    dataConfidence: row.current?.dataConfidence == null ? 0 : number(row.current.dataConfidence),
    visitors24h: row.current?.visitors24h ?? null,
    calculatedAt: row.current?.lastScoreAt ?? row.current?.updatedAt ?? new Date(0),
    freshness: row.current?.freshness ?? "offline",
    breakoutState: row.current?.breakoutState ?? "none",
  };
}

function rankingScopes(categories: string[]): RankingScope[] {
  const leagues: RankingScope[] = ["new", "emerging", "established"].flatMap((league) => [`global:${league}` as RankingScope]);
  const categoryScopes = categories.flatMap((slug) => [
    `category:${slug}` as RankingScope,
    `category:${slug}:new` as RankingScope,
    `category:${slug}:emerging` as RankingScope,
    `category:${slug}:established` as RankingScope,
  ]);
  return ["global", "new", "breakout", ...leagues, ...categoryScopes];
}

export async function runRankingJob(options: { now?: Date; force?: boolean } = {}) {
  const db = getPostgresDb();
  const now = options.now ?? new Date();
  const config = await ensureScoringConfig(db);
  const slot = roundSlot(now, 15);
  const run = await beginJob(db, "ranking", config.version, slot.toISOString(), options.force);
  if (!run) return { skipped: true, reason: "already_completed", runKey: slot.toISOString() };
  const counts = { attempted: 0, completed: 0, skipped: 0, failed: 0 };
  try {
    const rows = await db
      .select({ siteId: site.id, domain: site.domain, categorySlug: category.slug, current: siteMetricCurrent })
      .from(site)
      .leftJoin(category, eq(site.categoryId, category.id))
      .leftJoin(siteMetricCurrent, eq(siteMetricCurrent.siteId, site.id))
      .where(and(eq(site.status, "active"), eq(site.isDemo, false), isNull(site.deletedAt)));
    const candidates = rows.filter((row) => row.current).map((row) => candidateForRow(row));
    const currentBySite = new Map(rows.map((row) => [row.siteId, row.current]));
    const categories = [...new Set(candidates.map((candidate) => candidate.categorySlug).filter((value): value is string => Boolean(value)))];
    const scopes = rankingScopes(categories);
    const previous = await db.select().from(currentRanking).where(eq(currentRanking.window, RANK_WINDOW));
    const previousByScope = new Map(previous.map((row) => [`${row.scope}:${row.siteId}`, row]));
    const capturedAt = slot;
    const rankedByScope = scopes.map((scope) => ({ scope, ranked: rankCandidates(candidates, scope) }));
    counts.attempted = rankedByScope.reduce((sum, item) => sum + item.ranked.length, 0);
    // Publish the complete set atomically. A failure in one scope must leave
    // the previous current leaderboard intact instead of exposing a half-run.
    await db.transaction(async (tx) => {
      await tx.delete(currentRanking).where(eq(currentRanking.window, RANK_WINDOW));
      for (const { scope, ranked } of rankedByScope) {
        for (const [index, candidate] of ranked.entries()) {
          const rank = index + 1;
          const previousRow = previousByScope.get(`${scope}:${candidate.siteId}`);
          const previousRank = previousRow?.rank ?? null;
          const sourceRow = currentBySite.get(candidate.siteId);
          const rankingSource = sourceRow?.rankingSource ?? "tracker";
          const providerDefinitionVersion = sourceRow?.providerDefinitionVersion ?? "tracker-v1";
          await tx.insert(currentRanking).values({ siteId: candidate.siteId, scope, window: RANK_WINDOW, rank, previousRank, scoreId: null, scoreVersion: config.version, rankingSource, providerDefinitionVersion, displayedScore: candidate.displayedScore, smoothedScore: candidate.smoothedScore.toFixed(3), rankingState: candidate.state, league: candidate.league, generatedAt: now });
          await tx.insert(rankSnapshot).values({ siteId: candidate.siteId, scope, window: RANK_WINDOW, rank, previousRank, scoreVersion: config.version, rankingSource, providerDefinitionVersion, displayedScore: candidate.displayedScore, smoothedScore: candidate.smoothedScore.toFixed(3), rankingState: candidate.state, league: candidate.league, capturedAt }).onConflictDoUpdate({ target: [rankSnapshot.siteId, rankSnapshot.scope, rankSnapshot.window, rankSnapshot.capturedAt], set: { rank, previousRank, scoreVersion: config.version, rankingSource, providerDefinitionVersion, displayedScore: candidate.displayedScore, smoothedScore: candidate.smoothedScore.toFixed(3), rankingState: candidate.state, league: candidate.league } });
        }
      }
    });
    counts.completed = counts.attempted;
    await finishJob(db, run.id, run.startedAt, counts);
    return { ...counts, scopes: scopes.length, completedAt: new Date().toISOString(), runId: run.id };
  } catch (error) {
    await finishJob(db, run.id, run.startedAt, counts, error);
    throw error;
  }
}

function breakoutPrevious(row: typeof breakoutEvent.$inferSelect | null): PreviousBreakout | null {
  if (!row) return null;
  return { state: row.state as BreakoutState, activeSince: row.activeSince, lastEvaluatedAt: row.lastEvaluatedAt, cooldownUntil: row.cooldownUntil };
}

export async function runBreakoutJob(options: { now?: Date; force?: boolean } = {}) {
  const db = getPostgresDb();
  const now = options.now ?? new Date();
  const config = await ensureScoringConfig(db);
  const slot = roundSlot(now, 5);
  const run = await beginJob(db, "breakout", config.breakout.version, slot.toISOString(), options.force);
  if (!run) return { skipped: true, reason: "already_completed", runKey: slot.toISOString() };
  const counts = { attempted: 0, completed: 0, skipped: 0, failed: 0 };
  try {
    const rows = await db
      .select({ siteId: site.id, verification: site.verification, current: siteMetricCurrent, baseline: siteBaseline })
      .from(site)
      .leftJoin(siteMetricCurrent, eq(siteMetricCurrent.siteId, site.id))
      .leftJoin(siteBaseline, eq(siteBaseline.siteId, site.id))
      .where(and(eq(site.status, "active"), eq(site.isDemo, false), isNull(site.deletedAt)));
    counts.attempted = rows.length;
    for (const row of rows) {
      if (!row.current) {
        counts.skipped += 1;
        continue;
      }
      try {
        const [existing] = await db.select().from(breakoutEvent).where(eq(breakoutEvent.siteId, row.siteId)).orderBy(desc(breakoutEvent.lastEvaluatedAt)).limit(1);
        const suspicionTotal = (row.current.acceptedEvents24h ?? 0) + (row.current.suspectedEvents24h ?? 0) + (row.current.invalidEvents24h ?? 0);
        const evaluation = evaluateBreakout({ currentVisitors: row.current.visitors24h, baselineVisitors: row.baseline?.expectedVisitors ?? row.current.baselineDailyVisitors, activeNow: row.current.activeNow, typicalActiveNow: row.baseline?.typicalActiveNow ?? row.current.typicalActiveNow, dataConfidence: number(row.current.dataConfidence), freshness: row.current.freshness, suspicionRatio: suspicionTotal ? (row.current.suspectedEvents24h ?? 0) / suspicionTotal : 0, validTraffic: row.verification !== "unverified" }, breakoutPrevious(existing), now, config);
        if (!existing && evaluation.state === "none") {
          await db.update(siteMetricCurrent).set({ breakoutState: "none", breakoutStrength: null, updatedAt: now }).where(eq(siteMetricCurrent.siteId, row.siteId));
          counts.skipped += 1;
          continue;
        }
        if (existing && ["resolved", "invalidated"].includes(existing.state) && evaluation.state === existing.state && evaluation.reasonCodes.includes("cooldown_active")) {
          await db.update(breakoutEvent).set({ lastEvaluatedAt: now, cooldownUntil: evaluation.cooldownUntil ? new Date(evaluation.cooldownUntil) : existing.cooldownUntil, updatedAt: now }).where(eq(breakoutEvent.id, existing.id));
          counts.skipped += 1;
          continue;
        }
        await db.transaction(async (tx) => {
          let eventId = existing?.id;
          const previousState = existing?.state ?? null;
          const isNew = !eventId || ["resolved", "invalidated"].includes(existing?.state ?? "none");
          if (isNew) {
            const [created] = await tx.insert(breakoutEvent).values({ siteId: row.siteId, state: evaluation.state, strength: evaluation.strength, ruleVersion: config.breakout.version, detectedAt: ["breaking_out", "surging"].includes(evaluation.state) ? now : null, activeSince: evaluation.activeSince ? new Date(evaluation.activeSince) : null, lastEvaluatedAt: now, resolvedAt: evaluation.state === "resolved" ? now : null, cooldownUntil: evaluation.cooldownUntil ? new Date(evaluation.cooldownUntil) : null, durationSeconds: Math.round(evaluation.durationSeconds), baselineVisitors: row.baseline?.expectedVisitors ?? row.current?.baselineDailyVisitors, currentVisitors: row.current?.visitors24h, absoluteLift: Math.round(evaluation.absoluteLift), relativeLift: evaluation.relativeLift.toFixed(4), liveRatio: evaluation.liveRatio.toFixed(4), confidence: evaluation.confidence.toFixed(4), explanation: evaluation.explanation, reasonCodes: evaluation.reasonCodes, peakMetrics: { activeNow: row.current?.activeNow ?? null, typicalActiveNow: row.baseline?.typicalActiveNow ?? row.current?.typicalActiveNow ?? null } }).returning({ id: breakoutEvent.id });
            eventId = created.id;
          } else {
            await tx.update(breakoutEvent).set({ state: evaluation.state, strength: evaluation.strength, detectedAt: existing.detectedAt ?? (["breaking_out", "surging"].includes(evaluation.state) ? now : null), activeSince: evaluation.activeSince ? new Date(evaluation.activeSince) : existing.activeSince, lastEvaluatedAt: now, resolvedAt: evaluation.state === "resolved" ? now : existing.resolvedAt, cooldownUntil: evaluation.cooldownUntil ? new Date(evaluation.cooldownUntil) : existing.cooldownUntil, durationSeconds: Math.round(evaluation.durationSeconds), baselineVisitors: row.baseline?.expectedVisitors ?? row.current?.baselineDailyVisitors, currentVisitors: row.current?.visitors24h, absoluteLift: Math.round(evaluation.absoluteLift), relativeLift: evaluation.relativeLift.toFixed(4), liveRatio: evaluation.liveRatio.toFixed(4), confidence: evaluation.confidence.toFixed(4), explanation: evaluation.explanation, reasonCodes: evaluation.reasonCodes, updatedAt: now }).where(eq(breakoutEvent.id, existing.id));
          }
          if (!eventId) throw new Error("breakout_persist_failed");
          if (previousState !== evaluation.state) {
            await tx.insert(breakoutStateTransition).values({ breakoutEventId: eventId, fromState: previousState as BreakoutState | null, toState: evaluation.state, reason: evaluation.reasonCodes.join(","), metrics: { relativeLift: evaluation.relativeLift, absoluteLift: evaluation.absoluteLift, liveRatio: evaluation.liveRatio, confidence: evaluation.confidence }, occurredAt: now });
            if (evaluation.state === "breaking_out" || evaluation.state === "surging") await tx.insert(activityEvent).values({ type: "breakout_entered", siteId: row.siteId, detail: evaluation.explanation, payload: { state: evaluation.state, strength: evaluation.strength, ruleVersion: config.breakout.version }, isDemo: false });
            if (evaluation.state === "cooling") await tx.insert(activityEvent).values({ type: "breakout_cooling", siteId: row.siteId, detail: evaluation.explanation, payload: { ruleVersion: config.breakout.version }, isDemo: false });
            if (evaluation.state === "resolved") await tx.insert(activityEvent).values({ type: "breakout_resolved", siteId: row.siteId, detail: evaluation.explanation, payload: { ruleVersion: config.breakout.version }, isDemo: false });
          }
          await tx.update(siteMetricCurrent).set({ breakoutState: evaluation.state, breakoutStrength: evaluation.strength, updatedAt: now }).where(eq(siteMetricCurrent.siteId, row.siteId));
        });
        counts.completed += 1;
      } catch (error) {
        counts.failed += 1;
        console.error(JSON.stringify({ component: "breakout-job", siteId: row.siteId, errorClass: error instanceof Error ? error.name : "unknown" }));
      }
    }
    await finishJob(db, run.id, run.startedAt, counts);
    return { ...counts, completedAt: new Date().toISOString(), runId: run.id };
  } catch (error) {
    await finishJob(db, run.id, run.startedAt, counts, error);
    throw error;
  }
}

export async function runAllScoringJobs(options: { now?: Date } = {}) {
  const baseline = await runBaselineJob(options);
  const score = await runScoreJob(options);
  const breakout = await runBreakoutJob(options);
  const ranking = await runRankingJob(options);
  return { baseline, score, breakout, ranking };
}

export async function recomputeSite(siteId: string, options: { now?: Date; rebuildBaseline?: boolean } = {}) {
  const now = options.now ?? new Date();
  if (options.rebuildBaseline !== false) await runBaselineJob({ now, force: true });
  const score = await runScoreJob({ now, siteId, force: true });
  const breakout = await runBreakoutJob({ now, force: true });
  const ranking = await runRankingJob({ now, force: true });
  return { score, breakout, ranking };
}

export async function getScoreExplanation(siteId: string) {
  const db = getPostgresDb();
  const [score] = await db.select().from(siteScore).where(and(eq(siteScore.siteId, siteId), eq(siteScore.calculationWindow, SCORE_WINDOW))).orderBy(desc(siteScore.calculationSlot)).limit(1);
  if (!score) return null;
  const [baseline] = await db.select().from(siteBaseline).where(eq(siteBaseline.siteId, siteId)).limit(1);
  const components = await db.select().from(siteScoreComponent).where(eq(siteScoreComponent.scoreId, score.id)).orderBy(asc(siteScoreComponent.component));
  return { score, baseline, components };
}

export async function getScoringHealth() {
  const db = getPostgresDb();
  const [jobs, states, leagues, breakouts, freshness] = await Promise.all([
    db.select().from(scoringJobRun).orderBy(desc(scoringJobRun.startedAt)).limit(20),
    db.execute(sql`select ranking_state, count(*)::int as count from site_metric_current where is_demo = false group by ranking_state`),
    db.execute(sql`select heat_league, count(*)::int as count from site_metric_current where is_demo = false group by heat_league`),
    db.execute(sql`select breakout_state, count(*)::int as count from site_metric_current where is_demo = false group by breakout_state`),
    db.execute(sql`select freshness, count(*)::int as count from site_metric_current where is_demo = false group by freshness`),
  ]);
  return {
    jobs,
    states: states.rows,
    leagues: leagues.rows,
    breakouts: breakouts.rows,
    freshness: freshness.rows,
    generatedAt: new Date().toISOString(),
  };
}

export async function listPersistedBreakouts(limit = 50) {
  const db = getPostgresDb();
  const rows = await db
    .select({ event: breakoutEvent, siteName: site.name, slug: site.slug, domain: site.domain, categorySlug: category.slug, categoryName: category.name, verification: site.verification, heatScore: siteMetricCurrent.heatScore, scoreState: siteMetricCurrent.rankingState, dataConfidence: siteMetricCurrent.dataConfidence })
    .from(breakoutEvent)
    .innerJoin(site, eq(breakoutEvent.siteId, site.id))
    .leftJoin(category, eq(site.categoryId, category.id))
    .leftJoin(siteMetricCurrent, eq(siteMetricCurrent.siteId, site.id))
    .where(and(eq(site.status, "active"), eq(site.isDemo, false), inArray(breakoutEvent.state, ["breaking_out", "surging", "cooling"])))
    .orderBy(desc(breakoutEvent.relativeLift), desc(breakoutEvent.detectedAt))
    .limit(limit);
  return rows;
}

export function internalScoringTokenValid(request: Request): boolean {
  const expected = getServerEnv().INTERNAL_SERVICE_TOKEN;
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  return Boolean(expected && supplied && supplied === expected);
}
