import Link from "next/link";
import { ArrowUpRight, ShieldCheck } from "lucide-react";
import type { PublicFanwardCreatorSummary } from "../lib/server/fanward-service";
import { SourceBadge } from "./app-shell";
import { SiteMark } from "./site-mark";

export const impactStateLabels = {
  unverified: "Traffic source not verified",
  building_baseline: "Building a verified baseline",
  provisional: "Provisional score",
  eligible: "Eligible score",
  stale: "Verified data is stale",
  suspended: "Scoring suspended",
  fraud_review: "Under integrity review",
  ineligible: "Not eligible for scoring",
} as const;

function scoreLabel(creator: PublicFanwardCreatorSummary) {
  return creator.impact.score === null
    ? impactStateLabels[creator.impact.state]
    : `${Math.round(creator.impact.score)} / 100`;
}

export function CreatorCard({ creator }: { creator: PublicFanwardCreatorSummary }) {
  const score = creator.impact.score;
  return <article className="creator-card">
    <div className="creator-card-head">
      <SiteMark site={creator.primarySite} size="default" />
      <div className="creator-card-identity">
        <h2><Link href={`/fanward/${creator.slug}`}>{creator.displayName}</Link></h2>
        <span>{creator.primarySite.domain}</span>
      </div>
      {creator.category ? <span className="category-chip">{creator.category.name}</span> : null}
    </div>
    <p className="creator-card-headline">{creator.headline}</p>
    {creator.bioExcerpt ? <p className="creator-card-bio">{creator.bioExcerpt}</p> : null}
    <div className="creator-card-signal">
      <div>
        <span>Site-derived Impact Score</span>
        <strong>{scoreLabel(creator)}</strong>
      </div>
      <div className="creator-card-meter" aria-hidden="true"><span style={{ width: `${Math.max(0, Math.min(100, score ?? 0))}%` }} /></div>
      <small>{score === null ? "No score is shown until the site evidence is eligible." : `${Math.round(creator.impact.confidence * 100)}% model confidence · ${impactStateLabels[creator.impact.state]}`}</small>
    </div>
    <div className="creator-card-footer">
      <span className="creator-verified-site"><ShieldCheck size={13} /> Verified primary site</span>
      <SourceBadge source={creator.primarySite.verification} compact />
      <Link className="text-link" href={`/fanward/${creator.slug}`}>View creator <ArrowUpRight size={14} /></Link>
    </div>
  </article>;
}
