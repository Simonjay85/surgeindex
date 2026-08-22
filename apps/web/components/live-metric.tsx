"use client";

import { useEffect, useState } from "react";

export function LiveMetric({ siteId, initialVisitors, initialSessions }: { siteId: string; initialVisitors: number | null; initialSessions: number | null }) {
  const [state, setState] = useState<{ visitors: number | null; sessions: number | null; status: "connecting" | "live" | "reconnecting" | "stale" | "offline" }>({ visitors: initialVisitors, sessions: initialSessions, status: "connecting" });
  useEffect(() => {
    let stopped = false;
    const poll = async () => {
      try {
        const response = await fetch(`/api/live/${encodeURIComponent(siteId)}`, { cache: "no-store" });
        if (!response.ok) throw new Error("offline");
        const payload = await response.json() as { data?: { activeVisitors: number | null; activeSessions: number | null; freshness?: string } };
        const freshness = payload.data?.freshness;
        const status = freshness === "offline" ? "offline" : freshness === "stale" ? "stale" : "live";
        if (!stopped) setState({ visitors: payload.data?.activeVisitors ?? null, sessions: payload.data?.activeSessions ?? null, status });
      } catch {
        if (!stopped) setState((current) => ({ ...current, status: current.status === "connecting" || current.status === "offline" ? "offline" : "reconnecting" }));
      }
    };
    void poll();
    const timer = window.setInterval(() => void poll(), 15_000);
    return () => { stopped = true; window.clearInterval(timer); };
  }, [siteId]);
  const label = state.status === "live" ? "live active visitors" : state.status === "reconnecting" ? "reconnecting" : state.status === "stale" ? "stale signal" : state.status === "offline" ? "offline" : "connecting";
  return <span title={state.sessions == null ? "Active session count unavailable" : `${state.sessions.toLocaleString()} active sessions`}><strong>{state.visitors == null ? "—" : state.visitors.toLocaleString()}</strong><small>{label}</small></span>;
}
