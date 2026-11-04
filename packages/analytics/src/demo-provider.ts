/**
 * DemoAnalyticsProvider — Postgres-backed implementation used when Tinybird
 * credentials are absent. Aggregates the tracker_event / active_session
 * tables with SQL so no raw events are shipped to the browser.
 */
import { and, count, desc, eq, gte, sql } from "drizzle-orm";
import { getDb } from "@surge/db";
import { activeSession, trackerEvent } from "@surge/db";
import type {
  AnalyticsEvent,
  AnalyticsProvider,
  LeaderboardQuery,
  LeaderboardResult,
  MetricWindow,
  SiteMetrics,
  TimeSeriesPoint,
  TimeSeriesQuery,
} from "./types";

const WINDOW_SECONDS: Record<MetricWindow, number> = {
  live: 15 * 60,
  "24h": 24 * 3600,
  "7d": 7 * 24 * 3600,
  "30d": 30 * 24 * 3600,
  "90d": 90 * 24 * 3600,
};

/** A session is active for 90s after its last accepted heartbeat. */
export const ACTIVE_SESSION_TTL_SECONDS = 90;

export class DemoAnalyticsProvider implements AnalyticsProvider {
  readonly source: "demo" | "postgres" = "demo";

  async ingest(events: AnalyticsEvent[]): Promise<void> {
    if (events.length === 0) return;
    const db = getDb();
    const accepted = events.filter((e) => e.decision !== "invalid");
    if (accepted.length === 0) return;
    await db
      .insert(trackerEvent)
      .values(
        accepted.map((e) => ({
          eventId: e.eventId,
          siteId: e.siteId,
          eventType: e.eventType,
          sessionId: e.sessionId,
          visitorHash: e.visitorHash,
          pathname: e.pathname,
          referrerHost: e.referrerHost ?? null,
          country: e.country ?? null,
          device: e.device ?? null,
          trafficOrigin: e.trafficOrigin ?? "direct",
          attributionCampaignId: e.attributionCampaignId ?? null,
          decision: e.decision ?? "valid",
          reasons: e.reasons ?? [],
          occurredAt: new Date(e.occurredAt),
          isDemo: e.isDemo ?? false,
        })),
      )
      .onConflictDoNothing({ target: trackerEvent.eventId });

    for (const e of accepted) {
      if (e.trafficOrigin !== "paid_surgedindex_referral" && (e.eventType === "session_start" || e.eventType === "heartbeat" || e.eventType === "pageview")) {
        await db
          .insert(activeSession)
          .values({
            sessionId: e.sessionId,
            siteId: e.siteId,
            visitorHash: e.visitorHash,
            startedAt: new Date(e.occurredAt),
            lastHeartbeatAt: new Date(e.occurredAt),
          })
          .onConflictDoUpdate({
            target: activeSession.sessionId,
            set: { lastHeartbeatAt: new Date(e.occurredAt) },
          });
      }
      if (e.eventType === "session_end") {
        await db.delete(activeSession).where(eq(activeSession.sessionId, e.sessionId));
      }
    }
  }

  async getLeaderboard(input: LeaderboardQuery): Promise<LeaderboardResult> {
    const db = getDb();
    const since = new Date(Date.now() - WINDOW_SECONDS[input.window] * 1000);
    const rows = await db
      .select({
        siteId: trackerEvent.siteId,
        visitors: sql<number>`count(distinct ${trackerEvent.visitorHash})::int`,
        pageviews: sql<number>`count(*) filter (where ${trackerEvent.eventType} = 'pageview')::int`,
      })
      .from(trackerEvent)
      .where(
        and(
          gte(trackerEvent.occurredAt, since),
          eq(trackerEvent.decision, "valid"),
          sql`${trackerEvent.trafficOrigin} <> 'paid_surgedindex_referral'`,
          sql`${trackerEvent.eventType} in ('pageview','session_start')`,
        ),
      )
      .groupBy(trackerEvent.siteId)
      .orderBy(desc(sql`count(distinct ${trackerEvent.visitorHash})`))
      .limit(input.limit ?? 50)
      .offset(input.offset ?? 0);

    const activeCounts = await this.activeNowBySite();
    return {
      sites: rows.map((r: { siteId: string; visitors: number; pageviews: number }) => ({
        siteId: r.siteId,
        visitors: r.visitors,
        pageviews: r.pageviews,
        activeNow: activeCounts.get(r.siteId) ?? 0,
        engagementRate: null,
        avgEngagementSeconds: null,
      })),
      generatedAt: new Date().toISOString(),
      source: "demo",
    };
  }

  async getSiteMetrics(siteId: string, window: MetricWindow): Promise<SiteMetrics> {
    const db = getDb();
    const since = new Date(Date.now() - WINDOW_SECONDS[window] * 1000);
    const [row] = await db
      .select({
        visitors: sql<number>`count(distinct ${trackerEvent.visitorHash})::int`,
        pageviews: sql<number>`count(*) filter (where ${trackerEvent.eventType} = 'pageview')::int`,
      })
      .from(trackerEvent)
      .where(
        and(
          eq(trackerEvent.siteId, siteId),
          gte(trackerEvent.occurredAt, since),
          eq(trackerEvent.decision, "valid"),
          sql`${trackerEvent.trafficOrigin} <> 'paid_surgedindex_referral'`,
        ),
      );
    const [engaged] = await db
      .select({
        sessions: sql<number>`count(distinct ${trackerEvent.sessionId})::int`,
        engagedSessions: sql<number>`count(distinct ${trackerEvent.sessionId}) filter (where ${trackerEvent.eventType} = 'engaged')::int`,
      })
      .from(trackerEvent)
      .where(
        and(
          eq(trackerEvent.siteId, siteId),
          gte(trackerEvent.occurredAt, since),
          eq(trackerEvent.decision, "valid"),
          sql`${trackerEvent.trafficOrigin} <> 'paid_surgedindex_referral'`,
        ),
      );
    const activeNow = await this.activeNowBySite(siteId);
    return {
      siteId,
      visitors: row?.visitors ?? 0,
      pageviews: row?.pageviews ?? 0,
      activeNow: activeNow.get(siteId) ?? 0,
      activeLast30m: row?.visitors ?? 0,
      sessions: engaged?.sessions ?? 0,
      engagedSessions: engaged?.engagedSessions ?? 0,
      activeSessions: activeNow.get(siteId) ?? 0,
      engagementRate:
        engaged && engaged.sessions > 0 ? engaged.engagedSessions / engaged.sessions : null,
      avgEngagementSeconds: null,
      generatedAt: new Date().toISOString(),
    };
  }

  async getTimeSeries(siteId: string, input: TimeSeriesQuery): Promise<TimeSeriesPoint[]> {
    const db = getDb();
    const seconds = WINDOW_SECONDS[input.window];
    const bucketMinutes =
      input.bucketMinutes ?? (input.window === "live" ? 5 : input.window === "24h" ? 60 : 360);
    const rows = await db.execute<{ bucket: string; value: number }>(sql`
      select
        to_timestamp(floor(extract(epoch from occurred_at) / ${bucketMinutes * 60}) * ${bucketMinutes * 60}) as bucket,
        ${metricExpr(input.metric)}::int as value
      from tracker_event
      where site_id = ${siteId}
        and occurred_at > now() - (${seconds} || ' seconds')::interval
        and decision = 'valid'
        and traffic_origin <> 'paid_surgedindex_referral'
        and ${metricFilter(input.metric)}
      group by bucket
      order by bucket asc
    `);
    return rows.rows.map((r: { bucket: string; value: number }) => ({ t: new Date(r.bucket).toISOString(), value: Number(r.value) }));
  }

  private async activeNowBySite(siteId?: string): Promise<Map<string, number>> {
    const db = getDb();
    const conditions = [
      gte(
        activeSession.lastHeartbeatAt,
        new Date(Date.now() - ACTIVE_SESSION_TTL_SECONDS * 1000),
      ),
    ];
    if (siteId) conditions.push(eq(activeSession.siteId, siteId));
    const rows = await db
      .select({ siteId: activeSession.siteId, n: count() })
      .from(activeSession)
      .where(and(...conditions))
      .groupBy(activeSession.siteId);
    return new Map(rows.map((r: { siteId: string; n: number }) => [r.siteId, Number(r.n)]));
  }
}

function metricExpr(metric: TimeSeriesQuery["metric"]): ReturnType<typeof sql> {
  switch (metric) {
    case "active":
      return sql`count(distinct session_id)`;
    case "pageviews":
      return sql`count(*)`;
    case "referrals":
      return sql`0`;
    case "visitors":
    default:
      return sql`count(distinct visitor_hash)`;
  }
}

function metricFilter(metric: TimeSeriesQuery["metric"]): ReturnType<typeof sql> {
  switch (metric) {
    case "pageviews":
      return sql`event_type = 'pageview'`;
    default:
      return sql`true`;
  }
}
