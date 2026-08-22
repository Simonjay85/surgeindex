import { Sparkles, Users2 } from "lucide-react";
import { AppShell } from "../../components/app-shell";
import { WaitlistForm } from "../../components/waitlist-form";

export const metadata = { title: "Creators — coming soon" };

export default function CreatorsPage() {
  return <AppShell><div className="container page-hero"><div className="waitlist-hero"><div><div className="eyebrow">COMING SOON · CREATOR SIGNALS</div><h1>Rank creators by measurable attention, not follower count.</h1><p>We’re designing a creator view around verified views, traffic driven, engagement quality, conversion impact, and an explainable Impact Score.</p><WaitlistForm topic="creator rankings" /></div><div className="waitlist-visual" aria-hidden="true"><span className="orbit orbit-one" /><span className="orbit orbit-two" /><span className="orbit orbit-three" /><span className="orbit-core"><Users2 size={22} /></span><span className="orbit-dot orbit-dot-a" /><span className="orbit-dot orbit-dot-b" /></div></div><div className="section-tight"><div className="methodology-callout"><strong><Sparkles size={17} /> A future lane, clearly marked.</strong><span>Creators is a waitlist surface in V1. No creator payouts, auctions, or marketplace claims are active in this build.</span></div></div></div></AppShell>;
}
