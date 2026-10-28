"use client";

import { useState } from "react";
import { ArrowRight, Check, LoaderCircle } from "lucide-react";
import { TurnstileField, type TurnstileState } from "./turnstile-field";

type WaitlistTopic = "fanward" | "brand campaigns";

export function WaitlistForm({ topic, turnstileSiteKey }: { topic: WaitlistTopic; turnstileSiteKey?: string }) {
  const [email, setEmail] = useState("");
  const [joined, setJoined] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [turnstileToken, setTurnstileToken] = useState("");
  const [turnstileState, setTurnstileState] = useState<TurnstileState>(turnstileSiteKey ? "loading" : "ready");
  const [turnstileResetNonce, setTurnstileResetNonce] = useState(0);
  const turnstileReady = !turnstileSiteKey || (turnstileState === "verified" && Boolean(turnstileToken));

  async function join(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    if (!turnstileReady) {
      setError("Complete the anti-bot verification before joining the waitlist.");
      setBusy(false);
      return;
    }
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
      setTurnstileToken("");
      setTurnstileResetNonce((current) => current + 1);
    }
  }

  if (joined) return <div className="waitlist-success"><span><Check size={16} /></span><div><strong>You’re on the list.</strong><p>We’ll send one useful note when {topic} opens up.</p></div></div>;
  const inputId = `waitlist-${topic.replaceAll(" ", "-")}`;
  return <><form className="waitlist-form" onSubmit={join}><label className="sr-only" htmlFor={inputId}>Email address</label><input id={inputId} value={email} onChange={(event) => setEmail(event.target.value)} type="email" placeholder="you@company.com" required /><button className="button button-dark" disabled={busy || !turnstileReady} type="submit">{busy ? <>Saving <LoaderCircle className="spin" size={15} /></> : !turnstileReady ? <>Verify to join <ArrowRight size={15} /></> : <>Join waitlist <ArrowRight size={15} /></>}</button></form><TurnstileField siteKey={turnstileSiteKey} action="waitlist" onToken={setTurnstileToken} onStateChange={setTurnstileState} resetNonce={turnstileResetNonce} />{error ? <p className="form-message form-error" role="alert">{error}</p> : null}</>;
}
