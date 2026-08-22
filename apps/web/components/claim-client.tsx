"use client";

import { useState } from "react";
import { Check, Code2, FileKey2, Globe2, Info, LoaderCircle, ShieldCheck } from "lucide-react";
import Link from "next/link";

type Method = "meta_tag" | "dns_txt";

export function ClaimClient({ siteId, domain, isDemo }: { siteId: string; domain: string; isDemo: boolean }) {
  const [method, setMethod] = useState<Method>("meta_tag");
  const [claim, setClaim] = useState<{ claimId: string; token: string; expiresAt: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [verified, setVerified] = useState(false);

  async function start() {
    setBusy(true);
    setMessage("");
    const response = await fetch("/api/claims", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ siteId, method }) });
    const payload = await response.json().catch(() => null) as { data?: typeof claim; error?: { message?: string } } | null;
    if (!response.ok || !payload?.data) setMessage(payload?.error?.message ?? "Sign in is required to start a claim.");
    else setClaim(payload.data);
    setBusy(false);
  }

  async function verify() {
    if (!claim) return;
    setBusy(true);
    setMessage("");
    const response = await fetch(`/api/claims/${claim.claimId}/verify`, { method: "POST", headers: { "content-type": "application/json" } });
    const payload = await response.json().catch(() => null) as { error?: { message?: string } } | null;
    if (!response.ok) setMessage(payload?.error?.message ?? "The proof was not found yet.");
    else setVerified(true);
    setBusy(false);
  }

  if (isDemo) return <div className="panel"><div className="panel-heading"><div><h2>Demo verification architecture</h2><p>Real claims are enabled only when the PostgreSQL provider is selected.</p></div><Info size={16} color="#847b75" /></div><div className="dashboard-list"><div className="dashboard-list-row"><div><strong>Meta tag</strong><span>Token challenge with server-side fetch and replay-safe expiry.</span></div><Code2 size={18} color="#ef7359" /></div><div className="dashboard-list-row"><div><strong>DNS TXT</strong><span>Exact TXT token match, attempt limit, and conflict transaction.</span></div><Globe2 size={18} color="#ef7359" /></div></div><div className="method-note" style={{ marginTop: 18 }}><ShieldCheck size={14} /> Demo mode does not create a claim or mutate a domain.</div></div>;

  return <div className="panel"><div className="panel-heading"><div><h2>Verify ownership</h2><p>Use one proof method for {domain}. Tokens expire after 30 minutes.</p></div><ShieldCheck size={16} color="#2f8b62" /></div><div className="dashboard-list"><button className={`dashboard-list-row claim-method ${method === "meta_tag" ? "claim-method-active" : ""}`} onClick={() => setMethod("meta_tag")}><div><strong>Meta tag</strong><span>Add the token to the homepage HTML.</span></div><Code2 size={18} color="#ef7359" /></button><button className={`dashboard-list-row claim-method ${method === "dns_txt" ? "claim-method-active" : ""}`} onClick={() => setMethod("dns_txt")}><div><strong>DNS TXT</strong><span>Add an exact token to the domain DNS records.</span></div><Globe2 size={18} color="#ef7359" /></button></div>{claim ? <div className="dashboard-alert" style={{ marginTop: 15 }}><FileKey2 size={16} /><span><strong>{method === "dns_txt" ? `surgeindex-verification=${claim.token}` : `<meta name="surgeindex-verification" content="${claim.token}" />`}</strong><small style={{ display: "block", marginTop: 4 }}>Expires {new Date(claim.expiresAt).toLocaleString()}</small></span></div> : null}{message ? <p className="form-message form-error" style={{ marginTop: 14 }}>{message}</p> : null}{verified ? <div className="form-success" style={{ marginTop: 14 }}><Check size={15} /><p>Ownership verified. The claim was committed and the site owner record is now active.</p></div> : <div className="copy-row" style={{ marginTop: 16 }}><button className="button button-coral" onClick={() => void start()} disabled={busy}>{busy ? <LoaderCircle className="spin" size={15} /> : <ShieldCheck size={15} />} {claim ? "Create a new challenge" : "Create challenge"}</button>{claim ? <button className="button button-dark" onClick={() => void verify()} disabled={busy}>Verify proof <Check size={15} /></button> : null}</div>}{!claim && message.includes("Sign in") ? <Link className="text-link" style={{ marginTop: 15 }} href={`/auth/sign-in?next=/claim/${siteId}`}>Sign in to continue</Link> : null}</div>;
}
