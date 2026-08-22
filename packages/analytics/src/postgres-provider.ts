import { and, desc, eq, gt, isNull, lt, sql } from "drizzle-orm";
import { getPostgresDb, activeSession, activityEvent, attributionRecord, site, siteMetricCurrent, siteMetricSnapshot, siteVerification, trackerEvent, trackerKey, fraudFlag, outboundClick } from "@surge/db";
import type { NormalizedTrackerEvent } from "@surge/shared";
import type {
  AnalyticsEvent,
  AnalyticsProvider,
  EventStoreProvider,
  IngestResult,
  LeaderboardQuery,
  LeaderboardResult,
  MetricWindow,
  SiteMetrics,
  TimeSeriesPoint,
  TimeSeriesQuery,
} from "./types";
import { DemoAnalyticsProvider } from "./demo-provider";

const WINDOW_SECONDS: Record<MetricWindow, number> = {
  live: 15 * 60,
  "24h": 24 * 60 * 60,
  "7d": 7 * 24 * 60 * 60,
  "30d": 30 * 24 * 60 * 60,
  "90d": 90 * 24 * 60 * 60,
};

const activeTtlSeconds = () => {
  const value = Number(process.env.ACTIVE_SESSION_TTL_SECONDS ?? 90);
  return Number.isFinite(value) && value >= 30 ? Math.min(value, 600) : 90;
};

const attributionTtlMinutes = () => {
  const value = Number(process.env.ATTRIBUTION_TTL_MINUTES ?? 30);
  return Number.isFinite(value) && value >= 1 ? Math.min(value, 1440) : 30;
};

/**
 * PostgreSQL is the local/staging event store. It keeps raw browser IDs out of
 * the database: the collector has already converted them to rotating hashes.
 * Every write is idempotent on tracker_event.event_id.
 */
export class PostgresEventStoreProvider implements EventStoreProvider {
  async hasEvent(eventId: string): Promise<boolean> {
    const db = getPostgresDb();
    const [row] = await db.select({ eventId: trackerEvent.eventId }).from(trackerEvent).where(eq(trackerEvent.eventId, eventId)).limit(1);
    return Boolean(row);
  }

  async ingest(events: NormalizedTrackerEvent[]): Promise<IngestResult> {
    if (!events.length) return { inserted: 0, duplicates: 0, rejected: 0 };
    const db = getPostgresDb();
    let inserted = 0;
    let duplicates = 0;
    const siteIds = new Set<string>();
    await db.transaction(async (tx) => {
      for (const event of events) {
        const [row] = await tx
          .insert(trackerEvent)
          .values({
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
            visible: event.visible,
            engagedSeconds: event.engagedSeconds,
            trackerVersion: event.trackerVersion,
            attributionTokenHash: event.attributionTokenHash,
            originHost: event.originHost,
            fraudScore: event.fraudScore,
            fraudRuleVersion: event.fraudRuleVersion,
            collectorRequestId: event.collectorRequestId,
            decision: event.decision,
            reasons: event.fraudReasonCodes,
            occurredAt: new Date(event.occurredAt),
            receivedAt: new Date(event.receivedAt),
            isDemo: event.isDemo,
          })
          .onConflictDoNothing({ target: trackerEvent.eventId })
          .returning({ eventId: trackerEvent.eventId });
        if (!row) {
          duplicates += 1;
          continue;
        }
        inserted += 1;
        siteIds.add(event.siteId);
        if (event.decision !== "valid") {
          await tx.insert(fraudFlag).values({
            siteId: event.siteId,
            subjectType: "event",
            subjectRef: event.eventId,
            signals: event.fraudReasonCodes,
            score: event.fraudScore,
            decision: event.decision,
            ruleVersion: event.fraudRuleVersion,
          });
          continue;
        }
        await updateActiveSession(tx, event);
        await updateAttribution(tx, event);
        await markTrackerConnected(tx, event);
      }
      for (const siteId of siteIds) await recomputeSiteMetrics(tx, siteId);
    });
    return {
      inserted,
      duplicates,
      rejected: events.filter((event) => event.decision !== "valid").length,
    };
  }
}

async function updateActiveSession(tx: Parameters<Parameters<ReturnType<typeof getPostgresDb>["transaction"]>[0]>[0], event: NormalizedTrackerEvent) {
  const timestamp = new Date(event.occurredAt);
  if (event.eventType === "session_end") {
    await tx.delete(activeSession).where(and(eq(activeSession.siteId, event.siteId), eq(activeSession.sessionId, event.sessionHash)));
    return;
  }
  if (!["session_start", "pageview", "heartbeat"].includes(event.eventType)) return;
  await tx
    .insert(activeSession)
    .values({
      sessionId: event.sessionHash,
      siteId: event.siteId,
      visitorHash: event.visitorHash,
      startedAt: timestamp,
      lastHeartbeatAt: timestamp,
      hidden: event.visible === false,
      lastEventAt: timestamp,
    })
    .onConflictDoUpdate({
      target: activeSession.sessionId,
      set: {
        lastHeartbeatAt: timestamp,
        lastEventAt: timestamp,
        hidden: event.visible === false,
        visitorHash: event.visitorHash,
      },
    });
}

async function updateAttribution(tx: Parameters<Parameters<ReturnType<typeof getPostgresDb>["transaction"]>[0]>[0], event: NormalizedTrackerEvent) {
  if (event.attributionTokenHash && event.attributionClickId && event.eventType === "pageview") {
    const [created] = await tx
      .insert(attributionRecord)
      .values({
        siteId: event.siteId,
        outboundClickId: event.attributionClickId,
        tokenHash: event.attributionTokenHash,
        visitorHash: event.visitorHash,
        sessionHash: event.sessionHash,
        landingEventId: event.eventId,
        expiresAt: new Date(Date.now() + attributionTtlMinutes() * 60 * 1000),
      })
      .onConflictDoNothing({ target: attributionRecord.tokenHash })
      .returning({ id: attributionRecord.id });
    if (created) {
      const [recent] = await tx
        .select({ id: activityEvent.id })
        .from(activityEvent)
        .where(and(eq(activityEvent.siteId, event.siteId), eq(activityEvent.type, "surgeindex_attributed_visit"), gt(activityEvent.occurredAt, new Date(Date.now() - 24 * 60 * 60 * 1000))))
        .limit(1);
      if (!recent) {
        await tx.insert(activityEvent).values({
          type: "surgeindex_attributed_visit",
          siteId: event.siteId,
          detail: "First SurgeIndex-attributed visit detected.",
          isDemo: false,
        });
      }
    }
  }
  if (event.eventType === "engaged") {
    await tx
      .update(attributionRecord)
      .set({ engagedAt: new Date(event.occurredAt) })
      .where(and(eq(attributionRecord.siteId, event.siteId), eq(attributionRecord.sessionHash, event.sessionHash), isNull(attributionRecord.engagedAt), gt(attributionRecord.expiresAt, new Date())));
  }
}

async function markTrackerConnected(tx: Parameters<Parameters<ReturnType<typeof getPostgresDb>["transaction"]>[0]>[0], event: NormalizedTrackerEvent) {
  const [key] = await tx.select({ lastEventAt: trackerKey.lastEventAt, status: trackerKey.status }).from(trackerKey).where(eq(trackerKey.publicKey, event.trackerPublicKey)).limit(1);
  const now = new Date(event.receivedAt);
  const wasStale = key?.lastEventAt ? now.getTime() - key.lastEventAt.getTime() > activeTtlSeconds() * 1000 : false;
  await tx
    .update(trackerKey)
    .set({ status: "active", activatedAt: key?.lastEventAt ? undefined : now, lastEventAt: now, lastOrigin: event.originHost, lastError: null })
    .where(and(eq(trackerKey.publicKey, event.trackerPublicKey), sql`${trackerKey.status} in ('active','stale')`));
  await tx
    .insert(siteVerification)
    .values({ siteId: event.siteId, source: "tracker", method: "tracker", status: "active", verifiedAt: now, lastSyncAt: now, evidence: { trackerVersion: event.trackerVersion, origin: event.originHost } })
    .onConflictDoUpdate({ target: siteVerification.siteId, set: { source: "tracker", method: "tracker", status: "active", lastSyncAt: now, lastError: null, evidence: { trackerVersion: event.trackerVersion, origin: event.originHost }, updatedAt: now } });
  await tx.update(site).set({ verification: "tracker", updatedAt: now }).where(eq(site.id, event.siteId));
  if (!key?.lastEventAt) {
    await tx.insert(activityEvent).values([
      { type: "tracker_first_detected", siteId: event.siteId, detail: "The first valid tracker event was accepted.", isDemo: false },
      { type: "tracker_connected", siteId: event.siteId, detail: "Tracker measurement is connected.", isDemo: false },
    ]);
  } else if (wasStale) {
    await tx.insert(activityEvent).values({ type: "tracker_reconnected", siteId: event.siteId, detail: "Tracker measurement resumed after becoming stale.", isDemo: false });
  }
}

async function recomputeSiteMetrics(tx: Parameters<Parameters<ReturnType<typeof getPostgresDb>["transaction"]>[0]>[0], siteId: string) {
  const ttl = activeTtlSeconds();
  const statsResult = await tx.execute(sql`
    select
      count(distinct visitor_hash) filter (where decision = 'valid' and occurred_at >= now() - interval '24 hours' and event_type in ('pageview','session_start'))::int as visitors_24h,
      count(distinct visitor_hash) filter (where decision = 'valid' and occurred_at >= now() - interval '7 days' and event_type in ('pageview','session_start'))::int as visitors_7d,
      count(*) filter (where decision = 'valid' and occurred_at >= now() - interval '24 hours' and event_type = 'pageview')::int as pageviews_24h,
      count(distinct session_id) filter (where decision = 'valid' and occurred_at >= now() - interval '24 hours' and event_type in ('pageview','session_start'))::int as sessions_24h,
      count(distinct session_id) filter (where decision = 'valid' and occurred_at >= now() - interval '24 hours' and event_type = 'engaged')::int as engaged_sessions_24h,
      coalesce(avg(engaged_seconds) filter (where decision = 'valid' and occurred_at >= now() - interval '24 hours' and event_type = 'engaged'), 0)::int as avg_engagement_seconds,
      count(*) filter (where occurred_at >= now() - interval '24 hours' and decision = 'valid')::int as accepted_events_24h,
      count(*) filter (where occurred_at >= now() - interval '24 hours' and decision = 'suspected')::int as suspected_events_24h,
      count(*) filter (where occurred_at >= now() - interval '24 hours' and decision in ('invalid','review_required'))::int as invalid_events_24h,
      max(occurred_at) filter (where decision = 'valid') as last_accepted_event_at
    from tracker_event where site_id = ${siteId}
  `);
  const stats = (statsResult.rows[0] ?? {}) as Record<string, unknown>;
  const activeResult = await tx.execute(sql`
    select count(*)::int as active_sessions, count(distinct visitor_hash)::int as active_visitors
    from active_session
    where site_id = ${siteId} and hidden = false and last_heartbeat_at >= now() - (${ttl} || ' seconds')::interval
  `);
  const active = (activeResult.rows[0] ?? {}) as Record<string, unknown>;
  const attributionResult = await tx.execute(sql`
    select
      count(*) filter (where created_at >= now() - interval '24 hours')::int as attributed_visits,
      count(*) filter (where engaged_at is not null and engaged_at >= now() - interval '24 hours')::int as attributed_engaged
    from attribution_record where site_id = ${siteId} and expires_at >= now() - interval '24 hours'
  `);
  const attribution = (attributionResult.rows[0] ?? {}) as Record<string, unknown>;
  const clickResult = await tx.execute(sql`select count(*) filter (where occurred_at >= now() - interval '24 hours' and valid = true)::int as referral_clicks from outbound_click where site_id = ${siteId}`);
  const clicks = (clickResult.rows[0] ?? {}) as Record<string, unknown>;
  const visitors24h = numberValue(stats.visitors_24h);
  const sessions24h = numberValue(stats.sessions_24h);
  const engagedSessions24h = numberValue(stats.engaged_sessions_24h);
  const now = new Date();
  const current = {
    siteId,
    activeNow: numberValue(active.active_visitors),
    activeLast30m: numberValue(active.active_visitors),
    visitors24h,
    visitors7d: numberValue(stats.visitors_7d),
    pageviews24h: numberValue(stats.pageviews_24h),
    sessions24h,
    engagedSessions24h,
    activeSessions: numberValue(active.active_sessions),
    surgeAttributedVisits24h: numberValue(attribution.attributed_visits),
    surgeAttributedEngagedVisits24h: numberValue(attribution.attributed_engaged),
    surgeReferrals24h: numberValue(clicks.referral_clicks),
    engagementRate: sessions24h > 0 ? String(engagedSessions24h / sessions24h) : null,
    avgEngagementSeconds: numberValue(stats.avg_engagement_seconds) || null,
    acceptedEvents24h: numberValue(stats.accepted_events_24h),
    suspectedEvents24h: numberValue(stats.suspected_events_24h),
    invalidEvents24h: numberValue(stats.invalid_events_24h),
    lastAcceptedEventAt: stats.last_accepted_event_at ? new Date(String(stats.last_accepted_event_at)) : null,
    updatedAt: now,
    isDemo: false,
  };
  const [lastEvent] = await tx.select({ originHost: trackerEvent.originHost, trackerVersion: trackerEvent.trackerVersion }).from(trackerEvent).where(and(eq(trackerEvent.siteId, siteId), eq(trackerEvent.decision, "valid"))).orderBy(desc(trackerEvent.receivedAt)).limit(1);
  await tx
    .insert(siteMetricCurrent)
    .values({ ...current, lastDetectedOrigin: lastEvent?.originHost ?? null, trackerVersion: lastEvent?.trackerVersion ?? null })
    .onConflictDoUpdate({ target: siteMetricCurrent.siteId, set: { ...current, lastDetectedOrigin: lastEvent?.originHost ?? null, trackerVersion: lastEvent?.trackerVersion ?? null } });

  const capturedAt = new Date(now);
  capturedAt.setMinutes(0, 0, 0);
  const [existingSnapshot] = await tx.select({ id: siteMetricSnapshot.id }).from(siteMetricSnapshot).where(and(eq(siteMetricSnapshot.siteId, siteId), eq(siteMetricSnapshot.granularity, "hour"), eq(siteMetricSnapshot.capturedAt, capturedAt))).limit(1);
  if (!existingSnapshot) {
    await tx.insert(siteMetricSnapshot).values({ siteId, granularity: "hour", visitors: visitors24h, sessions: sessions24h, pageviews: numberValue(stats.pageviews_24h), engagedSessions: engagedSessions24h, attributedVisits: numberValue(attribution.attributed_visits), activeNow: numberValue(active.active_visitors), heatScore: 0, capturedAt });
  }
}

function numberValue(value: unknown): number {
  const result = Number(value ?? 0);
  return Number.isFinite(result) ? result : 0;
}

/** Full analytics provider for the Postgres selection. */
export class PostgresAnalyticsProvider extends DemoAnalyticsProvider implements AnalyticsProvider {
  readonly source = "postgres" as const;

  async ingest(events: AnalyticsEvent[]): Promise<void> {
    const normalized: NormalizedTrackerEvent[] = events.map((event) => ({
      eventId: event.eventId,
      eventType: event.eventType,
      siteId: event.siteId,
      visitorHash: event.visitorHash,
      sessionHash: event.sessionId,
      pathname: event.pathname,
      referrerHost: event.referrerHost ?? null,
      receivedAt: new Date().toISOString(),
      occurredAt: event.occurredAt,
      clientOccurredAt: event.occurredAt,
      visible: event.visible !== false,
      engagedSeconds: event.engagedSeconds ?? null,
      trackerVersion: event.trackerVersion ?? "1.0.0",
      attributionTokenHash: event.attributionTokenHash ?? null,
      attributionClickId: null,
      trackerPublicKey: event.trackerPublicKey ?? "",
      originHost: event.originHost ?? null,
      country: event.country ?? null,
      device: (event.device as NormalizedTrackerEvent["device"]) ?? "unknown",
      decision: event.decision ?? "valid",
      fraudScore: event.fraudScore ?? 0,
      fraudReasonCodes: event.reasons ?? [],
      fraudRuleVersion: event.fraudRuleVersion ?? "v1",
      collectorRequestId: event.collectorRequestId ?? "analytics",
      isDemo: event.isDemo ?? false,
    }));
    await new PostgresEventStoreProvider().ingest(normalized);
  }

  async getSiteMetrics(siteId: string, window: MetricWindow): Promise<SiteMetrics> {
    const db = getPostgresDb();
    const seconds = WINDOW_SECONDS[window];
    const rowResult = await db.execute(sql`
      select
        count(distinct visitor_hash)::int as visitors,
        count(*) filter (where event_type = 'pageview')::int as pageviews,
        count(distinct session_id) filter (where event_type in ('pageview','session_start'))::int as sessions,
        count(distinct session_id) filter (where event_type = 'engaged')::int as engaged_sessions,
        coalesce(avg(engaged_seconds) filter (where event_type = 'engaged'), 0)::int as avg_engagement_seconds
      from tracker_event
      where site_id = ${siteId} and decision = 'valid' and occurred_at >= now() - (${seconds} || ' seconds')::interval
    `);
    const activeResult = await db.execute(sql`
      select count(distinct visitor_hash)::int as active_visitors, count(*)::int as active_sessions
      from active_session where site_id = ${siteId} and hidden = false and last_heartbeat_at >= now() - (${activeTtlSeconds()} || ' seconds')::interval
    `);
    const row = rowResult.rows[0] as Record<string, unknown> | undefined;
    const active = activeResult.rows[0] as Record<string, unknown> | undefined;
    const visitors = numberValue(row?.visitors);
    const sessions = numberValue(row?.sessions);
    return {
      siteId,
      visitors,
      pageviews: numberValue(row?.pageviews),
      activeNow: numberValue(active?.active_visitors),
      activeLast30m: numberValue(active?.active_visitors),
      sessions,
      engagedSessions: numberValue(row?.engaged_sessions),
      activeSessions: numberValue(active?.active_sessions),
      engagementRate: sessions ? numberValue(row?.engaged_sessions) / sessions : null,
      avgEngagementSeconds: numberValue(row?.avg_engagement_seconds) || null,
      generatedAt: new Date().toISOString(),
    };
  }

  async getTimeSeries(siteId: string, input: TimeSeriesQuery): Promise<TimeSeriesPoint[]> {
    const db = getPostgresDb();
    const seconds = WINDOW_SECONDS[input.window];
    const bucketMinutes = input.bucketMinutes ?? (input.window === "live" ? 5 : input.window === "24h" ? 60 : 360);
    const metricExpression = input.metric === "pageviews" ? sql`count(*)` : input.metric === "active" ? sql`count(distinct session_id)` : input.metric === "referrals" ? sql`0` : sql`count(distinct visitor_hash)`;
    const filter = input.metric === "pageviews" ? sql`and event_type = 'pageview'` : sql``;
    const result = await db.execute(sql`
      select to_timestamp(floor(extract(epoch from occurred_at) / ${bucketMinutes * 60}) * ${bucketMinutes * 60}) as bucket,
        ${metricExpression}::int as value
      from tracker_event
      where site_id = ${siteId} and decision = 'valid' and occurred_at >= now() - (${seconds} || ' seconds')::interval ${filter}
      group by bucket order by bucket asc
    `);
    return result.rows.map((row) => ({ t: new Date(String(row.bucket)).toISOString(), value: numberValue(row.value) }));
  }
}
