import Link from "next/link";
import { ArrowRight, Check, CreditCard } from "lucide-react";
import { getServerEnv } from "@surge/config";
import { AppShell, SectionHeading } from "../../components/app-shell";
import { listBoostPackages } from "../../lib/server/boost-config";
import { stripeTestModeStatus } from "../../lib/server/stripe-service";

export const metadata = { title: "Pricing" };
export const dynamic = "force-dynamic";

export default function PricingPage() {
  const env = getServerEnv();
  if (!env.NEXT_PUBLIC_COMMERCIAL_ENABLED) {
    return <AppShell><div className="container page-hero"><div className="page-hero-grid"><div><div className="eyebrow">PUBLIC FREE</div><h1>Listing and organic ranking are free.</h1><p>There is no paid plan in the current release. Stripe Checkout, Boost packages, billing, and sponsored placements remain disabled until a separate commercial review is complete.</p></div><div className="page-hero-aside"><span>current price</span><strong>$0</strong><span className="status-chip status-active">No payment required</span></div></div><div className="section-tight"><div className="signal-principle"><div><div className="eyebrow">WHAT IS OPEN</div><h2>Submit, claim, verify, and earn organic visibility.</h2></div><div className="signal-principle-copy"><p>Traffic provenance and ranking rules are the same for every listed site. Payment cannot change Heat Score, rank, or breakout eligibility.</p><Link className="button button-coral" href="/submit">List your site <ArrowRight size={15} /></Link></div></div></div></div></AppShell>;
  }
  const payment = stripeTestModeStatus();
  const checkoutReady = Boolean(
    payment.configured &&
    env.BOOST_ENABLED &&
    env.STRIPE_ENABLED &&
    env.STRIPE_CHECKOUT_SUCCESS_URL &&
    env.STRIPE_CHECKOUT_CANCEL_URL &&
    env.BOOST_STARTER_PRICE_ID &&
    env.BOOST_GROWTH_PRICE_ID &&
    env.BOOST_LAUNCH_PRICE_ID,
  );
  const packages = listBoostPackages().filter((plan) => plan.active && plan.amountCents != null && plan.targetQualifiedImpressions != null);
  return <AppShell><div className="container page-hero"><div className="page-hero-grid"><div><div className="eyebrow">SIMPLE WAYS TO SHOW UP</div><h1>Free to be found. Clear when you pay.</h1><p>Listing and organic ranking stay open. Boost packages buy transparent distribution and never change organic rank.</p></div><div className="page-hero-aside"><span>campaign status</span><strong>{checkoutReady ? "Checkout configured" : "Drafts live"}</strong><span className={`status-chip ${checkoutReady ? "status-active" : "status-scheduled"}`}>{checkoutReady ? `Stripe ${payment.environment} mode` : "Payment gate off"}</span></div></div><div className="section-tight"><SectionHeading title="Boost packages" description="Package prices and qualified-impression targets come from the production campaign configuration. Activation still requires server-confirmed payment and creative approval." /><div className="pricing-grid">{packages.map((plan) => <article className={`price-card ${plan.id === "growth" ? "price-card-popular" : ""}`} key={plan.id}><h2>{plan.name}</h2><p>{plan.description}</p><div className="price">{new Intl.NumberFormat("en-US", { style: "currency", currency: plan.currency, maximumFractionDigits: 0 }).format(plan.amountCents! / 100)}<small> / campaign</small></div><ul className="price-list"><li><Check size={15} /> {plan.targetQualifiedImpressions!.toLocaleString()} qualified impressions target</li><li><Check size={15} /> Organic rank and Heat Score unchanged</li><li><Check size={15} /> Valid click and tracker-attribution reporting</li><li><Check size={15} /> Availability is forecast, not guaranteed</li></ul><Link className={`button ${plan.id === "growth" ? "button-coral" : "button-quiet"}`} href="/dashboard/boosts">Create a campaign draft <ArrowRight size={15} /></Link></article>)}</div><p className="pricing-note"><CreditCard size={13} /> {checkoutReady ? `Checkout uses the configured Stripe ${payment.environment} environment; campaign activation requires a verified webhook.` : "Campaign drafts and inventory reservations are persistent. Checkout remains closed until Stripe credentials, price IDs, tax, refund, and legal policy are approved."}</p></div><div className="section-tight"><div className="signal-principle"><div><div className="eyebrow">FREE, ALWAYS</div><h2>Organic visibility is not a paid tier.</h2></div><div className="signal-principle-copy"><p>Submit a site, connect a source, and let its attention signals do the work. A Boost buys reach, not rank, verification, breakout status, clicks, leads, sales, or conversions.</p><Link className="button button-coral" href="/submit">List your site <ArrowRight size={15} /></Link></div></div></div></div></AppShell>;
}
