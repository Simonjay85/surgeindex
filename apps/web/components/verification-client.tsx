"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Check, Copy, ExternalLink, Info, RefreshCw, ShieldCheck, Terminal, XCircle } from "lucide-react";
import type { DemoSite } from "../lib/demo-data";
import { AppShell, DataModeBadge } from "./app-shell";
import { DashboardShell, DashboardTopline, DemoNotice } from "./dashboard-shell";

type TrackerStatus = "not_installed" | "waiting" | "connected" | "active" | "stale" | "revoked" | "error";
type TrackerState = {
  status: TrackerStatus;
  key: { publicKey: string; version: number; environment: string; createdAt: string; allowedDomains: string[] } | null;
  lastEventAt: string | null;
  lastDetectedOrigin: string | null;
  trackerVersion: string | null;
  freshness: string;
  installation: { snippet: string; tabs: Record<string, string[]> } | null;
};

const tabLabels: Record<string, string> = { html: "Plain HTML", nextjs: "Next.js", wordpress: "WordPress", shopify: "Shopify", webflow: "Webflow", gtm: "Google Tag Manager" };

function statusText(status: TrackerStatus) {
  return ({ not_installed: "Not installed", waiting: "Waiting for first event", connected: "Connected", active: "Active", stale: "Stale", revoked: "Revoked", error: "Error" } satisfies Record<TrackerStatus, string>)[status];
}

function initialState(site: DemoSite): TrackerState {
  if (site.isDemo) return { status: site.verification === "tracker" ? "active" : "not_installed", key: null, lastEventAt: site.lastAcceptedEventAt, lastDetectedOrigin: site.lastDetectedOrigin, trackerVersion: site.trackerVersion, freshness: "demo", installation: null };
  return { status: site.verification === "tracker" ? "connected" : "not_installed", key: null, lastEventAt: site.lastAcceptedEventAt, lastDetectedOrigin: site.lastDetectedOrigin, trackerVersion: site.trackerVersion, freshness: site.lastAcceptedEventAt ? "fresh" : "unknown", installation: null };
}

export function VerificationClient({ site }: { site: DemoSite }) {
  const [state, setState] = useState<TrackerState>(() => initialState(site));
  const [tab, setTab] = useState("html");
  const [copied, setCopied] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const isDemo = site.isDemo;
  const snippet = state.installation?.snippet ?? `<script defer src="/tracker.js" data-site="pk_test_demo_${site.slug}"></script>`;
  const selectedSteps = useMemo(() => state.installation?.tabs[tab] ?? ["Generate a real key after ownership verification, then publish the tracker."], [state.installation, tab]);

  useEffect(() => {
    if (isDemo) return;
    let cancelled = false;
    void fetch(`/api/tracker/sites/${site.siteId}/tracker-key`, { cache: "no-store" }).then(async (response) => {
      if (!response.ok) throw new Error("status unavailable");
      const payload = await response.json() as { data: TrackerState };
      if (!cancelled && payload.data) setState(payload.data);
    }).catch(() => { if (!cancelled) setState((current) => ({ ...current, status: "error" })); });
    return () => { cancelled = true; };
  }, [isDemo, site.siteId]);

  async function copy(value: string, name: string) {
    await navigator.clipboard?.writeText(value);
    setCopied(name);
    window.setTimeout(() => setCopied(null), 1400);
  }

  async function mutate(action: "generate" | "rotate") {
    setBusy(true); setMessage(null);
    try {
      const response = await fetch(`/api/tracker/sites/${site.siteId}/tracker-key`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) });
      const payload = await response.json() as { data?: TrackerState; error?: { message?: string } };
      if (!response.ok || !payload.data) throw new Error(payload.error?.message ?? "The key operation failed.");
      setState(payload.data);
      setMessage(action === "rotate" ? "New key activated. The previous key is revoked." : "Tracker key generated and activated.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "The key operation failed."); }
    finally { setBusy(false); }
  }

  async function revoke() {
    setBusy(true); setMessage(null);
    try {
      const response = await fetch(`/api/tracker/sites/${site.siteId}/tracker-key`, { method: "DELETE" });
      const payload = await response.json() as { data?: TrackerState; error?: { message?: string } };
      if (!response.ok || !payload.data) throw new Error(payload.error?.message ?? "The key could not be revoked.");
      setState(payload.data); setMessage("Tracker key revoked. Future events will be rejected.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "The key could not be revoked."); }
    finally { setBusy(false); }
  }

  async function testInstallation() {
    setBusy(true); setMessage(null);
    try {
      const response = await fetch(`/api/tracker/sites/${site.siteId}/tracker-key/test`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ since: new Date(Date.now() - 10 * 60 * 1000).toISOString() }) });
      const payload = await response.json() as { data?: { accepted: boolean; event?: { receivedAt: string } | null }; error?: { message?: string } };
      if (!response.ok) throw new Error(payload.error?.message ?? "The installation test failed.");
      setMessage(payload.data?.accepted ? `Real accepted event detected at ${new Date(payload.data.event?.receivedAt ?? Date.now()).toLocaleTimeString()}.` : "No accepted event yet. Publish the snippet and load the controlled site, then test again.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "The installation test failed."); }
    finally { setBusy(false); }
  }

  return <AppShell><DashboardShell active="/dashboard/sites"><DashboardTopline title="Tracker installation" description={`${site.name} · ownership and traffic-source state`} action={<Link className="text-link" href={`/dashboard/sites/${site.siteId}`}><ArrowLeft size={14} /> Site overview</Link>} />{isDemo ? <DemoNotice>Demo verification states are simulated. Production key mutations and Test installation are disabled in demo mode.</DemoNotice> : <div className="demo-ribbon dashboard-notice"><DataModeBadge isDemo={false} compact /> <span>Ownership verification and traffic connection are independent states.</span></div>}<div className="section-tight"><div className="profile-columns"><div className="panel"><div className="panel-heading"><div><h2>Traffic source</h2><p>Only valid accepted tracker events can connect this site.</p></div><ShieldCheck size={17} color={state.status === "active" || state.status === "connected" ? "#2f8b62" : "#847b75"} /></div><div className="dashboard-alert" style={state.status === "active" ? { background: "#e8f5ec", color: "var(--success)" } : undefined}>{state.status === "active" || state.status === "connected" ? <Check size={16} /> : state.status === "revoked" ? <XCircle size={16} /> : <Info size={16} />}<span><strong>{statusText(state.status)}</strong>{state.status === "stale" ? " · no recent accepted event." : state.status === "waiting" ? " · key is ready for the first accepted event." : state.status === "not_installed" ? " · generate a key after ownership verification." : ""}</span></div><div className="dashboard-list" style={{ marginTop: 10 }}><div className="dashboard-list-row"><div><strong>Last accepted event</strong><span>{state.lastEventAt ? new Date(state.lastEventAt).toLocaleString() : "None"}</span></div><RefreshCw size={15} /></div><div className="dashboard-list-row"><div><strong>Last detected origin</strong><span>{state.lastDetectedOrigin ?? "Not detected"}</span></div><Terminal size={15} /></div><div className="dashboard-list-row"><div><strong>Tracker version</strong><span>{state.trackerVersion ?? "Not detected"}</span></div><span className="status-chip status-scheduled">{state.freshness}</span></div></div></div><div className="panel"><div className="panel-heading"><div><h2>Owner proof</h2><p>Traffic cannot replace ownership verification.</p></div><ShieldCheck size={17} color={site.ownership === "claimed" ? "#2f8b62" : "#bc7628"} /></div><div className="dashboard-alert" style={site.ownership === "claimed" ? { background: "#e8f5ec", color: "var(--success)" } : undefined}><ShieldCheck size={16} /><span><strong>{site.ownership === "claimed" ? "Ownership verified" : "Unclaimed"}</strong>{site.ownership === "claimed" ? " · key management is available." : " · finish a claim before generating a key."}</span></div><div className="dashboard-list" style={{ marginTop: 10 }}><div className="dashboard-list-row"><div><strong>Domain claim</strong><span>{site.ownership === "claimed" ? "Verified owner record" : "No successful claim record"}</span></div>{site.ownership === "claimed" ? <Check size={15} color="#2f8b62" /> : <Link className="button button-quiet button-small" href={`/claim/${site.siteId}`}>Start claim</Link>}</div><div className="dashboard-list-row"><div><strong>Methodology</strong><span>Tracker measured does not mean cryptographically human verified.</span></div><Link className="text-link" href="/methodology"><ExternalLink size={14} /></Link></div></div></div></div></div><div className="section-tight"><div className="panel"><div className="panel-heading"><div><h2>Install the real tracker</h2><p>Send only pathname, referrer hostname, anonymous IDs, and timing fields.</p></div><DataModeBadge isDemo={isDemo} compact /></div><div className="tabs">{Object.entries(tabLabels).map(([key, label]) => <button className={`tab ${tab === key ? "tab-active" : ""}`} key={key} onClick={() => setTab(key)}>{label}</button>)}</div><ol className="dashboard-list" style={{ marginBottom: 14 }}>{selectedSteps.map((step) => <li className="dashboard-list-row" key={step}><span>{step}</span></li>)}</ol><pre className="code-panel"><code>{snippet}</code></pre><div className="copy-row"><button className="button button-dark button-small" onClick={() => void copy(snippet, "snippet")}><Copy size={14} /> {copied === "snippet" ? "Copied" : "Copy snippet"}</button>{state.key ? <button className="button button-quiet button-small" onClick={() => void copy(state.key?.publicKey ?? "", "key")}><Copy size={14} /> {copied === "key" ? "Copied" : "Copy public key"}</button> : null}<button className="button button-quiet button-small" disabled={busy || isDemo} onClick={() => void testInstallation()}><Check size={14} /> Test installation</button></div>{message ? <div className="method-note" style={{ marginTop: 12 }}><Info size={14} /> {message}</div> : null}<div className="copy-row" style={{ marginTop: 15 }}>{!isDemo && site.ownership === "claimed" ? <><button className="button button-coral button-small" disabled={busy} onClick={() => void mutate(state.key ? "rotate" : "generate")}>{state.key ? "Rotate key" : "Generate key"}</button>{state.key && state.status !== "revoked" ? <button className="button button-quiet button-small" disabled={busy} onClick={() => void revoke()}>Revoke key</button> : null}</> : null}</div></div></div><div className="section-tight"><div className="panel"><div className="panel-heading"><div><h2>Troubleshooting</h2><p>Connection status is based on real accepted events.</p></div><Info size={17} /></div><div className="dashboard-list"><div className="dashboard-list-row"><div><strong>Waiting for first event</strong><span>Check the published page source, public key, and collector URL.</span></div></div><div className="dashboard-list-row"><div><strong>Stale tracker</strong><span>Visible heartbeats pause while a tab is hidden and expire after the configured TTL.</span></div></div><div className="dashboard-list-row"><div><strong>Rejected event</strong><span>Confirm the browser origin matches an allowed domain; CORS alone is not an authorization boundary.</span></div></div></div></div></div></DashboardShell></AppShell>;
}
