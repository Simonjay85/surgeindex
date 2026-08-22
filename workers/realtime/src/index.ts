/**
 * Realtime worker — Durable Objects coordinating live active-session counts
 * and broadcasting leaderboard updates (spec §19).
 *
 * Topology: one object per topic (site/{id}, leaderboard/global,
 * category/{slug}, activity/global) — never one object per browser session.
 * Uses hibernating WebSocket APIs so idle connections cost nothing.
 */

interface Env {
  REALTIME: DurableObjectNamespace;
}

export class RealtimeRoom implements DurableObject {
  private state: DurableObjectState;
  private sessions = new Map<WebSocket, { lastSeen: number }>();
  private lastSnapshot: string | null = null;

  constructor(state: DurableObjectState) {
    this.state = state;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/ws") {
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair) as [WebSocket, WebSocket];
      this.state.acceptWebSocket(server);
      this.sessions.set(server, { lastSeen: Date.now() });
      if (this.lastSnapshot) {
        server.send(this.lastSnapshot);
      }
      return new Response(null, { status: 101, webSocket: client });
    }
    if (url.pathname === "/broadcast" && request.method === "POST") {
      const snapshot = await request.text();
      this.lastSnapshot = snapshot;
      for (const ws of this.sessions.keys()) {
        try {
          ws.send(snapshot);
        } catch {
          this.sessions.delete(ws);
        }
      }
      return Response.json({ delivered: this.sessions.size });
    }
    return new Response("not found", { status: 404 });
  }

  webSocketMessage(ws: WebSocket): void {
    const entry = this.sessions.get(ws);
    if (entry) entry.lastSeen = Date.now();
  }

  webSocketClose(ws: WebSocket): void {
    this.sessions.delete(ws);
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const topic = url.searchParams.get("topic") ?? "leaderboard/global";
    const id = env.REALTIME.idFromName(topic);
    const stub = env.REALTIME.get(id);
    return stub.fetch(request);
  },
};
