import type { RealtimeSnapshot } from "./traffic";

export interface RealtimeSessionState {
  visitorHash: string;
  lastSeen: number;
  visible: boolean;
}

export function pruneRealtimeSessions(sessions: Map<string, RealtimeSessionState>, now: number, ttlMs: number): void {
  for (const [sessionId, state] of sessions) {
    if (!state.visible || now - state.lastSeen > ttlMs) sessions.delete(sessionId);
  }
}

export function snapshotRealtimeSessions(siteId: string, sessions: Map<string, RealtimeSessionState>, now: number): RealtimeSnapshot {
  return {
    siteId,
    activeVisitors: new Set([...sessions.values()].map((state) => state.visitorHash)).size,
    activeSessions: sessions.size,
    updatedAt: new Date(now).toISOString(),
  };
}
