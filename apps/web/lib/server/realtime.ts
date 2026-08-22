import "server-only";

import { getServerEnv } from "@surge/config";
import { pruneRealtimeSessions, snapshotRealtimeSessions, type NormalizedTrackerEvent, type RealtimeSnapshot } from "@surge/shared";

type SessionState = { visitorHash: string; lastSeen: number; visible: boolean };
type Listener = (snapshot: RealtimeSnapshot) => void;

/** Local development/test adapter for the site-level realtime object. */
class LocalRealtimeRegistry {
  private readonly sites = new Map<string, Map<string, SessionState>>();
  private readonly listeners = new Map<string, Set<Listener>>();

  accept(event: NormalizedTrackerEvent): RealtimeSnapshot | null {
    if (event.decision !== "valid") return null;
    let sessions = this.sites.get(event.siteId);
    if (!sessions) {
      sessions = new Map();
      this.sites.set(event.siteId, sessions);
    }
    if (event.eventType === "session_end") {
      sessions.delete(event.sessionHash);
    } else if (["session_start", "pageview", "heartbeat"].includes(event.eventType)) {
      sessions.set(event.sessionHash, {
        visitorHash: event.visitorHash,
        lastSeen: Date.parse(event.receivedAt),
        visible: event.eventType === "heartbeat" ? event.visible : event.visible !== false,
      });
    }
    return this.snapshot(event.siteId);
  }

  snapshot(siteId: string, now = Date.now()): RealtimeSnapshot {
    const sessions = this.sites.get(siteId) ?? new Map<string, SessionState>();
    const ttl = Number(process.env.ACTIVE_SESSION_TTL_SECONDS ?? 90) * 1000;
    pruneRealtimeSessions(sessions, now, ttl);
    const snapshot = snapshotRealtimeSessions(siteId, sessions, now);
    for (const listener of this.listeners.get(siteId) ?? []) listener(snapshot);
    return snapshot;
  }

  subscribe(siteId: string, listener: Listener): () => void {
    const listeners = this.listeners.get(siteId) ?? new Set<Listener>();
    listeners.add(listener);
    this.listeners.set(siteId, listeners);
    return () => listeners.delete(listener);
  }
}

export const localRealtimeRegistry = new LocalRealtimeRegistry();

export async function getRealtimeSnapshot(siteId: string): Promise<RealtimeSnapshot> {
  const env = getServerEnv();
  if (env.REALTIME_PROVIDER === "local") return localRealtimeRegistry.snapshot(siteId);
  if (!env.REALTIME_SERVICE_URL) throw new Error("realtime_service_url_missing");
  const url = new URL("/snapshot", env.REALTIME_SERVICE_URL);
  url.searchParams.set("topic", `site/${siteId}`);
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`realtime_snapshot_${response.status}`);
  const snapshot = await response.json() as Partial<RealtimeSnapshot>;
  if (typeof snapshot.activeVisitors !== "number" || typeof snapshot.activeSessions !== "number") throw new Error("realtime_snapshot_invalid");
  return {
    siteId,
    activeVisitors: snapshot.activeVisitors,
    activeSessions: snapshot.activeSessions,
    updatedAt: typeof snapshot.updatedAt === "string" ? snapshot.updatedAt : new Date().toISOString(),
  };
}
