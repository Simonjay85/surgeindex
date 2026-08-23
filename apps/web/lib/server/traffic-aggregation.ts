import "server-only";

import { and, eq, gt, isNotNull, lt, sql } from "drizzle-orm";
import { getServerEnv } from "@surge/config";
import { activityEvent, activeSession, aggregationJobState, getPostgresDb, trackerEvent, trackerKey } from "@surge/db";

export async function runTrafficAggregation() {
  const db = getPostgresDb();
  const now = new Date();
  const env = getServerEnv();
  const cutoff = new Date(now.getTime() - env.ACTIVE_SESSION_TTL_SECONDS * 2 * 1000);
  await db.insert(aggregationJobState).values({ jobKey: "traffic", lastStartedAt: now, updatedAt: now }).onConflictDoUpdate({ target: aggregationJobState.jobKey, set: { lastStartedAt: now, lastError: null, updatedAt: now } });
  try {
  const staleKeys = await db.select({ id: trackerKey.id, siteId: trackerKey.siteId, lastEventAt: trackerKey.lastEventAt }).from(trackerKey).where(and(eq(trackerKey.status, "active"), isNotNull(trackerKey.lastEventAt), lt(trackerKey.lastEventAt, cutoff)));
  for (const key of staleKeys) {
    await db.transaction(async (tx) => {
      await tx.update(trackerKey).set({ status: "stale" }).where(and(eq(trackerKey.id, key.id), eq(trackerKey.status, "active")));
      const [recent] = await tx.select({ id: activityEvent.id }).from(activityEvent).where(and(eq(activityEvent.siteId, key.siteId), eq(activityEvent.type, "tracker_stale"), gt(activityEvent.occurredAt, new Date(now.getTime() - 24 * 60 * 60 * 1000)))).limit(1);
      if (!recent) await tx.insert(activityEvent).values({ type: "tracker_stale", siteId: key.siteId, detail: "No accepted tracker event arrived within the freshness window.", isDemo: false });
    });
  }
  await db.delete(activeSession).where(sql`${activeSession.hidden} = true or ${activeSession.lastHeartbeatAt} < now() - (${env.ACTIVE_SESSION_TTL_SECONDS} || ' seconds')::interval`);
  await db.execute(sql`
    update site_metric_current current
    set
      active_now = coalesce((select count(distinct live.visitor_hash)::int from active_session live where live.site_id = current.site_id and live.hidden = false and live.last_heartbeat_at >= now() - (${env.ACTIVE_SESSION_TTL_SECONDS} || ' seconds')::interval), 0),
      active_sessions = coalesce((select count(*)::int from active_session live where live.site_id = current.site_id and live.hidden = false and live.last_heartbeat_at >= now() - (${env.ACTIVE_SESSION_TTL_SECONDS} || ' seconds')::interval), 0),
      active_last_30m = coalesce((select count(distinct recent.visitor_hash)::int from active_session recent where recent.site_id = current.site_id and recent.hidden = false and recent.last_heartbeat_at >= now() - interval '30 minutes'), 0),
      updated_at = now()
  `);
  await db.update(aggregationJobState).set({ lastCompletedAt: now, updatedAt: now }).where(eq(aggregationJobState.jobKey, "traffic"));
    return { staleTrackers: staleKeys.length, completedAt: now.toISOString() };
  } catch (error) {
    await db.update(aggregationJobState).set({ lastError: error instanceof Error ? error.name : "unknown_error", updatedAt: new Date() }).where(eq(aggregationJobState.jobKey, "traffic"));
    throw error;
  }
}

export async function getTrafficOperationalSummary() {
  const db = getPostgresDb();
  const [events] = (await db.execute(sql`
    select
      count(*) filter (where received_at >= now() - interval '24 hours')::int as events_received,
      count(*) filter (where received_at >= now() - interval '24 hours' and decision = 'valid')::int as events_accepted,
      count(*) filter (where received_at >= now() - interval '24 hours' and decision <> 'valid')::int as events_rejected,
      count(*) filter (where received_at >= now() - interval '24 hours' and decision in ('suspected','review_required'))::int as suspected_events
    from tracker_event
  `)).rows as [Record<string, unknown> | undefined];
  const [failures] = (await db.execute(sql`select count(*)::int as count from ingestion_failure where created_at >= now() - interval '24 hours'`)).rows as [Record<string, unknown> | undefined];
  const [sites] = (await db.execute(sql`select count(*) filter (where status in ('active','stale'))::int as connected_sites, count(*) filter (where status = 'stale')::int as stale_trackers from tracker_key`)).rows as [Record<string, unknown> | undefined];
  const latest = await db.select({ receivedAt: trackerEvent.receivedAt }).from(trackerEvent).where(and(eq(trackerEvent.decision, "valid"), sql`${trackerEvent.trafficOrigin} <> 'paid_surgedindex_referral'`)).orderBy(sql`${trackerEvent.receivedAt} desc`).limit(1);
  return {
    eventsReceived: number(events?.events_received),
    eventsAccepted: number(events?.events_accepted),
    eventsRejected: number(events?.events_rejected),
    suspectedEvents: number(events?.suspected_events),
    ingestionFailures: number(failures?.count),
    connectedSites: number(sites?.connected_sites),
    staleTrackers: number(sites?.stale_trackers),
    queueLagSeconds: null,
    realtime: getServerEnv().REALTIME_PROVIDER,
    lastAcceptedEventAt: latest[0]?.receivedAt.toISOString() ?? null,
  };
}

function number(value: unknown) {
  const result = Number(value ?? 0);
  return Number.isFinite(result) ? result : 0;
}
