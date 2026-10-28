/**
 * TinybirdAnalyticsProvider — production event analytics adapter.
 *
 * Activated automatically when TINYBIRD_API_URL + tokens are configured.
 * Pipes live in /tinybird (datasources + pipes checked into the repo; push
 * them with `tb push`). All tokens stay server-side.
 */
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
import type { NormalizedTrackerEvent } from "@surge/shared";
import type { EventStoreProvider, IngestResult } from "./types";

interface TinybirdConfig {
  apiUrl: string;
  ingestToken: string;
  readToken: string;
}

export class TinybirdAnalyticsProvider implements AnalyticsProvider {
  readonly source = "tinybird" as const;
  private config: TinybirdConfig;

  constructor(config: TinybirdConfig) {
    this.config = config;
  }

  async ingest(events: AnalyticsEvent[]): Promise<void> {
    if (events.length === 0) return;
    const body = events
      .map((e) =>
        JSON.stringify({
          event_id: e.eventId,
          site_id: e.siteId,
          event_type: e.eventType,
          session_id: e.sessionId,
          visitor_hash: e.visitorHash,
          pathname: e.pathname,
          referrer_host: e.referrerHost ?? "",
          country: e.country ?? "",
          device: e.device ?? "",
          tracker_public_key: e.trackerPublicKey ?? "",
          decision: e.decision ?? "valid",
          occurred_at: e.occurredAt,
        }),
      )
      .join("\n");
    const res = await fetch(`${this.config.apiUrl}/v0/events?name=tracker_events`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.config.ingestToken}`,
        "Content-Type": "application/json",
      },
      body,
    });
    if (!res.ok) {
      throw new Error(`Tinybird ingest failed: ${res.status} ${await res.text()}`);
    }
  }

  private async query<T>(pipe: string, params: Record<string, string>): Promise<T[]> {
    const url = new URL(`${this.config.apiUrl}/v0/pipes/${pipe}`);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${this.config.readToken}` },
    });
    if (!res.ok) {
      throw new Error(`Tinybird query failed: ${pipe} ${res.status}`);
    }
    const json = (await res.json()) as { data: T[] };
    return json.data;
  }

  async getLeaderboard(input: LeaderboardQuery): Promise<LeaderboardResult> {
    const data = await this.query<{ site_id: string; visitors: number; pageviews: number; active_now: number }>(
      "leaderboard",
      {
        window: input.window,
        ...(input.categorySlug ? { category: input.categorySlug } : {}),
        limit: String(input.limit ?? 50),
        offset: String(input.offset ?? 0),
      },
    );
    return {
      sites: data.map((d) => ({
        siteId: d.site_id,
        visitors: Number(d.visitors),
        pageviews: Number(d.pageviews),
        activeNow: Number(d.active_now),
        engagementRate: null,
        avgEngagementSeconds: null,
      })),
      generatedAt: new Date().toISOString(),
      source: "tinybird",
    };
  }

  async getSiteMetrics(siteId: string, window: MetricWindow): Promise<SiteMetrics> {
    const data = await this.query<{
      visitors: number;
      pageviews: number;
      active_now: number;
      sessions: number;
      engaged_sessions: number;
      active_sessions: number;
      attributed_visits: number;
      attributed_engaged_visits: number;
      engagement_rate: number | null;
      avg_engagement_seconds: number | null;
    }>("site_metrics", { siteId, window });
    const d = data[0];
    return {
      siteId,
      visitors: Number(d?.visitors ?? 0),
      pageviews: Number(d?.pageviews ?? 0),
      activeNow: Number(d?.active_now ?? 0),
      activeLast30m: Number(d?.active_now ?? 0),
      sessions: Number(d?.sessions ?? 0),
      engagedSessions: Number(d?.engaged_sessions ?? 0),
      activeSessions: Number(d?.active_sessions ?? 0),
      attributedVisits: Number(d?.attributed_visits ?? 0),
      attributedEngagedVisits: Number(d?.attributed_engaged_visits ?? 0),
      engagementRate: d?.engagement_rate != null ? Number(d.engagement_rate) : null,
      avgEngagementSeconds: d?.avg_engagement_seconds != null ? Number(d.avg_engagement_seconds) : null,
      generatedAt: new Date().toISOString(),
    };
  }

  async getTimeSeries(siteId: string, input: TimeSeriesQuery): Promise<TimeSeriesPoint[]> {
    const data = await this.query<{ t: string; value: number }>("site_timeseries", {
      siteId,
      window: input.window,
      metric: input.metric,
    });
    return data.map((d) => ({ t: new Date(d.t).toISOString(), value: Number(d.value) }));
  }
}

/** Queue-facing Tinybird adapter. It never falls back to PostgreSQL. */
export class TinybirdEventStoreProvider implements EventStoreProvider {
  private readonly provider: TinybirdAnalyticsProvider;

  constructor(config: TinybirdConfig) {
    this.provider = new TinybirdAnalyticsProvider(config);
  }

  async hasEvent(eventId: string): Promise<boolean> {
    try {
      const rows = await (this.provider as unknown as { query<T>(pipe: string, params: Record<string, string>): Promise<T[]> }).query<{ event_id: string }>("event_exists", { event_id: eventId });
      return rows.some((row) => row.event_id === eventId);
    } catch {
      // A missing optional read pipe is treated as unknown, not as proof that
      // an event is new. Queue-level deduplication remains authoritative.
      return false;
    }
  }

  async ingest(events: NormalizedTrackerEvent[]): Promise<IngestResult> {
    if (!events.length) return { inserted: 0, duplicates: 0, rejected: 0 };
    await this.provider.ingest(events.map((event) => ({
      eventId: event.eventId,
      siteId: event.siteId,
      eventType: event.eventType,
      sessionId: event.sessionHash,
      visitorHash: event.visitorHash,
      pathname: event.pathname,
      referrerHost: event.referrerHost,
      country: event.country,
      device: event.device,
      trackerPublicKey: event.trackerPublicKey,
      occurredAt: event.occurredAt,
      decision: event.decision,
      reasons: event.fraudReasonCodes,
      visible: event.visible,
      engagedSeconds: event.engagedSeconds,
      trackerVersion: event.trackerVersion,
      attributionTokenHash: event.attributionTokenHash,
      originHost: event.originHost,
      fraudScore: event.fraudScore,
      fraudRuleVersion: event.fraudRuleVersion,
      collectorRequestId: event.collectorRequestId,
      isDemo: event.isDemo,
    })));
    return { inserted: events.length, duplicates: 0, rejected: events.filter((event) => event.decision !== "valid").length };
  }
}
