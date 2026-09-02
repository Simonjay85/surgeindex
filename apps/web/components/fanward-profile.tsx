import Link from "next/link";
import { ArrowUpRight, CheckCircle2, ExternalLink, Info, ShieldCheck } from "lucide-react";
import type { PublicFanwardCreatorDetail } from "../lib/server/fanward-service";
import { Breadcrumbs, SourceBadge } from "./app-shell";
import { impactStateLabels } from "./creator-card";
import { SiteMark } from "./site-mark";

const componentLabels = {
  verifiedReach: "Verified reach",
  attentionMomentum: "Attention momentum",
  engagementQuality: "Engagement quality",
  trustConfidence: "Trust and confidence",
} as const;

function formatDate(value: string | null) {
  if (!value) return "Not recorded yet";
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return "Update time unavailable";
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(new Date(timestamp)) + " UTC";
}

function formatWeight(weight: number) {
  const normalized = weight <= 1 ? weight * 100 : weight;
  return `${Math.round(normalized)}% weight`;
}

export function FanwardProfile({ creator }: { creator: PublicFanwardCreatorDetail }) {
  const score = creator.impact.score;
  const components = Object.entries(creator.impact.components) as Array<[keyof typeof componentLabels, { score: number | null; available: boolean; configuredWeight: number; appliedWeight: number }]>;

  return <div className="container page-hero fanward-profile">
    <Breadcrumbs items={[{ label: "Fanward", href: "/fanward" }, ...(creator.category ? [{ label: creator.category.name, href: `/fanward?category=${encodeURIComponent(creator.category.slug)}` }] : []), { label: creator.displayName }]} />
    <div className="profile-head">
      <section className="profile-intro" aria-labelledby="creator-profile-title">
        <div className="profile-title">
          <SiteMark site={creator.primarySite} size="large" />
          <div><h1 id="creator-profile-title">{creator.displayName}</h1><p>{creator.headline}</p></div>
        </div>
        <p className="profile-copy fanward-profile-bio">{creator.bio}</p>
        <div className="profile-links">
          <Link className="button button-dark button-small" href={`/go/${creator.primarySite.slug}`} prefetch={false} target="_blank" rel="noreferrer">Visit verified site <ExternalLink size={14} /></Link>
          <Link className="text-link" href={`/site/${creator.primarySite.slug}`}>Open site profile <ArrowUpRight size={14} /></Link>
        </div>
        <div className="source-row fanward-profile-sources">
          <SourceBadge source={creator.primarySite.verification} />
          <span className="creator-verified-site"><ShieldCheck size={13} /> {creator.primarySite.domain}</span>
          {creator.category ? <span className="category-chip">{creator.category.name}</span> : null}
        </div>
      </section>
      <aside className="profile-score-card" aria-label="Fanward Impact Score">
        <div className="profile-score-head"><span>Site-derived Impact Score</span><span className={`status-chip fanward-state-${creator.impact.state}`}>{impactStateLabels[creator.impact.state]}</span></div>
        <div><div className="big-score">{score === null ? "—" : Math.round(score)}</div><span className="score-caption">{score === null ? "No public score in this evidence state" : `out of 100 · ${creator.impact.version}`}</span></div>
        <div className="profile-score-meter" aria-hidden="true"><span style={{ width: `${Math.max(0, Math.min(100, score ?? 0))}%` }} /></div>
        <div className="profile-score-footer">
          <div><strong>{Math.round(creator.impact.confidence * 100)}%</strong><small>confidence</small></div>
          <div><strong>{creator.impact.source.toUpperCase()}</strong><small>primary evidence</small></div>
          <div><strong>{creator.impact.sourceVersion ?? "—"}</strong><small>source version</small></div>
        </div>
      </aside>
    </div>

    <div className="section-tight profile-columns">
      <section className="panel" aria-labelledby="impact-breakdown-title">
        <div className="panel-heading"><div><h2 id="impact-breakdown-title">Impact breakdown</h2><p>Each component is calculated from the creator&apos;s approved, verified primary site. Unavailable evidence is excluded instead of estimated.</p></div><CheckCircle2 size={18} color="#24704d" /></div>
        <div className="score-breakdown">
          {components.map(([key, component]) => {
            const componentScore = component.available ? component.score : null;
            return <div className="breakdown-row" key={key}>
              <div><label><span>{componentLabels[key]}</span><strong>{component.available ? `${formatWeight(component.appliedWeight)} applied` : "Unavailable · 0% applied"}</strong></label><div className="breakdown-meter" aria-hidden="true"><span style={{ width: `${Math.max(0, Math.min(100, componentScore ?? 0))}%` }} /></div><small className="breakdown-weight-note">Configured {formatWeight(component.configuredWeight)}{component.available && component.appliedWeight !== component.configuredWeight ? " · normalized across available evidence" : ""}</small></div>
              <strong>{componentScore === null ? "—" : Math.round(componentScore)}</strong>
            </div>;
          })}
        </div>
      </section>
      <aside className="panel fanward-evidence-panel" aria-labelledby="impact-evidence-title">
        <div className="panel-heading"><div><h2 id="impact-evidence-title">Evidence boundary</h2><p>What this profile does and does not claim.</p></div><Info size={18} /></div>
        <dl className="fanward-facts">
          <div><dt>Primary site</dt><dd>{creator.primarySite.name} · {creator.primarySite.domain}</dd></div>
          <div><dt>Verification</dt><dd>{creator.primarySite.verification === "ga4" ? "Connected Google Analytics 4" : "SurgeIndex first-party tracker"}</dd></div>
          <div><dt>Score updated</dt><dd>{formatDate(creator.impact.updatedAt)}</dd></div>
          <div><dt>Profile published</dt><dd>{formatDate(creator.publishedAt)}</dd></div>
        </dl>
        <div className="method-note"><Info size={14} /> Fanward v1 does not report follower counts, creator payouts, paid performance, or claimed conversion totals. A score describes eligible site evidence, not a person&apos;s worth or popularity.</div>
      </aside>
    </div>
  </div>;
}
