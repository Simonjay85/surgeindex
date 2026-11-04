"use client";

import Link from "next/link";
import * as React from "react";
import { AlertTriangle, Check, Database, RefreshCw, ShieldCheck } from "lucide-react";
import { AppShell } from "./app-shell";
import { DashboardShell, DashboardTopline, DemoNotice } from "./dashboard-shell";

type ScoringHealth = {
  source?: string;
  generatedAt?: string;
  jobs?: Array<{ id: string; jobType: string; version: string; status: string; startedAt: string; finishedAt: string | null; durationMs: number | null; sitesCompleted: number; sitesFailed: number; error: string | null }>;
  states?: Array<{ ranking_state: string; count: number | string }>;
  leagues?: Array<{ heat_league: string; count: number | string }>;
  breakouts?: Array<{ breakout_state: string; count: number | string }>;
  freshness?: Array<{ freshness: string; count: number | string }>;
};

export function AdminScoringClient({ isDemo }: { isDemo: boolean }) {
  const [health, setHealth] = React.useState<ScoringHealth | null>(null);
  const [loading, setLoading] = React.useState(!isDemo);
  const [running, setRunning] = React.useState(false);
  const [message, setMessage] = React.useState("");
  const [error, setError] = React.useState("");

  const load = React.useCallback(async () => {
    if (isDemo) {
      setHealth({ source: "demo", jobs: [], states: [], leagues: [], breakouts: [], freshness: [] });
      return;
    }
    setLoading(true);
    const response = await fetch("/api/admin/scoring/health", { headers: { accept: "application/json" } });
    const payload = await response.json().catch(() => null) as { data?: ScoringHealth; error?: { message?: string } } | null;
    if (!response.ok) setError(payload?.error?.message ?? "Scoring health could not be loaded.");
    else { setHealth(payload?.data ?? null); setError(""); }
    setLoading(false);
  }, [isDemo]);

  React.useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function recompute() {
    if (isDemo || running) return;
    setRunning(true);
    setMessage("");
    setError("");
    const response = await fetch("/api/admin/scoring/recompute", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ rebuildBaseline: true }) });
    const payload = await response.json().catch(() => null) as { error?: { message?: string } } | null;
    if (!response.ok) setError(payload?.error?.message ?? "Scoring recompute failed.");
    else { setMessage("Scoring jobs completed and current rankings were refreshed."); await load(); }
    setRunning(false);
  }

  const counts = (items: Array<{ count: number | string }> | undefined) => (items ?? []).reduce((sum, item) => sum + Number(item.count), 0);
  return <AppShell><DashboardShell active="/admin"><DashboardTopline title="Scoring operations" description="Heat v1 baseline, score, rank, and breakout health. Organic scores are computed by jobs, never typed by an admin." action={<Link className="text-link" href="/admin">Moderation <ShieldCheck size={14} /></Link>} />{isDemo ? <DemoNotice>Demo mode has no production scoring jobs or fabricated admin metrics.</DemoNotice> : null}{error ? <div className="dashboard-alert" style={{ marginTop: 15 }}><AlertTriangle size={16} /><span>{error}</span></div> : null}{message ? <div className="form-success" style={{ marginTop: 15 }}><Check size={15} /><p>{message}</p></div> : null}<div className="section-tight"><div className="dashboard-grid"><div className="dashboard-card"><small>Score version</small><strong>Heat v1</strong><p>versioned release</p></div><div className="dashboard-card"><small>Sites in states</small><strong>{loading ? "…" : counts(health?.states)}</strong><p>production current rows</p></div><div className="dashboard-card"><small>Leagues</small><strong>{loading ? "…" : counts(health?.leagues)}</strong><p>new · emerging · established</p></div><div className="dashboard-card"><small>Breakout states</small><strong>{loading ? "…" : counts(health?.breakouts)}</strong><p>persisted transitions</p></div></div></div><div className="section-tight"><div className="profile-columns"><div className="panel"><div className="panel-heading"><div><h2>Run health</h2><p>Recent idempotent scoring runs with counts and failure boundaries.</p></div><button className="button button-coral button-small" onClick={() => void recompute()} disabled={isDemo || running}><RefreshCw size={14} /> {running ? "Running…" : "Recompute all"}</button></div>{loading ? <div className="empty-state"><h3>Loading scoring health…</h3></div> : health?.jobs?.length ? <div className="dashboard-list">{health.jobs.slice(0, 12).map((job) => <div className="dashboard-list-row" key={job.id}><div><strong>{job.jobType} · {job.version}</strong><span>{job.status} · {job.sitesCompleted} completed · {job.sitesFailed} failed · {job.durationMs == null ? "—" : `${job.durationMs}ms`}</span></div><small>{job.startedAt}</small></div>)}</div> : <div className="empty-state"><h3>No scoring runs yet</h3><p>Run the protected scheduler or connect the production database.</p></div>}</div><div className="panel"><div className="panel-heading"><div><h2>State distribution</h2><p>Stale and review states are intentionally excluded from global rank.</p></div><Database size={17} /></div><div className="dashboard-list">{(health?.states ?? []).map((row) => <div className="dashboard-list-row" key={row.ranking_state}><span>{row.ranking_state.replaceAll("_", " ")}</span><strong>{row.count}</strong></div>)}{!health?.states?.length ? <div className="empty-state"><h3>No live state data</h3></div> : null}</div></div></div></div><div className="section-tight"><div className="panel"><div className="panel-heading"><div><h2>Operator boundaries</h2><p>Actions are server-authorized and produce request IDs. The admin surface can recompute evidence, not assign an arbitrary Heat Score.</p></div></div><div className="method-note">Paid boosts, sponsorship, raw IPs, raw identifiers, and private provider tokens are not scoring inputs or public admin output.</div></div></div></DashboardShell></AppShell>;
}
