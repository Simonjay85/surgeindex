import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import {
  breakoutEvent,
  category,
  closeDb,
  currentRanking,
  getPostgresDb,
  rankSnapshot,
  site,
  siteMetricCurrent,
  siteMetricSnapshot,
  siteScore,
  siteScoreComponent,
  type PostgresDatabase,
} from "@surge/db";
import { getScoreExplanation, runBaselineJob, runBreakoutJob, runRankingJob, runScoreJob } from "../lib/server/ranking-engine";

const enabled = process.env.RUN_DB_TESTS === "1" && Boolean(process.env.DATABASE_URL);
const now = new Date("2026-08-23T12:00:00.000Z");
const suffix = Date.now().toString(36);
let db: PostgresDatabase;
let siteId = "";
let categoryId = "";

function completedCount(result: unknown) {
  return typeof result === "object" && result !== null && "completed" in result && typeof result.completed === "number" ? result.completed : 0;
}

describe.skipIf(!enabled)("Batch 4 scoring pipeline", () => {
  beforeAll(async () => {
    db = getPostgresDb();
    const [createdCategory] = await db.insert(category).values({ slug: `batch4-${suffix}`, name: "Batch 4 Fixture", description: "" }).returning({ id: category.id });
    categoryId = createdCategory.id;
    const [createdSite] = await db.insert(site).values({ slug: `batch4-${suffix}`, domain: `batch4-${suffix}.example.com`, name: "Batch 4 Fixture", description: "Integration fixture", categoryId, status: "active", verification: "tracker", ownership: "claimed", isDemo: false }).returning({ id: site.id });
    siteId = createdSite.id;
    await db.insert(siteMetricCurrent).values({ siteId, visitors24h: 5_000, visitors7d: 35_000, activeNow: 100, activeLast30m: 100, sessions24h: 4_000, pageviews24h: 8_000, engagedSessions24h: 2_400, activeSessions: 100, engagementRate: "0.60", avgEngagementSeconds: 120, acceptedEvents24h: 100, suspectedEvents24h: 0, invalidEvents24h: 0, lastAcceptedEventAt: now, updatedAt: now });
    const observations = Array.from({ length: 14 }, (_, index) => ({ siteId, granularity: "hour" as const, visitors: 1_000, sessions: 800, pageviews: 1_600, engagedSessions: 480, activeNow: 20, capturedAt: new Date(now.getTime() - (index + 1) * 24 * 60 * 60 * 1000) }));
    await db.insert(siteMetricSnapshot).values(observations);
  });

  afterAll(async () => {
    if (siteId) await db.delete(site).where(eq(site.id, siteId));
    if (categoryId) await db.delete(category).where(eq(category.id, categoryId));
    await closeDb();
  });

  it("builds a baseline, persists score components, publishes rank, and transitions a breakout", async () => {
    const baseline = await runBaselineJob({ now, force: true });
    expect(completedCount(baseline)).toBeGreaterThanOrEqual(1);
    const scored = await runScoreJob({ now, siteId, force: true });
    expect(completedCount(scored)).toBe(1);
    const scoreRows = await db.select().from(siteScore).where(eq(siteScore.siteId, siteId));
    expect(scoreRows).toHaveLength(1);
    expect(scoreRows[0]?.rankingState).toBe("eligible");
    expect(await db.select().from(siteScoreComponent).where(eq(siteScoreComponent.scoreId, scoreRows[0]!.id))).toHaveLength(5);

    const firstBreakout = await runBreakoutJob({ now, force: true });
    expect(completedCount(firstBreakout)).toBe(1);
    expect((await db.select().from(breakoutEvent).where(eq(breakoutEvent.siteId, siteId)))[0]?.state).toBe("watch");

    const ranked = await runRankingJob({ now, force: true });
    expect(completedCount(ranked)).toBeGreaterThan(0);
    expect((await db.select().from(currentRanking).where(eq(currentRanking.siteId, siteId))).some((row) => row.scope === "global")).toBe(true);
    expect(await db.select().from(rankSnapshot).where(and(eq(rankSnapshot.siteId, siteId), eq(rankSnapshot.scope, "global")))).toHaveLength(1);

    const persistentTime = new Date(now.getTime() + 15 * 60_000);
    const secondBreakout = await runBreakoutJob({ now: persistentTime, force: true });
    expect(completedCount(secondBreakout)).toBe(1);
    const breakoutRows = await db.select().from(breakoutEvent).where(eq(breakoutEvent.siteId, siteId));
    expect(breakoutRows[0]?.state).toBe("surging");
    expect((await getScoreExplanation(siteId))?.components).toHaveLength(5);

    const rerun = await runRankingJob({ now, force: true });
    expect(completedCount(rerun)).toBeGreaterThan(0);
    expect(await db.select().from(rankSnapshot).where(and(eq(rankSnapshot.siteId, siteId), eq(rankSnapshot.scope, "global")))).toHaveLength(1);
  });
});
