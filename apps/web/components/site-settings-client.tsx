"use client";

import { useEffect, useState } from "react";
import { Check, LoaderCircle, Save, ShieldCheck } from "lucide-react";
import type { CategoryInfo } from "@surge/shared";
import { TurnstileField } from "./turnstile-field";

type SiteSettings = {
  id: string;
  name: string;
  description: string;
  domain: string;
  categoryId: string | null;
  logoUrl: string | null;
  faviconUrl: string | null;
  permittedAliases: string[];
  publicRevenueVisible: boolean;
  publicPageMetricsVisible: boolean;
  updatedAt: string;
  tags: string[];
};

export function SiteSettingsClient({ siteId, initialCategories, isDemo, turnstileSiteKey }: { siteId: string; initialCategories: CategoryInfo[]; isDemo: boolean; turnstileSiteKey?: string }) {
  const [settings, setSettings] = useState<SiteSettings | null>(null);
  const [categories, setCategories] = useState<Array<{ id: string; name: string }>>(initialCategories);
  const [form, setForm] = useState({ name: "", description: "", categoryId: initialCategories[0]?.id ?? "", tags: "", logoUrl: "", faviconUrl: "", permittedAliases: "", publicRevenueVisible: false, publicPageMetricsVisible: false });
  const [token, setToken] = useState("");
  const [state, setState] = useState<"loading" | "ready" | "saving" | "saved" | "error">(isDemo ? "ready" : "loading");
  const [message, setMessage] = useState(isDemo ? "Demo listing changes are intentionally read-only." : "");

  useEffect(() => {
    if (isDemo) return;
    fetch(`/api/owner/sites/${siteId}/settings`, { headers: { accept: "application/json" }, cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json().catch(() => null) as { data?: { site: SiteSettings; categories: Array<{ id: string; slug: string; name: string }> }; error?: { message?: string } } | null;
        if (!response.ok || !payload?.data) throw new Error(payload?.error?.message ?? "The listing settings could not be loaded.");
        const site = payload.data.site;
        setSettings(site);
        setCategories(payload.data.categories);
        setForm({ name: site.name, description: site.description, categoryId: site.categoryId ?? payload.data.categories[0]?.id ?? "", tags: site.tags.join(", "), logoUrl: site.logoUrl ?? "", faviconUrl: site.faviconUrl ?? "", permittedAliases: site.permittedAliases.join(", "), publicRevenueVisible: site.publicRevenueVisible, publicPageMetricsVisible: site.publicPageMetricsVisible });
        setState("ready");
      })
      .catch((error: unknown) => { setMessage(error instanceof Error ? error.message : "The listing settings could not be loaded."); setState("error"); });
  }, [isDemo, siteId]);

  function update<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    setState((current) => current === "saved" ? "ready" : current);
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!settings) return;
    setState("saving");
    setMessage("");
    const response = await fetch(`/api/owner/sites/${siteId}/settings`, {
      method: "PATCH",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({
        ...form,
        tags: form.tags.split(",").map((tag) => tag.trim()).filter(Boolean),
        permittedAliases: form.permittedAliases.split(",").map((alias) => alias.trim()).filter(Boolean),
        logoUrl: form.logoUrl.trim() || null,
        faviconUrl: form.faviconUrl.trim() || null,
        expectedUpdatedAt: settings.updatedAt,
        turnstileToken: token,
      }),
    });
    const payload = await response.json().catch(() => null) as { data?: { updatedAt: string }; error?: { message?: string } } | null;
    if (!response.ok || !payload?.data) { setMessage(payload?.error?.message ?? "The listing settings could not be saved."); setState("error"); return; }
    setSettings((current) => current ? { ...current, updatedAt: payload.data!.updatedAt, name: form.name, description: form.description, categoryId: form.categoryId, logoUrl: form.logoUrl.trim() || null, faviconUrl: form.faviconUrl.trim() || null, publicRevenueVisible: form.publicRevenueVisible, publicPageMetricsVisible: form.publicPageMetricsVisible, tags: form.tags.split(",").map((tag) => tag.trim()).filter(Boolean), permittedAliases: form.permittedAliases.split(",").map((alias) => alias.trim()).filter(Boolean) } : current);
    setState("saved");
    setMessage("Listing settings saved and recorded in the audit log.");
  }

  if (isDemo) return <div className="panel"><div className="dashboard-alert"><ShieldCheck size={16} /><span>{message}</span></div></div>;
  if (state === "loading") return <div className="panel"><LoaderCircle className="spin" size={18} /> Loading listing settings…</div>;
  return <form className="panel" onSubmit={save}><div className="panel-heading"><div><h2>Listing editor</h2><p>Edit public metadata without changing organic metrics or provider records.</p></div><ShieldCheck size={17} color="#2f8b62" /></div><div className="form-grid"><label className="field-label">Name<input value={form.name} onChange={(event) => update("name", event.target.value)} maxLength={160} required /></label><label className="field-label">Category<select value={form.categoryId} onChange={(event) => update("categoryId", event.target.value)} required>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label></div><label className="field-label">Description<textarea value={form.description} onChange={(event) => update("description", event.target.value)} maxLength={320} rows={4} /></label><div className="form-grid"><label className="field-label">Tags <span>(comma separated)</span><input value={form.tags} onChange={(event) => update("tags", event.target.value)} placeholder="launches, planning, AI" /></label><label className="field-label">Permitted aliases <span>(comma separated domains)</span><input value={form.permittedAliases} onChange={(event) => update("permittedAliases", event.target.value)} placeholder="www.example.com" /></label></div><div className="form-grid"><label className="field-label">Logo override <span>(HTTPS)</span><input value={form.logoUrl} onChange={(event) => update("logoUrl", event.target.value)} type="url" placeholder="https://…" /></label><label className="field-label">Favicon override <span>(HTTPS)</span><input value={form.faviconUrl} onChange={(event) => update("faviconUrl", event.target.value)} type="url" placeholder="https://…" /></label></div><div className="dashboard-list"><label className="dashboard-list-row"><span><strong>Public revenue disclosure</strong><small>Show provider-confirmed revenue on public boards when the provider permits it.</small></span><input type="checkbox" checked={form.publicRevenueVisible} onChange={(event) => update("publicRevenueVisible", event.target.checked)} /></label><label className="dashboard-list-row"><span><strong>Public page metrics</strong><small>Show path-level aggregates on the public profile.</small></span><input type="checkbox" checked={form.publicPageMetricsVisible} onChange={(event) => update("publicPageMetricsVisible", event.target.checked)} /></label></div><TurnstileField siteKey={turnstileSiteKey} action="site-settings" onToken={setToken} />{message ? <p className={`form-message ${state === "error" ? "form-error" : "form-success"}`} role="status">{state === "saved" ? <Check size={15} /> : null}{message}</p> : null}<button className="button button-coral" type="submit" disabled={state === "saving" || !settings}><Save size={15} /> {state === "saving" ? "Saving…" : "Save listing"}</button></form>;
}
