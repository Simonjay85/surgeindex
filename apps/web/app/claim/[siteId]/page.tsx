import Link from "next/link";
import { Check, Info, ShieldCheck } from "lucide-react";
import { notFound } from "next/navigation";
import { AppShell, Breadcrumbs, DataModeBadge, SourceBadge } from "../../../components/app-shell";
import { ClaimClient } from "../../../components/claim-client";
import { getPublicDataProvider } from "../../../lib/server/public-provider";
import { getServerEnv } from "@surge/config";

export default async function ClaimPage({ params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await params;
  const provider = getPublicDataProvider();
  const site = await provider.getSiteById(siteId);
  if (!site || site.status !== "active") notFound();
  const isDemo = provider.source === "demo";
  const env = getServerEnv();
  return <AppShell><div className="container page-hero"><Breadcrumbs items={[{ label: "Live", href: "/" }, { label: site.name, href: `/site/${site.slug}` }, { label: "Claim" }]} /><div className="page-hero-grid"><div><div className="eyebrow">OWNERSHIP VERIFICATION</div><h1>Claim {site.name}.</h1><p>Ownership lets you update the listing and connect a data source. It does not automatically make traffic verified.</p></div><div className="page-hero-aside"><span>current listing status</span><strong>{site.ownership === "claimed" ? "Claimed" : "Unclaimed"}</strong><SourceBadge source={site.verification === "unverified" ? "unverified" : site.verification} compact /><DataModeBadge isDemo={isDemo} compact /></div></div><div className="section-tight"><div className="profile-columns"><ClaimClient siteId={site.siteId} domain={site.domain} isDemo={isDemo} turnstileSiteKey={env.TURNSTILE_SITE_KEY} /><div className="panel"><div className="panel-heading"><div><h2>What changes after claiming?</h2><p>Clear boundaries keep the directory credible.</p></div></div><div className="dashboard-list"><div className="dashboard-list-row"><div><strong>Listing edits</strong><span>Title, description, category, tags</span></div><Check size={17} color="#2f8b62" /></div><div className="dashboard-list-row"><div><strong>Traffic connection</strong><span>Separate step after ownership</span></div><Check size={17} color="#2f8b62" /></div><div className="dashboard-list-row"><div><strong>Organic rank</strong><span>Never purchasable, never guaranteed</span></div><ShieldCheck size={17} color="#2f8b62" /></div></div><Link className="button button-dark" style={{ marginTop: 22 }} href={`/auth/sign-in?next=/claim/${site.siteId}`}>Sign in to continue</Link></div></div></div><div className="method-note"><Info size={14} /> {isDemo ? "Demo mode shows the verification architecture without mutating a real domain." : "Production validates the proof server-side, records expiry and attempts, and commits the owner relation transactionally."}</div></div></AppShell>;
}
