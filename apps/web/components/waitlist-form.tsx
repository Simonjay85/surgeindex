"use client";

import { useState } from "react";
import { ArrowRight, Check, LoaderCircle } from "lucide-react";
import { TurnstileField } from "./turnstile-field";

type WaitlistTopic = "fanward" | "brand campaigns";

export function WaitlistForm({ topic, turnstileSiteKey }: { topic: WaitlistTopic; turnstileSiteKey?: string }) {
  const [email, setEmail] = useState("");
  const [joined, setJoined] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [turnstileToken, setTurnstileToken] = useState("");

  async function join(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ topic, email: email.trim(), consent: true, turnstileToken }),
      });
      const payload = await response.json().catch(() => null) as { error?: { message?: string } } | null;
      if (!response.ok) {
        setError(payload?.error?.message ?? "The waitlist request could not be saved.");
        return;
      }
      setJoined(true);
    } catch {
      setError("The waitlist request failed. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  if (joined) return <div className="waitlist-success"><span><Check size={16} /></span><div><strong>You’re on the list.</strong><p>We’ll send one useful note when {topic} opens up.</p></div></div>;
  const inputId = `waitlist-${topic.replaceAll(" ", "-")}`;
  return <><form className="waitlist-form" onSubmit={join}><label className="sr-only" htmlFor={inputId}>Email address</label><input id={inputId} value={email} onChange={(event) => setEmail(event.target.value)} type="email" placeholder="you@company.com" required /><button className="button button-dark" disabled={busy} type="submit">{busy ? <>Saving <LoaderCircle className="spin" size={15} /></> : <>Join waitlist <ArrowRight size={15} /></>}</button></form><TurnstileField siteKey={turnstileSiteKey} action="waitlist" onToken={setTurnstileToken} />{error ? <p className="form-message form-error" role="alert">{error}</p> : null}</>;
}
