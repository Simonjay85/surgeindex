"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Check, Eye, Flag, ShieldCheck, Sparkles, Target, Wrench } from "lucide-react";
import { AppShell, DataModeBadge } from "./app-shell";
import { DashboardShell, DashboardTopline, DemoNotice } from "./dashboard-shell";

type PendingSite = { id: string; name: string; domain: string; categoryId: string | null; categoryName: string; status: string; createdAt: string };
type AuditEntry = { id: string; action: string; targetId: string | null; reason: string | null; requestId: string; createdAt: string };
type ClaimReview = { id: string; siteId: string; siteName: string; domain: string; userId: string; method: string; status: string; attempts: number; lastError: string | null; requestedAt: string; expiresAt: string; verifiedAt: string | null };
type CategoryOption = { id: string; slug: string; name: string; description: string; siteCount: number };

export function AdminModerationClient({ isDemo, userName }: { isDemo: boolean; userName: string }) {
  const [pending, setPending] = useState<PendingSite[]>([]);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [claimReviews, setClaimReviews] = useState<ClaimReview[]>([]);
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [query, setQuery] = useState("");
  const [reason, setReason] = useState("Reviewed against public metadata and policy.");
  const [loading, setLoading] = useState(!isDemo);
  const [error, setError] = useState("");
  const [reviewed, setReviewed] = useState(false);

  const loadQueue = useCallback(async () => {
    if (isDemo) return;
    setLoading(true);
    const queryString = query.trim() ? `?q=${encodeURIComponent(query.trim())}` : "";
    const response = await fetch(`/api/admin/moderation${queryString}`, { headers: { accept: "application/json" } });
    const payload = await response.json().catch(() => null) as { data?: { pending?: PendingSite[]; audit?: AuditEntry[]; claimReviews?: ClaimReview[]; categories?: CategoryOption[] }; error?: { message?: string } } | null;
    if (!response.ok) setError(payload?.error?.message ?? "The moderation queue could not be loaded.");
    else { setPending(payload?.data?.pending ?? []); setAudit(payload?.data?.audit ?? []); setClaimReviews(payload?.data?.claimReviews ?? []); setCategories(payload?.data?.categories ?? []); setError(""); }
    setLoading(false);
  }, [isDemo, query]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadQueue(), 0);
    return () => window.clearTimeout(timer);
  }, [loadQueue]);

  async function moderate(siteId: string, action: "approve" | "reject" | "suspend" | "restore" | "category_changed", categoryId?: string) {
    const destructive = action === "reject" || action === "suspend";
    if (destructive && !window.confirm(`Confirm ${action} for this site?`)) return;
    setError("");
    const response = await fetch("/api/admin/moderation", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ siteId, action, categoryId, reason, confirm: destructive }) });
    const payload = await response.json().catch(() => null) as { error?: { message?: string } } | null;
    if (!response.ok) { setError(payload?.error?.message ?? "The moderation action could not be saved."); return; }
    setReviewed(true);
    await loadQueue();
  }

  return <AppShell><DashboardShell active="/admin"><DashboardTopline title="Admin moderation" description={`Operational review for ${userName}. Moderation changes are audited with a request ID.`} action={<span className="tracker-status"><ShieldCheck size={15} /> Admin role</span>} />{isDemo ? <DemoNotice>Demo mode does not mutate a live queue. Production uses the protected moderation API below.</DemoNotice> : <div className="demo-ribbon dashboard-notice"><DataModeBadge isDemo={false} compact /> <span>Queue and audit entries are read from PostgreSQL.</span></div>}{error ? <div className="dashboard-alert" style={{ marginTop: 15 }}><AlertTriangle size={16} /><span>{error}</span></div> : null}<div className="section-tight"><div className="admin-grid"><div className="admin-card"><h3>Pending sites</h3><strong>{isDemo ? "—" : loading ? "…" : pending.length}</strong><p>{isDemo ? "Demo queue disabled" : "Needs moderation"}</p></div><div className="admin-card"><h3>Audit records</h3><strong>{isDemo ? "—" : loading ? "…" : audit.length}</strong><p>{isDemo ? "No live records" : "Recent admin actions"}</p></div><div className="admin-card"><h3>Claim reviews</h3><strong>{isDemo ? "—" : loading ? "…" : claimReviews.length}</strong><p>{isDemo ? "No live records" : "Failed or expired proofs"}</p></div><div className="admin-card"><h3>Protected surface</h3><strong>403</strong><p>Non-admin API and page access</p></div><div className="admin-card admin-wide"><div className="panel-heading"><div><h3>Review queue</h3><p>Approve, reject, suspend, or restore with an explicit reason.</p></div><Eye size={17} /></div>{isDemo ? <div className="empty-state"><h3>Demo moderation is read-only</h3><p>The demo provider intentionally has no fabricated pending queue. Connect PostgreSQL to review persisted submissions.</p></div> : loading ? <div className="empty-state"><h3>Loading queue…</h3></div> : pending.length ? <div className="dashboard-list">{pending.map((site) => <div className="dashboard-list-row" key={site.id}><div><strong>{site.name}</strong><span>{site.domain} · {site.categoryName} · {site.status}</span><div className="copy-row" style={{ marginTop: 8 }}><select aria-label={`Category for ${site.name}`} value={site.categoryId ?? ""} onChange={(event) => { const nextId = event.target.value || null; const nextCategory = categories.find((category) => category.id === nextId); setPending((rows) => rows.map((row) => row.id === site.id ? { ...row, categoryId: nextId, categoryName: nextCategory?.name ?? row.categoryName } : row)); }}><option value="">Choose category</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select><button className="button button-quiet button-small" onClick={() => site.categoryId ? void moderate(site.id, "category_changed", site.categoryId) : undefined} disabled={!site.categoryId}>Save category</button></div></div><div style={{ display: "flex", gap: 8, alignItems: "center" }}><button className="button button-coral button-small" onClick={() => void moderate(site.id, "approve")}><Check size={13} /> Approve</button><button className="button button-quiet button-small" onClick={() => void moderate(site.id, "reject")}>Reject</button></div></div>)}</div> : <div className="empty-state"><h3>No pending sites</h3><p>New submissions appear here after the server saves them.</p></div>}<div className="copy-row" style={{ marginTop: 14 }}><input aria-label="Search pending sites" placeholder="Search name or domain" value={query} onChange={(event) => setQuery(event.target.value)} /><button className="button button-quiet button-small" onClick={() => void loadQueue()} disabled={loading}>Search</button></div><label className="field-label" style={{ marginTop: 14 }}>Moderation reason<input value={reason} onChange={(event) => setReason(event.target.value)} maxLength={500} /></label>{reviewed ? <div className="form-success" style={{ marginTop: 12 }}><Check size={15} /><p>Action saved and the queue was refreshed.</p></div> : null}</div><div className="admin-card"><h3>System posture</h3><div className="dashboard-list"><div className="dashboard-list-row"><span>Authorization</span><span className="tracker-status"><span className="live-dot" /> server-side</span></div><div className="dashboard-list-row"><span>Audit request ID</span><span className="status-chip status-active">recorded</span></div><div className="dashboard-list-row"><span>Future modules</span><span className="status-chip status-scheduled">disabled</span></div></div></div></div></div>{!isDemo ? <div className="section-tight"><div className="panel"><div className="panel-heading"><div><h2>Claim and verification review</h2><p>Failed ownership proofs and expired challenges are persisted for admin review.</p></div><ShieldCheck size={17} color="#bc7628" /></div>{loading ? <div className="empty-state"><h3>Loading review records…</h3></div> : claimReviews.length ? <div className="dashboard-list">{claimReviews.slice(0, 20).map((claim) => <div className="dashboard-list-row" key={claim.id}><div><strong>{claim.siteName} · {claim.domain}</strong><span>{claim.method} · {claim.status} · {claim.attempts} attempt{claim.attempts === 1 ? "" : "s"} · {claim.lastError ?? "No error recorded"}</span></div><small>{claim.userId}</small></div>)}</div> : <div className="empty-state"><h3>No failed or expired claims</h3><p>Ownership conflicts and failed proofs will appear here for manual review.</p></div>}</div></div> : null}<div className="section-tight"><div className="profile-columns"><div className="panel"><div className="panel-heading"><div><h2>Recent audit</h2><p>Only persisted moderation actions are shown in production.</p></div><Flag size={17} color="#bc7628" /></div>{isDemo ? <div className="method-note"><Sparkles size={13} /> Demo mode has no live audit records.</div> : audit.length ? <div className="dashboard-list">{audit.slice(0, 12).map((entry) => <div className="dashboard-list-row" key={entry.id}><div><strong>{entry.action}</strong><span>{entry.reason ?? "No reason recorded"}</span></div><small>{entry.requestId}</small></div>)}</div> : <div className="empty-state"><h3>No audit actions yet</h3></div>}</div><div className="panel"><div className="panel-heading"><div><h2>Safety boundaries</h2><p>Operational rules for the review desk.</p></div><Wrench size={17} /></div><div className="dashboard-list"><div className="dashboard-list-row"><div><strong>Confirm destructive actions</strong><span>Reject and suspend require an explicit confirmation.</span></div><Check size={15} color="#2f8b62" /></div><div className="dashboard-list-row"><div><strong>Keep raw credentials private</strong><span>Provider tokens and raw IPs never appear in this UI.</span></div><Check size={15} color="#2f8b62" /></div></div></div></div></div><div className="section-tight"><div className="method-note"><Target size={13} /> <Link className="text-link" href="/methodology">Review public methodology</Link></div></div></DashboardShell></AppShell>;
}
