"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowLeft, BadgeCheck, Check, Copy, ExternalLink, Info } from "lucide-react";
import type { DemoSite } from "../lib/demo-data";
import { AppShell, DataModeBadge } from "./app-shell";
import { DashboardShell, DashboardTopline, DemoNotice } from "./dashboard-shell";

function escapeAttribute(value: string): string {
  return value.replace(/[&<>\"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" })[character] ?? character);
}

export function BadgeClient({ site, publicBaseUrl }: { site: DemoSite; publicBaseUrl: string }) {
  const [copied, setCopied] = useState(false);
  const isDemo = site.isDemo;
  const publicProfile = `${publicBaseUrl.replace(/\/$/, "")}/site/${site.slug}`;
  const badgeUrl = `${publicBaseUrl.replace(/\/$/, "")}/api/badges/${site.slug}`;
  const badgeTitle = site.rank > 0 ? `#${site.rank} Trending in ${site.categoryName}` : `Listed in ${site.categoryName} on SurgeIndex`;
  const embed = `<a href="${escapeAttribute(publicProfile)}" rel="noreferrer"><img src="${escapeAttribute(badgeUrl)}" alt="${escapeAttribute(badgeTitle)}" /></a>`;

  async function copyEmbed() {
    await navigator.clipboard?.writeText(embed);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  return <AppShell><DashboardShell active="/dashboard/sites"><DashboardTopline title="Profile badge" description={`${site.name} · a safe link back to the public profile`} action={<Link className="text-link" href={`/dashboard/sites/${site.siteId}`}><ArrowLeft size={14} /> Site overview</Link>} />{isDemo ? <DemoNotice>Demo badge content is generated from deterministic fixture data.</DemoNotice> : <div className="demo-ribbon dashboard-notice"><DataModeBadge isDemo={false} compact /> <span>Badge content is generated from the persisted public profile only.</span></div>}{site.status !== "active" ? <div className="section-tight"><div className="empty-state"><BadgeCheck size={18} /><h3>Badge unavailable until approval</h3><p>This site is currently {site.status}. A public badge is only generated for an active public profile.</p></div></div> : <div className="section-tight"><div className="profile-columns"><div className="panel"><div className="panel-heading"><div><h2>Preview</h2><p>{site.rank > 0 ? "Current public rank and category." : "The profile is public, but no persisted rank snapshot exists yet."}</p></div><BadgeCheck size={18} color="#3977bd" /></div><div style={{ display: "grid", gap: 13 }}><div style={{ padding: 22, border: "1px solid var(--border)", borderRadius: 15, background: "#fff" }}><div className="source-badge source-coral" style={{ fontSize: 13, padding: "8px 10px" }}><span className="source-dot" /> {badgeTitle}</div></div><div style={{ padding: 22, borderRadius: 15, background: "var(--foreground)" }}><div className="source-badge source-coral" style={{ fontSize: 13, padding: "8px 10px" }}><span className="source-dot" /> {badgeTitle}</div></div><div><DataModeBadge isDemo={isDemo} compact /></div></div></div><div className="panel"><div className="panel-heading"><div><h2>Embed code</h2><p>Text is generated from safe site fields and HTML-escaped.</p></div></div><pre className="code-panel"><code>{embed}</code></pre><div className="copy-row"><button className="button button-dark button-small" onClick={() => void copyEmbed()}>{copied ? <Check size={14} /> : <Copy size={14} />} {copied ? "Copied" : "Copy HTML"}</button><a className="button button-quiet button-small" href={badgeUrl} target="_blank" rel="noreferrer">Open SVG <ExternalLink size={13} /></a></div><div className="method-note"><Info size={14} /> The badge links to the public profile and does not expose internal IDs or private dashboard state.</div></div></div></div>}</DashboardShell></AppShell>;
}
