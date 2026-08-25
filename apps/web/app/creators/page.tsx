import { Sparkles, Users2 } from "lucide-react";
import { AppShell } from "../../components/app-shell";
import { WaitlistForm } from "../../components/waitlist-form";
import { getServerEnv } from "@surge/config";

export const metadata = { title: "Fanward — coming soon", robots: { index: false, follow: false } };

export default function CreatorsPage() {
  const env = getServerEnv();
  return <AppShell><div className="container page-hero"><div className="waitlist-hero"><div><div className="eyebrow">COMING SOON · FANWARD</div><h1>Turn creator attention into a signal fans can trust.</h1><p>Fanward is the future community and creator lane: verified views, traffic driven, engagement quality, conversion impact, and an explainable Impact Score—not follower count alone.</p><WaitlistForm topic="fanward" turnstileSiteKey={env.TURNSTILE_SITE_KEY} /></div><div className="waitlist-visual" aria-hidden="true"><span className="orbit orbit-one" /><span className="orbit orbit-two" /><span className="orbit orbit-three" /><span className="orbit-core"><Users2 size={22} /></span><span className="orbit-dot orbit-dot-a" /><span className="orbit-dot orbit-dot-b" /></div></div><div className="section-tight"><div className="methodology-callout"><strong><Sparkles size={17} /> Fanward is clearly marked as a preview.</strong><span>The current build keeps creator discovery waitlist-only. No creator payouts, auctions, or marketplace claims are active yet.</span></div></div></div></AppShell>;
}
