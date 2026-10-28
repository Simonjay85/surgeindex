"use client";

import { useState } from "react";
import { Check, Code2, FileKey2, Globe2, Info, LoaderCircle, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { TurnstileField, type TurnstileState } from "./turnstile-field";

type Method = "meta_tag" | "dns_txt";

export function ClaimClient({ siteId, domain, isDemo, turnstileSiteKey }: { siteId: string; domain: string; isDemo: boolean; turnstileSiteKey?: string }) {
  const [method, setMethod] = useState<Method>("meta_tag");
  const [claim, setClaim] = useState<{ claimId: string; token: string; expiresAt: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [verified, setVerified] = useState(false);
  const [startTurnstileToken, setStartTurnstileToken] = useState("");
  const [verifyTurnstileToken, setVerifyTurnstileToken] = useState("");
  const [startTurnstileState, setStartTurnstileState] = useState<TurnstileState>(turnstileSiteKey ? "loading" : "ready");
  const [verifyTurnstileState, setVerifyTurnstileState] = useState<TurnstileState>(turnstileSiteKey ? "loading" : "ready");
  const [startResetNonce, setStartResetNonce] = useState(0);
  const [verifyResetNonce, setVerifyResetNonce] = useState(0);
  const startReady = !turnstileSiteKey || (startTurnstileState === "verified" && Boolean(startTurnstileToken));
  const verifyReady = !turnstileSiteKey || (verifyTurnstileState === "verified" && Boolean(verifyTurnstileToken));

  async function start() {
    if (!startReady) { setMessage("Complete the anti-bot verification before starting a claim."); return; }
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/claims", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ siteId, method, turnstileToken: startTurnstileToken }) });
      const payload = await response.json().catch(() => null) as { data?: typeof claim; error?: { message?: string } } | null;
      if (!response.ok || !payload?.data) setMessage(payload?.error?.message ?? "Sign in is required to start a claim.");
      else {
        setClaim(payload.data);
        setVerifyTurnstileToken("");
        setVerifyResetNonce((current) => current + 1);
      }
    } catch {
      setMessage("The claim challenge could not be created. Check your connection and try again.");
    }
    setBusy(false);
    setStartTurnstileToken("");
    setStartResetNonce((current) => current + 1);
  }

  async function verify() {
    if (!claim) return;
    if (!verifyReady) { setMessage("Complete the anti-bot verification before checking your proof."); return; }
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(`/api/claims/${claim.claimId}/verify`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ turnstileToken: verifyTurnstileToken }) });
      const payload = await response.json().catch(() => null) as { error?: { message?: string } } | null;
      if (!response.ok) setMessage(payload?.error?.message ?? "The proof was not found yet.");
      else setVerified(true);
    } catch {
      setMessage("The proof check failed. Check your connection and try again.");
    }
    setBusy(false);
    setVerifyTurnstileToken("");
    setVerifyResetNonce((current) => current + 1);
  }

  if (isDemo) return <div className="panel"><div className="panel-heading"><div><h2>Demo verification architecture</h2><p>Real claims are enabled only when the PostgreSQL provider is selected.</p></div><Info size={16} color="#847b75" /></div><div className="dashboard-list"><div className="dashboard-list-row"><div><strong>Meta tag</strong><span>Token challenge with server-side fetch and replay-safe expiry.</span></div><Code2 size={18} color="#ef7359" /></div><div className="dashboard-list-row"><div><strong>DNS TXT</strong><span>Exact TXT token match, attempt limit, and conflict transaction.</span></div><Globe2 size={18} color="#ef7359" /></div></div><div className="method-note" style={{ marginTop: 18 }}><ShieldCheck size={14} /> Demo mode does not create a claim or mutate a domain.</div></div>;

  return <div className="panel"><div className="panel-heading"><div><h2>Verify ownership</h2><p>Use one proof method for {domain}. Tokens expire after 30 minutes.</p></div><ShieldCheck size={16} color="#2f8b62" /></div><div className="dashboard-list"><button type="button" className={`dashboard-list-row claim-method ${method === "meta_tag" ? "claim-method-active" : ""}`} onClick={() => setMethod("meta_tag")}><div><strong>Meta tag</strong><span>Add the token to the homepage HTML.</span></div><Code2 size={18} color="#ef7359" /></button><button type="button" className={`dashboard-list-row claim-method ${method === "dns_txt" ? "claim-method-active" : ""}`} onClick={() => setMethod("dns_txt")}><div><strong>DNS TXT</strong><span>Add an exact token to the domain DNS records.</span></div><Globe2 size={18} color="#ef7359" /></button></div>{claim ? <div className="dashboard-alert" style={{ marginTop: 15 }}><FileKey2 size={16} /><span><strong>{method === "dns_txt" ? `surgeindex-verification=${claim.token}` : `<meta name="surgeindex-verification" content="${claim.token}" />`}</strong><small style={{ display: "block", marginTop: 4 }}>Expires {new Date(claim.expiresAt).toLocaleString()}</small></span></div> : null}<TurnstileField siteKey={turnstileSiteKey} action="claim-start" onToken={setStartTurnstileToken} onStateChange={setStartTurnstileState} resetNonce={startResetNonce} />{claim ? <TurnstileField siteKey={turnstileSiteKey} action="claim-verify" onToken={setVerifyTurnstileToken} onStateChange={setVerifyTurnstileState} resetNonce={verifyResetNonce} /> : null}{message ? <p className="form-message form-error" style={{ marginTop: 14 }} role="alert">{message}</p> : null}{verified ? <div className="form-success" style={{ marginTop: 14 }}><Check size={15} /><p>Ownership verified. The claim was committed and the site owner record is now active.</p></div> : <div className="copy-row" style={{ marginTop: 16 }}><button type="button" className="button button-coral" onClick={() => void start()} disabled={busy || !startReady}>{busy ? <LoaderCircle className="spin" size={15} /> : <ShieldCheck size={15} />} {claim ? "Create a new challenge" : !startReady ? "Verify to continue" : "Create challenge"}</button>{claim ? <button type="button" className="button button-dark" onClick={() => void verify()} disabled={busy || !verifyReady}>{!verifyReady ? "Verify anti-bot first" : "Verify proof"} <Check size={15} /></button> : null}</div>}{!claim && message.includes("Sign in") ? <Link className="text-link" style={{ marginTop: 15 }} href={`/auth/sign-in?next=/claim/${siteId}`}>Sign in to continue</Link> : null}</div>;
}
