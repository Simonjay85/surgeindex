import { pruneRealtimeSessions, type TrackerEventType } from "@surge/shared";

interface Env { REALTIME: DurableObjectNamespace; ACTIVE_SESSION_TTL_SECONDS?: string; REALTIME_SIGNAL_TOKEN?: string; }
type Signal = { eventType: TrackerEventType; visitorHash: string; sessionHash: string; visible: boolean; receivedAt: string; decision: "valid" | "suspected" | "invalid" | "review_required" };
type SessionState = { visitorHash: string; lastSeen: number; visible: boolean };
type Snapshot = { activeVisitors: number; activeSessions: number; updatedAt: string };

/** One object coordinates a site, never an individual browser visitor. */
export class RealtimeRoom implements DurableObject {
  private readonly state: DurableObjectState;
  private readonly sockets = new Set<WebSocket>();
  private lastBroadcast: string | null = null;
  private lastBroadcastAt = 0;
  private readonly ttlMs: number;
  private readonly signalToken: string | undefined;

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    const ttl = Number(env.ACTIVE_SESSION_TTL_SECONDS ?? 90);
    this.ttlMs = (Number.isFinite(ttl) && ttl >= 30 ? Math.min(ttl, 600) : 90) * 1000;
    this.signalToken = env.REALTIME_SIGNAL_TOKEN;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/ws") return this.openWebSocket();
    if (url.pathname === "/snapshot" && request.method === "GET") return Response.json(await this.snapshot(true));
    if (url.pathname === "/signal" && request.method === "POST") {
      const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
      if (!this.signalToken || supplied !== this.signalToken) {
        // Consume an unauthenticated request body before returning through the
        // Durable Object proxy; local Wrangler otherwise reports a stream
        // read-after-response exception for rejected POST bodies.
        await request.arrayBuffer().catch(() => undefined);
        return Response.json({ error: "service_auth_required" }, { status: 401 });
      }
      let signal: Signal;
      try { signal = await request.json() as Signal; } catch { return Response.json({ error: "invalid_signal" }, { status: 422 }); }
      const snapshot = await this.apply(signal);
      return Response.json(snapshot);
    }
    return new Response("not found", { status: 404 });
  }

  async alarm() {
    const snapshot = await this.snapshot(true);
    await this.broadcastIfChanged(snapshot);
    await this.state.storage.setAlarm(Date.now() + 30_000);
  }

  private openWebSocket() {
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair) as [WebSocket, WebSocket];
    this.state.acceptWebSocket(server);
    this.sockets.add(server);
    void this.snapshot().then((snapshot) => { try { server.send(JSON.stringify(snapshot)); } catch { this.sockets.delete(server); } });
    return new Response(null, { status: 101, webSocket: client });
  }

  webSocketClose(ws: WebSocket) { this.sockets.delete(ws); }
  webSocketError(ws: WebSocket) { this.sockets.delete(ws); }
  webSocketMessage() { /* Clients do not contribute visitor presence. */ }

  private async apply(signal: Signal): Promise<Snapshot> {
    if (signal.decision !== "valid") return this.snapshot();
    const sessions = await this.readSessions();
    if (signal.eventType === "session_end") sessions.delete(signal.sessionHash);
    else if (["session_start", "pageview", "heartbeat"].includes(signal.eventType)) sessions.set(signal.sessionHash, { visitorHash: signal.visitorHash, lastSeen: Date.parse(signal.receivedAt) || Date.now(), visible: signal.eventType === "heartbeat" ? signal.visible : true });
    const snapshot = await this.writeSnapshot(sessions);
    await this.broadcastIfChanged(snapshot);
    await this.state.storage.setAlarm(Date.now() + 30_000);
    return snapshot;
  }

  private async snapshot(clean = false): Promise<Snapshot> {
    const sessions = await this.readSessions();
    const ttl = this.ttlMs;
    const now = Date.now();
    if (clean) pruneRealtimeSessions(sessions, now, ttl);
    return this.writeSnapshot(sessions);
  }

  private async readSessions() {
    const stored = await this.state.storage.get<Record<string, SessionState>>("sessions");
    return new Map<string, SessionState>(Object.entries(stored ?? {}));
  }

  private async writeSnapshot(sessions: Map<string, SessionState>): Promise<Snapshot> {
    await this.state.storage.put("sessions", Object.fromEntries(sessions));
    const visitors = new Set([...sessions.values()].map((value) => value.visitorHash));
    return { activeVisitors: visitors.size, activeSessions: sessions.size, updatedAt: new Date().toISOString() };
  }

  private async broadcastIfChanged(snapshot: Snapshot) {
    const message = JSON.stringify(snapshot);
    const countsChanged = !this.lastBroadcast || JSON.parse(this.lastBroadcast).activeVisitors !== snapshot.activeVisitors || JSON.parse(this.lastBroadcast).activeSessions !== snapshot.activeSessions;
    if (!countsChanged || Date.now() - this.lastBroadcastAt < 1000) return;
    this.lastBroadcast = message;
    this.lastBroadcastAt = Date.now();
    for (const socket of this.sockets) {
      try { socket.send(message); } catch { this.sockets.delete(socket); }
    }
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const topic = url.searchParams.get("topic") ?? "site/unknown";
    const id = env.REALTIME.idFromName(topic);
    return env.REALTIME.get(id).fetch(request);
  },
};
