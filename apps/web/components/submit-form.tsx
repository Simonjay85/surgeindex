"use client";

import { useState } from "react";
import { ArrowRight, Check, Globe2, LoaderCircle, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { CATEGORIES } from "@surge/shared";
import { safeDomain } from "../lib/utils";
import { TurnstileField } from "./turnstile-field";

type SubmittedSite = {
  siteId: string;
  slug: string;
  status: string;
};

type SubmissionPayload = {
  data?: {
    duplicate?: boolean;
    siteId?: string;
    slug?: string;
    status?: string;
  };
  error?: { message?: string };
};

export function SubmitForm({ turnstileSiteKey }: { turnstileSiteKey?: string }) {
  const [url, setUrl] = useState("");
  const [category, setCategory] = useState("ai-tools");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [state, setState] = useState<"idle" | "checking" | "success" | "error">("idle");
  const [message, setMessage] = useState("");
  const [submittedSite, setSubmittedSite] = useState<SubmittedSite | null>(null);
  const [turnstileToken, setTurnstileToken] = useState("");
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const domain = safeDomain(url);
    if (!domain) { setState("error"); setMessage("Enter a public domain such as yoursite.com."); return; }
    setState("checking");
    let response: Response;
    try {
      response = await fetch("/api/sites", { method: "POST", headers: { "content-type": "application/json", accept: "application/json" }, body: JSON.stringify({ url, category, title: title.trim() || undefined, description: description.trim() || undefined, turnstileToken }) });
    } catch {
      setState("error");
      setMessage("The submission request failed. Check your connection and try again.");
      return;
    }
    const payload = await response.json().catch(() => null) as SubmissionPayload | null;
    if (!response.ok) { setState("error"); setMessage(payload?.error?.message ?? "The site could not be submitted. Please try again."); return; }
    if (payload?.data?.duplicate) { setState("error"); setMessage(`${domain} already has a listing. Search the directory or claim the existing profile.`); return; }
    const siteId = payload?.data?.siteId;
    const slug = payload?.data?.slug;
    const status = payload?.data?.status ?? "pending_review";
    setSubmittedSite(siteId && slug ? { siteId, slug, status } : null);
    setState("success");
    setMessage(`${domain} is ready for review. Metadata was imported server-side and the listing is ${status === "pending" || status === "pending_review" ? "pending moderation" : status.replaceAll("_", " ")}.`);
  }
  return <form className="submit-card" onSubmit={submit}>
    <div className="submit-card-head"><div><span className="eyebrow">SUBMIT A WEBSITE</span><h2>Put your site on the map.</h2><p>Listings are free. Verified traffic earns the rank; paid boosts only buy clearly labeled reach.</p></div><span className="submit-icon"><Globe2 size={24} /></span></div>
    <div className="form-grid"><label className="field-label">Website URL<input value={url} onChange={(event) => { setUrl(event.target.value); setState("idle"); }} placeholder="https://yourwebsite.com" inputMode="url" autoComplete="url" required /></label><label className="field-label">Primary category<select value={category} onChange={(event) => setCategory(event.target.value)}>{CATEGORIES.map((item) => <option key={item.slug} value={item.slug}>{item.name}</option>)}</select></label></div>
    <div className="form-grid"><label className="field-label">Name override <span style={{ color: "var(--foreground-muted)" }}>(optional)</span><input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={160} placeholder="Imported from your homepage" /></label><label className="field-label">Description override <span style={{ color: "var(--foreground-muted)" }}>(optional)</span><input value={description} onChange={(event) => setDescription(event.target.value)} maxLength={320} placeholder="Imported metadata is used when blank" /></label></div>
    <TurnstileField siteKey={turnstileSiteKey} action="site-submit" onToken={setTurnstileToken} />
    {state === "error" ? <p className="form-message form-error" role="alert">{message}</p> : null}
    {state === "success" ? <div className="form-success" role="status" aria-live="polite"><span><Check size={15} /></span><p><strong>Status: {submittedSite?.status === "pending" || submittedSite?.status === "pending_review" ? "Pending moderation" : submittedSite?.status?.replaceAll("_", " ") ?? "Submitted"}.</strong> {message}</p></div> : null}
    <div className="submit-actions">{state === "success" && submittedSite ? <div className="copy-row"><Link className="button button-coral" href={`/dashboard/sites/${submittedSite.siteId}`}>Open site dashboard <ArrowRight size={16} /></Link><Link className="button button-quiet" href={`/claim/${submittedSite.siteId}`}>Start ownership claim <ShieldCheck size={16} /></Link></div> : state === "success" ? <Link className="button button-coral" href="/dashboard">Open dashboard <ArrowRight size={16} /></Link> : <button className="button button-coral" type="submit" disabled={state === "checking"}>{state === "checking" ? <><LoaderCircle className="spin" size={16} /> Checking domain</> : <>Start submission <ArrowRight size={16} /> </>}</button>}<span className="form-trust"><ShieldCheck size={15} /> No tracker required to list</span></div>
  </form>;
}
