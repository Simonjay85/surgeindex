import { BriefcaseBusiness, Sparkles } from "lucide-react";
import { AppShell } from "../../components/app-shell";
import { WaitlistForm } from "../../components/waitlist-form";

export const metadata = { title: "Campaigns — coming soon" };

export default function CampaignsPage() {
  return <AppShell><div className="container page-hero"><div className="waitlist-hero"><div><div className="eyebrow">COMING SOON · CAMPAIGNS</div><h1>Buy measurable attention from verified websites and creators.</h1><p>Campaigns will connect a brief, a target audience, and transparent delivery without turning the organic board into ad inventory.</p><WaitlistForm topic="brand campaigns" /></div><div className="waitlist-visual" aria-hidden="true"><span className="orbit orbit-one" /><span className="orbit orbit-two" /><span className="orbit orbit-three" /><span className="orbit-core"><BriefcaseBusiness size={22} /></span><span className="orbit-dot orbit-dot-a" /><span className="orbit-dot orbit-dot-b" /></div></div><div className="section-tight"><div className="methodology-callout"><strong><Sparkles size={17} /> The boundary is the product.</strong><span>Campaigns are waitlist-only in V1. A future release may add briefs and creator impact, but it will not change how organic rank is earned.</span></div></div></div></AppShell>;
}
