"use client";

import Link from "next/link";
import { AlertTriangle, Check, ExternalLink, LoaderCircle, RefreshCw, RotateCcw, ShieldCheck, ShieldX } from "lucide-react";
import { useState } from "react";
import type { FanwardAdminQueueResult, FanwardAdminReviewItem } from "../lib/server/fanward-service";
import { EmptyState, SourceBadge } from "./app-shell";

type ReviewAction = "approve" | "reject" | "suspend" | "restore";
type ApiPayload<T> = { data?: T; error?: { message?: string } };

function statusClass(status: string) {
  if (status === "active") return "status-active";
  if (status === "pending" || status === "draft") return "status-scheduled";
  if (status === "rejected" || status === "suspended") return "fanward-status-danger";
  return "status-completed";
}

function actionLabel(action: ReviewAction) {
  return ({ approve: "Approve", reject: "Request changes", suspend: "Suspend", restore: "Restore" } as const)[action];
}

function availableActions(item: FanwardAdminReviewItem): ReviewAction[] {
  if (item.profileStatus === "suspended") return item.pendingRevision ? ["reject", "restore"] : ["restore"];
  if (item.profileStatus === "active" && item.pendingRevision) return ["approve", "reject", "suspend"];
  if (item.pendingRevision) return ["approve", "reject"];
  if (item.profileStatus === "active") return ["suspend"];
  return [];
}

function dateLabel(value: string | null) {
  if (!value) return "No submission time";
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(timestamp)) : "Invalid date";
}

export function AdminFanwardClient({ initialQueue }: { initialQueue: FanwardAdminQueueResult }) {
  const pageSize = 50;
  const [queue, setQueue] = useState(initialQueue);
  const [query, setQuery] = useState("");
  const [activeQuery, setActiveQuery] = useState("");
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [busyProfileId, setBusyProfileId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [messageTone, setMessageTone] = useState<"error" | "success" | "">("");

  async function refreshQueue(nextOffset = queue.offset, nextQuery = activeQuery) {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: String(pageSize), offset: String(nextOffset) });
      if (nextQuery) params.set("q", nextQuery);
      const response = await fetch(`/api/admin/fanward?${params.toString()}`, { headers: { accept: "application/json" }, cache: "no-store" });
      const payload = await response.json().catch(() => ({})) as ApiPayload<FanwardAdminQueueResult>;
      if (!response.ok || !payload.data) throw new Error(payload.error?.message ?? "The Fanward review queue could not be refreshed.");
      setQueue(payload.data);
      setActiveQuery(nextQuery);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The Fanward review queue could not be refreshed.");
      setMessageTone("error");
    } finally {
      setLoading(false);
    }
  }

  async function review(item: FanwardAdminReviewItem, action: ReviewAction) {
    const reason = reasons[item.profileId]?.trim() ?? "";
    if (!reason) {
      setMessage("Enter a review reason before taking an action.");
      setMessageTone("error");
      return;
    }
    setBusyProfileId(item.profileId);
    setMessage("");
    setMessageTone("");
    try {
      const response = await fetch(`/api/admin/fanward/${encodeURIComponent(item.profileId)}/review`, {
        method: "POST",
        headers: { accept: "application/json", "content-type": "application/json" },
        body: JSON.stringify({ action, ...(item.pendingRevision ? { revisionId: item.pendingRevision.id } : {}), reason, confirm: true }),
      });
      const payload = await response.json().catch(() => ({})) as ApiPayload<unknown>;
      if (!response.ok) throw new Error(payload.error?.message ?? "The Fanward moderation action could not be saved.");
      setReasons((current) => ({ ...current, [item.profileId]: "" }));
      setMessage(`${actionLabel(action)} saved. The queue has been refreshed from the server.`);
      setMessageTone("success");
      await refreshQueue();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The Fanward moderation action could not be saved.");
      setMessageTone("error");
    } finally {
      setBusyProfileId(null);
    }
  }

  return <div className="fanward-admin">
    <div className="fanward-admin-summary">
      <div><span>Profiles in queue</span><strong>{queue.total.toLocaleString("en-US")}</strong><small>Pending revisions and actionable public profiles</small></div>
      <div><span>Eligible pending</span><strong>{queue.items.filter((item) => item.pendingRevision && item.eligibility.eligible).length.toLocaleString("en-US")}</strong><small>Still requires human content review</small></div>
      <div><span>Blocked evidence</span><strong>{queue.items.filter((item) => !item.eligibility.eligible).length.toLocaleString("en-US")}</strong><small>Approval is disabled until eligibility recovers</small></div>
    </div>

    <div className="fanward-admin-toolbar"><p>Creator copy and primary-site eligibility must both pass review. A score is computed separately and cannot be edited here.</p><form className="fanward-admin-search" onSubmit={(event) => { event.preventDefault(); void refreshQueue(0, query.trim()); }}><label className="sr-only" htmlFor="fanward-admin-search">Search Fanward profiles</label><input id="fanward-admin-search" value={query} maxLength={80} placeholder="Creator, site, or owner" onChange={(event) => setQuery(event.target.value)} /><button className="button button-quiet button-small" type="submit" disabled={loading || busyProfileId !== null}>{loading ? <LoaderCircle className="spin" size={14} /> : <RefreshCw size={14} />} Search</button></form></div>
    {message ? <div className={messageTone === "error" ? "fanward-form-message fanward-form-message-error" : "fanward-form-message fanward-form-message-success"} role={messageTone === "error" ? "alert" : "status"}>{messageTone === "error" ? <AlertTriangle size={15} /> : <Check size={15} />}<span>{message}</span></div> : null}

    {queue.items.length ? <div className="fanward-review-list">{queue.items.map((item) => <ReviewCard item={item} busy={busyProfileId === item.profileId} key={item.profileId} reason={reasons[item.profileId] ?? ""} setReason={(reason) => setReasons((current) => ({ ...current, [item.profileId]: reason }))} review={review} />)}</div> : <EmptyState title={activeQuery ? "No Fanward profiles match this search" : "No Fanward profiles need review"} description={activeQuery ? "Clear the search to return to the full moderation queue." : "New submissions, active profiles eligible for suspension, and suspended profiles eligible for restoration will appear here. No sample creators are added to an empty queue."} />}
    {queue.total > 0 ? <nav className="fanward-admin-pagination" aria-label="Fanward moderation pages"><span>Showing {queue.offset + 1}–{Math.min(queue.offset + queue.items.length, queue.total)} of {queue.total.toLocaleString("en-US")}</span><div><button className="button button-quiet button-small" type="button" disabled={loading || busyProfileId !== null || queue.offset === 0} onClick={() => void refreshQueue(Math.max(0, queue.offset - queue.limit))}>Previous</button><button className="button button-quiet button-small" type="button" disabled={loading || busyProfileId !== null || queue.nextOffset === null} onClick={() => queue.nextOffset === null ? undefined : void refreshQueue(queue.nextOffset)}>Next</button></div></nav> : null}
  </div>;
}

function ReviewCard({ item, busy, reason, setReason, review }: { item: FanwardAdminReviewItem; busy: boolean; reason: string; setReason: (reason: string) => void; review: (item: FanwardAdminReviewItem, action: ReviewAction) => Promise<void> }) {
  const [confirmationAction, setConfirmationAction] = useState<ReviewAction | null>(null);
  const revision = item.pendingRevision ?? item.publishedRevision;
  const actions = availableActions(item);
  return <article className="panel fanward-review-card">
    <div className="fanward-review-head">
      <div><div className="fanward-review-title"><h2>{revision?.displayName ?? item.slug}</h2><span className={`status-chip ${statusClass(item.profileStatus)}`}>{item.profileStatus.replaceAll("_", " ")}</span></div><p>{item.primarySite.domain} · owned by {item.owner.name} ({item.owner.email})</p></div>
      <div className="fanward-review-links"><SourceBadge source={item.primarySite.verification} compact />{item.publishedRevision && item.profileStatus === "active" ? <Link className="text-link" href={`/fanward/${item.slug}`} target="_blank">Public profile <ExternalLink size={13} /></Link> : null}</div>
    </div>

    <div className="fanward-review-content">
      <div><span>Headline</span><strong>{revision?.headline ?? "No revision headline"}</strong></div>
      <div><span>Category</span><strong>{revision?.category?.name ?? "Uncategorized"}</strong></div>
      <div className="fanward-review-bio"><span>Bio</span><p>{revision?.bio ?? "No revision bio"}</p></div>
      <div><span>Submitted</span><strong>{dateLabel(item.submittedAt)}</strong></div>
    </div>

    <div className={item.eligibility.eligible ? "fanward-eligibility fanward-eligibility-ok" : "fanward-eligibility fanward-eligibility-blocked"}>{item.eligibility.eligible ? <ShieldCheck size={15} /> : <ShieldX size={15} />}<div><strong>{item.eligibility.eligible ? "Primary site is currently eligible" : "Approval blocked by site eligibility"}</strong><span>{item.eligibility.reason ?? `${item.primarySite.name} is verified through ${item.primarySite.verification.toUpperCase()} and owned by this profile owner.`}</span></div></div>

    {actions.length ? <div className="fanward-review-controls"><label>Review reason<textarea value={reason} required minLength={3} maxLength={500} rows={3} disabled={busy || confirmationAction !== null} placeholder="Record the policy or evidence basis for this decision" onChange={(event) => setReason(event.target.value)} /></label>{confirmationAction ? <div className="fanward-inline-confirm" role="group" aria-label={`Confirm ${actionLabel(confirmationAction)}`}><div><strong>Confirm {actionLabel(confirmationAction).toLowerCase()}</strong><span>{revision?.displayName ?? item.slug} · {item.primarySite.domain}. This reason and action will be written to the audit trail.</span></div><div><button className="button button-coral button-small" type="button" disabled={busy} onClick={async () => { await review(item, confirmationAction); setConfirmationAction(null); }}>{busy ? <LoaderCircle className="spin" size={13} /> : <Check size={13} />} Confirm</button><button className="button button-quiet button-small" type="button" disabled={busy} onClick={() => setConfirmationAction(null)}>Cancel</button></div></div> : <div className="fanward-review-actions">{actions.map((action) => <button className={action === "approve" || action === "restore" ? "button button-coral button-small" : "button button-quiet button-small"} type="button" key={action} disabled={busy || reason.trim().length < 3 || ((action === "approve" || action === "restore") && !item.eligibility.eligible)} onClick={() => setConfirmationAction(action)}>{action === "restore" ? <RotateCcw size={13} /> : action === "approve" ? <Check size={13} /> : <AlertTriangle size={13} />}{actionLabel(action)}</button>)}</div>}</div> : <div className="method-note">No moderation transition is available for this profile state. A rejected owner must submit a revised draft before it returns to review.</div>}
  </article>;
}
