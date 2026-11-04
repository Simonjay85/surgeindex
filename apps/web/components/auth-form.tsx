"use client";

import { useState } from "react";
import { Check, LoaderCircle, LockKeyhole, Signal } from "lucide-react";
import { TurnstileField } from "./turnstile-field";
import { safeInternalPath } from "../lib/utils";
import type { TurnstileState } from "./turnstile-field";

export function AuthForm({ isDemo, nextPath = "/dashboard", initialMode = "sign-in", googleEnabled = false, turnstileSiteKey }: { isDemo: boolean; nextPath?: string; initialMode?: "sign-in" | "sign-up"; googleEnabled?: boolean; turnstileSiteKey?: string }) {
  const destination = safeInternalPath(nextPath);
  const [mode, setMode] = useState<"sign-in" | "sign-up">(initialMode);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [turnstileToken, setTurnstileToken] = useState("");
  const [turnstileState, setTurnstileState] = useState<TurnstileState>(turnstileSiteKey ? "loading" : "ready");
  const [turnstileResetNonce, setTurnstileResetNonce] = useState(0);
  const turnstileReady = !turnstileSiteKey || (turnstileState === "verified" && Boolean(turnstileToken));

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    if (mode === "sign-up" && !turnstileReady) {
      setError("Complete the anti-bot verification before creating your account.");
      setBusy(false);
      return;
    }
    const endpoint = mode === "sign-up" ? "/api/auth/sign-up/email" : "/api/auth/sign-in/email";
    let response: Response | null = null;
    try {
      const callbackURL = mode === "sign-up" ? `/auth/sign-in?next=${encodeURIComponent(destination)}` : destination;
      response = await fetch(endpoint, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: name.trim(), email: email.trim(), password, callbackURL, ...(mode === "sign-up" ? { turnstileToken } : {}) }) });
    } catch {
      setError("Authentication failed. Check your connection and try again.");
    }
    if (!response) { setBusy(false); setTurnstileToken(""); setTurnstileResetNonce((current) => current + 1); return; }
    const payload = await response.json().catch(() => null) as { message?: string; error?: { message?: string } } | null;
    if (!response.ok) {
      setError(payload?.error?.message ?? payload?.message ?? "Authentication failed. Check your details and try again.");
      setBusy(false);
      setTurnstileToken("");
      setTurnstileResetNonce((current) => current + 1);
      return;
    }
    if (mode === "sign-up") {
      setNotice("Account created. Check your email to verify the address before signing in.");
      setMode("sign-in");
      setPassword("");
      setBusy(false);
      setTurnstileToken("");
      setTurnstileResetNonce((current) => current + 1);
      return;
    }
    window.location.assign(destination);
  }

  async function signInWithGoogle() {
    setBusy(true);
    const response = await fetch("/api/auth/sign-in/social", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ provider: "google", callbackURL: destination }) });
    const payload = await response.json().catch(() => null) as { url?: string; error?: { message?: string } } | null;
    if (response.ok && payload?.url) window.location.assign(payload.url);
    else { setError(payload?.error?.message ?? "Google sign-in could not be started."); setBusy(false); }
  }

  if (isDemo) return <div className="panel" style={{ padding: 31 }}><div className="brand"><span className="brand-mark"><Signal size={17} /></span><span>SurgeIndex</span></div><h1 style={{ fontSize: 45, marginTop: 25 }}>Welcome back.</h1><p style={{ color: "var(--foreground-muted)" }}>Demo access takes you straight to the owner dashboard. Production adds persistent Better Auth sessions here.</p><div className="dashboard-alert" style={{ marginTop: 19 }}><LockKeyhole size={16} /><span>This preview does not create a real session or collect credentials.</span></div><a className="button button-coral" style={{ width: "100%", marginTop: 20 }} href="/dashboard">Continue with demo workspace <Check size={16} /></a><div className="method-note" style={{ marginTop: 19 }}>Production architecture: secure cookies, server-side role checks, and no secrets in client code.</div></div>;

  return <div className="panel" style={{ padding: 31 }}><div className="brand"><span className="brand-mark"><Signal size={17} /></span><span>SurgeIndex</span></div><h1 style={{ fontSize: 45, marginTop: 25 }}>{mode === "sign-in" ? "Welcome back." : "Create your workspace."}</h1><p style={{ color: "var(--foreground-muted)" }}>{mode === "sign-in" ? "Sign in to manage sites, claims, and persisted metrics." : "Create an owner account. Verify your email before submitting a site or managing a listing."}</p><form onSubmit={submit} style={{ display: "grid", gap: 14, marginTop: 20 }}>{mode === "sign-up" ? <label className="field-label">Name<input required value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" /></label> : null}<label className="field-label">Email<input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" /></label><label className="field-label">Password<input required type="password" minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={mode === "sign-in" ? "current-password" : "new-password"} /></label>{mode === "sign-up" ? <TurnstileField siteKey={turnstileSiteKey} action="signup" onToken={setTurnstileToken} onStateChange={setTurnstileState} resetNonce={turnstileResetNonce} /> : null}{notice ? <p className="form-message" role="status">{notice}</p> : null}{error ? <p className="form-message form-error" role="alert">{error}</p> : null}<button className="button button-coral" type="submit" disabled={busy || (mode === "sign-up" && !turnstileReady)}>{busy ? <><LoaderCircle className="spin" size={16} /> Working…</> : mode === "sign-in" ? "Sign in" : !turnstileReady ? "Verify to create account" : "Create account"}</button></form>{googleEnabled ? <button className="button button-quiet" style={{ width: "100%", marginTop: 11 }} type="button" onClick={() => void signInWithGoogle()} disabled={busy}>Continue with Google</button> : null}<button className="text-link" style={{ border: 0, background: "transparent", marginTop: 18, padding: 0 }} type="button" onClick={() => { setMode(mode === "sign-in" ? "sign-up" : "sign-in"); setError(""); setNotice(""); setTurnstileToken(""); setTurnstileResetNonce((current) => current + 1); }}>{mode === "sign-in" ? "Need an account? Create one" : "Already have an account? Sign in"}</button><div className="method-note" style={{ marginTop: 19 }}><LockKeyhole size={14} /> Sessions use Better Auth httpOnly secure cookies. Dashboard and admin authorization is checked on the server.</div></div>;
}
