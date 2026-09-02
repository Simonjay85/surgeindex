"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowLeft, LoaderCircle, MailCheck } from "lucide-react";
import { TurnstileField, type TurnstileState } from "./turnstile-field";

export function ForgotPasswordForm({ turnstileSiteKey }: { turnstileSiteKey?: string }) {
  const [email, setEmail] = useState("");
  const [turnstileToken, setTurnstileToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [turnstileState, setTurnstileState] = useState<TurnstileState>(turnstileSiteKey ? "loading" : "ready");
  const [turnstileResetNonce, setTurnstileResetNonce] = useState(0);
  const turnstileReady = !turnstileSiteKey || (turnstileState === "verified" && Boolean(turnstileToken));

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    if (!turnstileReady) { setError("Complete the anti-bot verification before requesting a reset link."); setBusy(false); return; }
    try {
      const response = await fetch("/api/auth/request-password-reset", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: email.trim(), redirectTo: "/auth/reset-password", turnstileToken }) });
      const payload = await response.json().catch(() => null) as { error?: { message?: string } } | null;
      if (!response.ok) setError(payload?.error?.message ?? "We could not start password recovery.");
      else setMessage("If an account exists for that address, a reset link is on its way.");
    } catch {
      setError("We could not start password recovery. Check your connection and try again.");
    }
    setBusy(false);
    setTurnstileToken("");
    setTurnstileResetNonce((current) => current + 1);
  }

  return <div className="panel" style={{ padding: 31 }}><div className="brand"><span className="brand-mark"><MailCheck size={17} /></span><span>SurgeIndex</span></div><h1 style={{ fontSize: 42, marginTop: 25 }}>Reset your password.</h1><p style={{ color: "var(--foreground-muted)" }}>We will send a one-time reset link if the address is registered.</p><form onSubmit={submit} style={{ display: "grid", gap: 14, marginTop: 22 }}><label className="field-label">Email<input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" /></label><TurnstileField siteKey={turnstileSiteKey} action="password-reset" onToken={setTurnstileToken} onStateChange={setTurnstileState} resetNonce={turnstileResetNonce} />{message ? <p className="form-message" role="status">{message}</p> : null}{error ? <p className="form-message form-error" role="alert">{error}</p> : null}<button className="button button-coral" type="submit" disabled={busy || !turnstileReady}>{busy ? <><LoaderCircle className="spin" size={16} /> Sending…</> : !turnstileReady ? "Verify to continue" : "Send reset link"}</button></form><Link className="text-link" style={{ marginTop: 20 }} href="/auth/sign-in"><ArrowLeft size={14} /> Back to sign in</Link></div>;
}

export function ResetPasswordForm({ token, turnstileSiteKey }: { token?: string; turnstileSiteKey?: string }) {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState(token ? "" : "This reset link is missing its token.");
  const [turnstileToken, setTurnstileToken] = useState("");
  const [turnstileState, setTurnstileState] = useState<TurnstileState>(turnstileSiteKey ? "loading" : "ready");
  const [turnstileResetNonce, setTurnstileResetNonce] = useState(0);
  const turnstileReady = !turnstileSiteKey || (turnstileState === "verified" && Boolean(turnstileToken));

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) return;
    setBusy(true);
    setError("");
    setMessage("");
    if (!turnstileReady) { setError("Complete the anti-bot verification before updating your password."); setBusy(false); return; }
    try {
      const response = await fetch("/api/auth/reset-password", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ newPassword: password, token, turnstileToken }) });
      const payload = await response.json().catch(() => null) as { error?: { message?: string }; message?: string } | null;
      if (!response.ok) setError(payload?.error?.message ?? payload?.message ?? "The reset link is expired or invalid.");
      else setMessage("Password updated. You can sign in with the new password.");
    } catch {
      setError("The password could not be updated. Check your connection and try again.");
    }
    setBusy(false);
    setTurnstileToken("");
    setTurnstileResetNonce((current) => current + 1);
  }

  return <div className="panel" style={{ padding: 31 }}><div className="brand"><span className="brand-mark"><MailCheck size={17} /></span><span>SurgeIndex</span></div><h1 style={{ fontSize: 42, marginTop: 25 }}>Choose a new password.</h1><p style={{ color: "var(--foreground-muted)" }}>Reset links are single-use and expire automatically.</p><form onSubmit={submit} style={{ display: "grid", gap: 14, marginTop: 22 }}><label className="field-label">New password<input required minLength={8} type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" /></label><TurnstileField siteKey={turnstileSiteKey} action="password-reset" onToken={setTurnstileToken} onStateChange={setTurnstileState} resetNonce={turnstileResetNonce} />{message ? <p className="form-message" role="status">{message}</p> : null}{error ? <p className="form-message form-error" role="alert">{error}</p> : null}<button className="button button-coral" type="submit" disabled={busy || !token || !turnstileReady}>{busy ? <><LoaderCircle className="spin" size={16} /> Updating…</> : !turnstileReady ? "Verify to continue" : "Update password"}</button></form><Link className="text-link" style={{ marginTop: 20 }} href="/auth/sign-in"><ArrowLeft size={14} /> Back to sign in</Link></div>;
}

export function ResendVerificationForm({ turnstileSiteKey, initialEmail }: { turnstileSiteKey?: string; initialEmail?: string }) {
  const [email, setEmail] = useState(initialEmail ?? "");
  const [turnstileToken, setTurnstileToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [turnstileState, setTurnstileState] = useState<TurnstileState>(turnstileSiteKey ? "loading" : "ready");
  const [turnstileResetNonce, setTurnstileResetNonce] = useState(0);
  const turnstileReady = !turnstileSiteKey || (turnstileState === "verified" && Boolean(turnstileToken));

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    if (!turnstileReady) { setError("Complete the anti-bot verification before requesting an email."); setBusy(false); return; }
    try {
      const response = await fetch("/api/auth/send-verification-email", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: email.trim(), callbackURL: "/auth/sign-in", turnstileToken }) });
      const payload = await response.json().catch(() => null) as { error?: { message?: string } } | null;
      if (!response.ok) setError(payload?.error?.message ?? "We could not send a verification email.");
      else setMessage("If the account needs verification, a fresh link is on its way.");
    } catch {
      setError("We could not send a verification email. Check your connection and try again.");
    }
    setBusy(false);
    setTurnstileToken("");
    setTurnstileResetNonce((current) => current + 1);
  }

  return <div className="panel" style={{ padding: 31 }}><div className="brand"><span className="brand-mark"><MailCheck size={17} /></span><span>SurgeIndex</span></div><h1 style={{ fontSize: 42, marginTop: 25 }}>Verify your email.</h1><p style={{ color: "var(--foreground-muted)" }}>Request another one-time verification link.</p><form onSubmit={submit} style={{ display: "grid", gap: 14, marginTop: 22 }}><label className="field-label">Email<input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" /></label><TurnstileField siteKey={turnstileSiteKey} action="verification-resend" onToken={setTurnstileToken} onStateChange={setTurnstileState} resetNonce={turnstileResetNonce} />{message ? <p className="form-message" role="status">{message}</p> : null}{error ? <p className="form-message form-error" role="alert">{error}</p> : null}<button className="button button-coral" type="submit" disabled={busy || !turnstileReady}>{busy ? <><LoaderCircle className="spin" size={16} /> Sending…</> : !turnstileReady ? "Verify to continue" : "Resend verification email"}</button></form><Link className="text-link" style={{ marginTop: 20 }} href="/auth/sign-in"><ArrowLeft size={14} /> Back to sign in</Link></div>;
}
