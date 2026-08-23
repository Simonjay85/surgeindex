"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowRight, Check, CreditCard, Eye, MousePointer2, Pause, Plus, ShieldCheck, Target } from "lucide-react";

type CampaignRow = {
  id: string;
  siteId: string;
  headline: string;
  placementKey: string;
  state: string;
  targetImpressions: number;
  validImpressions: number;
  renderedImpressions: number;
  invalidImpressions: number;
  validClicks: number;
  attributedVisits: number;
  budgetCents: number;
  currency: string;
  startAt: string | null;
  endAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type SiteOption = { id: string; name: string; domain: string };
type PackageOption = { id: string; name: string; amountCents: number; currency: string; targetImpressions: number; durationDays: number };
type PlacementOption = { key: string; name: string; description: string };

function money(cents: number, currency: string) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / 100);
}

export function BoostDashboardClient({ initialCampaigns, sites, packages, placements, paymentConfigured }: { initialCampaigns: CampaignRow[]; sites: SiteOption[]; packages: PackageOption[]; placements: PlacementOption[]; paymentConfigured: boolean }) {
  const [campaigns, setCampaigns] = useState(initialCampaigns);
  const [open, setOpen] = useState(false);
  const [siteId, setSiteId] = useState(sites[0]?.id ?? "");
  const [packageKey, setPackageKey] = useState(packages[0]?.id ?? "starter");
  const [placementKey, setPlacementKey] = useState(placements[0]?.key ?? "homepage_boosted");
  const [headline, setHeadline] = useState("");
  const [description, setDescription] = useState("");
  const [ctaLabel, setCtaLabel] = useState("Visit site");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const selectedPackage = packages.find((item) => item.id === packageKey) ?? packages[0];

  async function createDraft() {
    setBusy(true);
    setMessage(null);
    const response = await fetch("/api/boost/campaigns", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ siteId, packageKey, placementKey, headline, description, ctaLabel }) });
    const payload = await response.json().catch(() => null) as { data?: { campaign?: CampaignRow }; error?: { message?: string } } | null;
    setBusy(false);
    if (!response.ok || !payload?.data?.campaign) { setMessage(payload?.error?.message ?? "The campaign draft could not be created."); return; }
    setCampaigns((current) => [payload.data!.campaign!, ...current]);
    setOpen(false);
    setMessage("Draft created. Reserve inventory, submit the creative for review, then open Checkout.");
  }

  async function campaignAction(id: string, action: "reserve" | "checkout" | "pause" | "resume" | "cancel") {
    setBusy(true);
    setMessage(null);
    const response = await fetch(`/api/boost/campaigns/${id}/${action}`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    const payload = await response.json().catch(() => null) as { data?: { campaign?: CampaignRow; url?: string }; error?: { message?: string } } | null;
    setBusy(false);
    if (!response.ok) { setMessage(payload?.error?.message ?? "The campaign action could not be completed."); return; }
    if (payload?.data?.url) window.location.assign(payload.data.url);
    else setMessage(`${action} request accepted. Refresh the campaign report for server state.`);
  }

  return <>
    <div className="dashboard-topline-actions">
      <button className="button button-coral" type="button" onClick={() => setOpen((value) => !value)}><Plus size={15} /> Create a campaign</button>
    </div>
    <div className="section-tight">
      <div className="dashboard-grid">
        <div className="dashboard-card"><small>Campaigns</small><strong>{campaigns.length}</strong><p>Paid delivery is isolated from organic ranking.</p></div>
        <div className="dashboard-card"><small>Qualified impressions</small><strong>{campaigns.reduce((sum, item) => sum + item.validImpressions, 0).toLocaleString()}</strong><p>50% visible for 1 continuous second.</p></div>
        <div className="dashboard-card"><small>Valid clicks</small><strong>{campaigns.reduce((sum, item) => sum + item.validClicks, 0).toLocaleString()}</strong><p>A click is not counted as a visit.</p></div>
        <div className="dashboard-card"><small>Payment gate</small><strong>{paymentConfigured ? "Test" : "Off"}</strong><p>{paymentConfigured ? "Stripe test-mode configuration detected." : "Checkout is not configured in this environment."}</p></div>
      </div>
    </div>
    {message ? <div className="form-success" style={{ marginTop: 15 }}><Check size={15} /><p>{message}</p></div> : null}
    {open ? <div className="panel section-tight">
      <div className="panel-heading"><div><h2>Create Boost draft</h2><p>Price and qualified-impression target come from the server package. Boost does not affect organic rank or Heat Score.</p></div><ShieldCheck size={17} color="#2f8b62" /></div>
      {sites.length === 0 ? <p className="dashboard-empty">No eligible ownership-verified site is available.</p> : <div className="form-grid">
        <label>Owned site<select value={siteId} onChange={(event) => setSiteId(event.target.value)}>{sites.map((site) => <option value={site.id} key={site.id}>{site.name} · {site.domain}</option>)}</select></label>
        <label>Sponsored placement<select value={placementKey} onChange={(event) => setPlacementKey(event.target.value)}>{placements.map((placement) => <option value={placement.key} key={placement.key}>{placement.name}</option>)}</select></label>
        <label>Server package<select value={packageKey} onChange={(event) => setPackageKey(event.target.value)}>{packages.map((item) => <option value={item.id} key={item.id}>{item.name} · {money(item.amountCents, item.currency)} · {item.targetImpressions.toLocaleString()} qualified</option>)}</select></label>
        <div className="form-note"><strong>Package rule</strong><span>{selectedPackage ? `${selectedPackage.targetImpressions.toLocaleString()} qualified impressions over ${selectedPackage.durationDays} days. No click or conversion guarantee.` : "Choose a package."}</span></div>
        <label>Short headline<input value={headline} maxLength={80} onChange={(event) => setHeadline(event.target.value)} placeholder="What should visitors discover?" /></label>
        <label>Description<textarea value={description} maxLength={180} onChange={(event) => setDescription(event.target.value)} placeholder="A short, reviewed description." /></label>
        <label>CTA label<input value={ctaLabel} maxLength={24} onChange={(event) => setCtaLabel(event.target.value)} placeholder="Visit site" /></label>
      </div>}
      <div className="panel-actions"><button className="button button-coral" type="button" disabled={busy || !siteId} onClick={() => void createDraft()}>{busy ? "Creating…" : "Create draft"}</button><button className="button button-quiet" type="button" onClick={() => setOpen(false)}>Cancel</button></div>
    </div> : null}
    <div className="section-tight"><div className="panel"><div className="panel-heading"><div><h2>Campaign ledger</h2><p>Sponsored delivery, redirects, tracker attribution, and Stripe payment remain separate reporting stages.</p></div><span className="status-chip status-scheduled">Sponsored</span></div><div style={{ overflowX: "auto" }}><table className="boost-table"><thead><tr><th>Site & creative</th><th>Placement</th><th>Status</th><th>Qualified</th><th>Clicks</th><th>Attributed visits</th><th>Actions</th></tr></thead><tbody>{campaigns.length === 0 ? <tr><td colSpan={7}><div className="dashboard-empty">No campaigns yet. Create a draft after selecting an eligible owned site.</div></td></tr> : campaigns.map((campaign) => <tr key={campaign.id}><td><strong>{campaign.headline || "Untitled sponsored creative"}</strong><small>Paid placement · organic rank is never changed by spend</small></td><td>{campaign.placementKey}</td><td><span className="status-chip status-active">{campaign.state}</span></td><td>{campaign.validImpressions.toLocaleString()} <small>/ {campaign.targetImpressions.toLocaleString()}</small></td><td>{campaign.validClicks.toLocaleString()}</td><td>{campaign.attributedVisits > 0 ? campaign.attributedVisits.toLocaleString() : "Not available"}</td><td><div className="table-actions"><Link className="button button-quiet button-small" href={`/dashboard/boosts/${campaign.id}`}>Report</Link>{campaign.state === "draft" ? <button className="button button-quiet button-small" type="button" disabled={busy} onClick={() => void campaignAction(campaign.id, "reserve")}><Target size={13} /> Reserve</button> : null}{campaign.state === "inventory_reserved" ? <button className="button button-coral button-small" type="button" disabled={busy} onClick={() => void campaignAction(campaign.id, "checkout")}><CreditCard size={13} /> Checkout</button> : null}{campaign.state === "active" ? <button className="button button-quiet button-small" type="button" disabled={busy} onClick={() => void campaignAction(campaign.id, "pause")}><Pause size={13} /> Pause</button> : null}</div></td></tr>)}</tbody></table></div></div></div>
    <div className="section-tight"><div className="profile-columns"><div className="panel"><div className="panel-heading"><div><h2>Reporting definitions</h2><p>Transparent funnel stages.</p></div><Eye size={17} color="#bc7628" /></div><div className="dashboard-list"><div className="dashboard-list-row"><div><strong>Qualified impression</strong><span>At least 50% visible for at least 1 continuous second.</span></div><Eye size={15} /></div><div className="dashboard-list-row"><div><strong>Valid click</strong><span>Approved redirect after duplicate and bot checks.</span></div><MousePointer2 size={15} /></div><div className="dashboard-list-row"><div><strong>Attributed visit</strong><span>Requires the destination tracker to confirm the landing event.</span></div><Target size={15} /></div></div></div><div className="panel"><div className="panel-heading"><div><h2>Product rule</h2><p>Earn the rank. Buy the reach.</p></div><ShieldCheck size={17} color="#2f8b62" /></div><p style={{ color: "var(--foreground-muted)", fontSize: 12 }}>Every public paid card is labeled Sponsored. Paid impressions, clicks, spend, and attribution are excluded from Heat Score and organic ranking.</p><Link className="button button-coral" href="/boost">Review Boost rules <ArrowRight size={15} /></Link></div></div></div>
  </>;
}
