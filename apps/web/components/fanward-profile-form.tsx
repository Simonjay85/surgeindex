"use client";

import Link from "next/link";
import { AlertTriangle, ArrowUpRight, Check, Clock3, ExternalLink, LoaderCircle, Save, Send, ShieldCheck } from "lucide-react";
import { useRef, useState } from "react";
import type { FanwardOwnerWorkspace } from "../lib/server/fanward-service";
import { SourceBadge } from "./app-shell";
import { TurnstileField, type TurnstileState } from "./turnstile-field";

type FormValues = {
  displayName: string;
  headline: string;
  bio: string;
  categoryId: string;
  primarySiteId: string;
};

type ApiPayload<T> = { data?: T; error?: { message?: string } };

function valuesFromWorkspace(workspace: FanwardOwnerWorkspace): FormValues {
  const revision = workspace.draft ?? workspace.pending ?? workspace.published;
  return {
    displayName: revision?.displayName ?? "",
    headline: revision?.headline ?? "",
    bio: revision?.bio ?? "",
    categoryId: revision?.category?.id ?? workspace.categories[0]?.id ?? "",
    primarySiteId: workspace.profile?.primarySiteId ?? workspace.eligibleSites[0]?.id ?? "",
  };
}

function statusLabel(status: string | undefined) {
  if (!status) return "Not created";
  return ({ draft: "Draft", pending: "Pending review", active: "Published", rejected: "Changes requested", suspended: "Suspended" } as Record<string, string>)[status] ?? status.replaceAll("_", " ");
}

function statusClass(status: string | undefined) {
  if (status === "active") return "status-active";
  if (status === "pending" || status === "draft") return "status-scheduled";
  if (status === "rejected" || status === "suspended") return "fanward-status-danger";
  return "status-completed";
}

async function readPayload<T>(response: Response): Promise<ApiPayload<T>> {
  return response.json().catch(() => ({})) as Promise<ApiPayload<T>>;
}

export function FanwardProfileForm({ initialWorkspace, turnstileRequired, turnstileSiteKey }: { initialWorkspace: FanwardOwnerWorkspace; turnstileRequired: boolean; turnstileSiteKey?: string }) {
  const [workspace, setWorkspace] = useState(initialWorkspace);
  const [form, setForm] = useState<FormValues>(() => valuesFromWorkspace(initialWorkspace));
  const [busy, setBusy] = useState<"save" | "submit" | null>(null);
  const [message, setMessage] = useState("");
  const [messageTone, setMessageTone] = useState<"error" | "success" | "">("");
  const [turnstileToken, setTurnstileToken] = useState("");
  const [turnstileState, setTurnstileState] = useState<TurnstileState>(turnstileRequired ? "loading" : "ready");
  const [turnstileResetNonce, setTurnstileResetNonce] = useState(0);
  const formRef = useRef<HTMLFormElement>(null);
  const profileStatus = workspace.profile?.status;
  const locked = Boolean(workspace.pending) || profileStatus === "suspended";
  const selectedSite = workspace.primarySite ?? workspace.eligibleSites.find((site) => site.id === form.primarySiteId) ?? null;
  const hasEligibleSite = workspace.profile ? Boolean(workspace.primarySite?.eligible) : workspace.eligibleSites.length > 0;
  const turnstileReady = !turnstileRequired || (turnstileState === "verified" && Boolean(turnstileToken));

  function update<K extends keyof FormValues>(key: K, value: FormValues[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    setMessage("");
    setMessageTone("");
  }

  function applyWorkspace(next: FanwardOwnerWorkspace) {
    setWorkspace(next);
    setForm(valuesFromWorkspace(next));
  }

  async function saveDraft(): Promise<FanwardOwnerWorkspace | null> {
    const body = {
      displayName: form.displayName.trim(),
      headline: form.headline.trim(),
      bio: form.bio.trim(),
      categoryId: form.categoryId,
      primarySiteId: form.primarySiteId,
      ...(workspace.profile?.updatedAt ? { expectedUpdatedAt: workspace.profile.updatedAt } : {}),
    };
    const response = await fetch("/api/fanward/me", { method: "PATCH", headers: { accept: "application/json", "content-type": "application/json" }, body: JSON.stringify(body) });
    const payload = await readPayload<FanwardOwnerWorkspace>(response);
    if (!response.ok || !payload.data) {
      setMessage(payload.error?.message ?? "The creator draft could not be saved.");
      setMessageTone("error");
      return null;
    }
    applyWorkspace(payload.data);
    return payload.data;
  }

  async function onSave(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (locked || !hasEligibleSite) return;
    setBusy("save");
    setMessage("");
    setMessageTone("");
    try {
      const saved = await saveDraft();
      if (saved) {
        setMessage("Draft saved. Nothing changes publicly until moderation approves a submitted revision.");
        setMessageTone("success");
      }
    } catch {
      setMessage("The creator draft could not be saved. Check your connection and try again.");
      setMessageTone("error");
    } finally {
      setBusy(null);
    }
  }

  async function submitForReview() {
    if (locked || !hasEligibleSite) return;
    if (!formRef.current?.reportValidity()) return;
    if (!turnstileReady) {
      setMessage("Complete the anti-bot verification before submitting for review.");
      setMessageTone("error");
      return;
    }
    setBusy("submit");
    setMessage("");
    setMessageTone("");
    try {
      const saved = await saveDraft();
      if (!saved) return;
      if (!saved.profile?.updatedAt) {
        setMessage("The saved profile did not return a concurrency version. Refresh the page before submitting.");
        setMessageTone("error");
        return;
      }
      const response = await fetch("/api/fanward/me/submit", { method: "POST", headers: { accept: "application/json", "content-type": "application/json" }, body: JSON.stringify({ expectedUpdatedAt: saved.profile.updatedAt, turnstileToken }) });
      const payload = await readPayload<FanwardOwnerWorkspace>(response);
      if (!response.ok || !payload.data) {
        setMessage(payload.error?.message ?? "The creator profile could not be submitted for review.");
        setMessageTone("error");
        return;
      }
      applyWorkspace(payload.data);
      setMessage("Profile submitted. The pending revision is locked while moderation reviews it.");
      setMessageTone("success");
    } catch {
      setMessage("The creator profile could not be submitted. Check your connection and try again.");
      setMessageTone("error");
    } finally {
      setTurnstileToken("");
      setTurnstileResetNonce((current) => current + 1);
      setBusy(null);
    }
  }

  return <div className="fanward-owner-workspace">
    <div className="fanward-owner-status">
      <div><span>Profile status</span><strong className={`status-chip ${statusClass(profileStatus)}`}>{statusLabel(profileStatus)}</strong></div>
      {workspace.profile?.status === "active" && workspace.published ? <Link className="text-link" href={`/fanward/${workspace.profile.slug}`}>View public profile <ExternalLink size={13} /></Link> : null}
    </div>

    {workspace.pending ? <div className="fanward-notice fanward-notice-info"><Clock3 size={16} /><div><strong>Review in progress</strong><p>Your submitted revision is locked. If an older version is already published, it remains public until this revision is approved.</p></div></div> : null}
    {profileStatus === "suspended" ? <div className="fanward-notice fanward-notice-danger"><AlertTriangle size={16} /><div><strong>Profile suspended</strong><p>The public profile and score are unavailable. Editing stays locked while an administrator reviews the account.</p></div></div> : null}
    {workspace.lastReviewReason && !workspace.pending ? <div className="fanward-notice fanward-notice-warning"><AlertTriangle size={16} /><div><strong>Moderator feedback</strong><p>{workspace.lastReviewReason}</p></div></div> : null}
    {!hasEligibleSite ? <div className="fanward-notice fanward-notice-warning"><ShieldCheck size={16} /><div><strong>{workspace.profile ? "The linked primary site is no longer eligible" : "A verified owned site is required"}</strong><p>{workspace.profile ? workspace.primarySite?.eligibilityReason ?? "The existing primary site cannot currently back a public Fanward profile. The link remains fixed; contact an administrator if the site identity itself must change." : "Claim a site and connect an eligible traffic source before creating a Fanward profile. Unverified or unowned sites cannot be selected."}</p><Link className="text-link" href="/dashboard/sites">Review my sites <ArrowUpRight size={13} /></Link></div></div> : null}

    <form ref={formRef} className="panel fanward-profile-editor" onSubmit={onSave}>
      <div className="panel-heading"><div><h2>Creator profile</h2><p>Write for a public audience. The selected site supplies the evidence behind Impact Score; profile copy does not change the score.</p></div><SourceBadge source={selectedSite?.verification === "tracker" || selectedSite?.verification === "ga4" ? selectedSite.verification : "unverified"} compact /></div>
      <fieldset disabled={locked || busy !== null || !hasEligibleSite}>
        <div className="form-grid fanward-form-grid">
          <label>Display name<input name="displayName" value={form.displayName} required minLength={2} maxLength={80} autoComplete="name" onChange={(event) => update("displayName", event.target.value)} /></label>
          <label>Category<select name="categoryId" value={form.categoryId} required onChange={(event) => update("categoryId", event.target.value)}><option value="" disabled>Choose a category</option>{workspace.categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
          <label className="form-span-two">Headline<input name="headline" value={form.headline} required minLength={8} maxLength={160} onChange={(event) => update("headline", event.target.value)} /><small>{form.headline.length} / 160</small></label>
          <label className="form-span-two">Bio<textarea name="bio" value={form.bio} required minLength={40} maxLength={2000} rows={8} onChange={(event) => update("bio", event.target.value)} /><small>{form.bio.length} / 2,000</small></label>
          <label className="form-span-two">Verified primary site<select name="primarySiteId" value={form.primarySiteId} required disabled={Boolean(workspace.profile)} onChange={(event) => update("primarySiteId", event.target.value)}><option value="" disabled>Choose an eligible site</option>{workspace.profile && workspace.primarySite ? <option value={workspace.primarySite.id}>{workspace.primarySite.name} · {workspace.primarySite.domain} · {workspace.primarySite.verification.toUpperCase()}</option> : workspace.eligibleSites.map((site) => <option key={site.id} value={site.id}>{site.name} · {site.domain} · {site.verification.toUpperCase()}</option>)}</select><small>{workspace.profile ? "The primary site is locked after profile creation. An identity change requires administrator assistance; lost eligibility never switches the profile to another site." : "Only sites owned by this account with an eligible, verified source appear here."}</small></label>
        </div>
      </fieldset>
      {turnstileRequired && !locked && hasEligibleSite ? <TurnstileField siteKey={turnstileSiteKey} action="fanward-submit" onToken={setTurnstileToken} onStateChange={setTurnstileState} resetNonce={turnstileResetNonce} /> : null}
      <div className="fanward-form-actions">
        <button className="button button-quiet" type="submit" disabled={locked || busy !== null || !hasEligibleSite}>{busy === "save" ? <LoaderCircle className="spin" size={15} /> : <Save size={15} />} {busy === "save" ? "Saving" : "Save draft"}</button>
        <button className="button button-coral" type="button" disabled={locked || busy !== null || !hasEligibleSite || !turnstileReady} onClick={() => void submitForReview()}>{busy === "submit" ? <LoaderCircle className="spin" size={15} /> : <Send size={15} />} {busy === "submit" ? "Submitting" : !turnstileReady ? "Verify to submit" : "Submit for review"}</button>
        <span><Check size={13} /> Approval is required before a new revision is public.</span>
      </div>
      {message ? <div className={messageTone === "error" ? "fanward-form-message fanward-form-message-error" : "fanward-form-message fanward-form-message-success"} role={messageTone === "error" ? "alert" : "status"}>{messageTone === "error" ? <AlertTriangle size={15} /> : <Check size={15} />}<span>{message}</span></div> : null}
    </form>
  </div>;
}
