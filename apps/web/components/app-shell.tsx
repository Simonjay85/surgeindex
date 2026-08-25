import Link from "next/link";
import { ArrowUpRight, Menu, Search, Signal } from "lucide-react";

export const commercialUiEnabled = process.env.NEXT_PUBLIC_COMMERCIAL_ENABLED === "true";

export function SourceBadge({ source, compact = false }: { source: "tracker" | "ga4" | "surgeindex" | "sponsored" | "demo" | "unverified" | "radar"; compact?: boolean }) {
  const labels = { tracker: "Tracker Verified", ga4: "GA4 Verified", surgeindex: "SurgeIndex Referral", sponsored: "Sponsored", demo: "Demo Data", unverified: "Unverified", radar: "Cloudflare Radar" } as const;
  return <span className={`source-badge source-${source} ${compact ? "source-compact" : ""}`} title={source === "tracker" ? "Traffic is measured by the SurgeIndex first-party tracking script." : source === "ga4" ? "Traffic metrics are imported from a connected Google Analytics 4 property." : source === "sponsored" ? "This placement was purchased. It does not affect organic rank." : source === "demo" ? "This number is simulated for product demonstration." : source === "radar" ? "Internet-wide context is supplied by Cloudflare Radar." : undefined}><span className="source-dot" />{labels[source]}</span>;
}

export function DataModeBadge({ isDemo, compact = false }: { isDemo: boolean; compact?: boolean }) {
  return isDemo ? <SourceBadge source="demo" compact={compact} /> : <span className={`status-chip status-active ${compact ? "source-compact" : ""}`}>Production data</span>;
}

export function Header() {
  return (
    <header className="site-header">
      <div className="header-inner">
        <Link className="brand" href="/" aria-label="SurgeIndex home">
          <span className="brand-mark"><Signal size={17} strokeWidth={2.6} /></span>
          <span>SurgeIndex</span>
          <span className="live-tag"><span className="live-dot" /> live</span>
        </Link>
        <nav className="desktop-nav" aria-label="Primary navigation">
          <Link href="/">Live</Link>
          <Link href="/rankings">Rankings</Link>
          <Link href="/breakouts">Breakouts</Link>
          <Link href="/categories">Categories</Link>
          {commercialUiEnabled ? <Link className="nav-feature-active" href="/bid-the-moment">Bid the Moment</Link> : null}
          <Link href="/radar">Radar</Link>
          <Link href="/methodology">Methodology</Link>
          <span className="nav-divider" />
          <Link className="nav-future" href="/fanward">Fanward <span>preview</span></Link>
        </nav>
        <div className="header-actions">
          <Link className="icon-button" href="/search" aria-label="Search sites"><Search size={18} /></Link>
          <Link className="button button-coral button-small header-submit" href="/submit">Submit site <ArrowUpRight size={15} /></Link>
          <Link className="sign-in-link" href="/auth/sign-in">Sign in</Link>
          <Link className="mobile-menu icon-button" href="/dashboard" aria-label="Open account menu"><Menu size={19} /></Link>
        </div>
      </div>
    </header>
  );
}

export function Footer() {
  return (
    <footer className="site-footer">
      <div className="footer-top">
        <div>
          <Link className="brand footer-brand" href="/"><span className="brand-mark"><Signal size={16} /></span><span>SurgeIndex</span></Link>
          <p className="footer-note">The live leaderboard of internet attention.<br />{commercialUiEnabled ? "Earn the rank. Buy the reach." : "Earn attention. Keep the rank honest."}</p>
        </div>
        <div className="footer-links">
          <div><span className="footer-label">Explore</span><Link href="/rankings">Rankings</Link><Link href="/breakouts">Breakouts</Link><Link href="/categories">Categories</Link><Link href="/radar">Radar</Link></div>
          <div><span className="footer-label">Product</span>{commercialUiEnabled ? <Link href="/bid-the-moment">Bid the Moment</Link> : null}<Link href="/fanward">Fanward</Link>{commercialUiEnabled ? <Link href="/dashboard/boosts">Campaign dashboard</Link> : null}</div>
          <div><span className="footer-label">For site owners</span><Link href="/submit">Submit a site</Link><Link href="/dashboard">Dashboard</Link>{commercialUiEnabled ? <Link href="/boost">Boost exposure</Link> : null}</div>
          <div><span className="footer-label">Learn</span><Link href="/methodology">Methodology</Link>{commercialUiEnabled ? <Link href="/pricing">Pricing</Link> : null}<Link href="/privacy">Privacy</Link><Link href="/terms">Terms</Link></div>
        </div>
      </div>
      <div className="footer-bottom"><span>© 2026 SurgeIndex</span><span className="footer-demo-note"><Signal size={13} /> Every metric identifies its source</span><span>Built for attention, not vanity</span></div>
    </footer>
  );
}

export function AppShell({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <><Header /><main className={className}>{children}</main><Footer /></>;
}

export function SectionHeading({ eyebrow, title, description, action }: { eyebrow?: string; title: string; description?: string; action?: React.ReactNode }) {
  return <div className="section-heading"><div>{eyebrow ? <div className="eyebrow">{eyebrow}</div> : null}<h2>{title}</h2>{description ? <p>{description}</p> : null}</div>{action ? <div className="section-heading-action">{action}</div> : null}</div>;
}

export function Breadcrumbs({ items }: { items: Array<{ label: string; href?: string }> }) {
  return <nav className="breadcrumbs" aria-label="Breadcrumb">{items.map((item, index) => <span key={item.label}>{index > 0 ? <span className="breadcrumb-slash">/</span> : null}{item.href ? <Link href={item.href}>{item.label}</Link> : <span aria-current="page">{item.label}</span>}</span>)}</nav>;
}

export function StatBlock({ label, value, detail, tone = "default", source = "demo" }: { label: string; value: string; detail?: string; tone?: "default" | "coral" | "green"; source?: "tracker" | "ga4" | "surgeindex" | "sponsored" | "demo" | "unverified" | "radar" }) {
  return <div className={`stat-block stat-${tone}`}><span className="stat-label">{label}</span><strong>{value}</strong>{detail ? <span className="stat-detail">{detail}</span> : null}<SourceBadge source={source} compact /></div>;
}

export function EmptyState({ title, description, action }: { title: string; description: string; action?: React.ReactNode }) {
  return <div className="empty-state"><span className="empty-icon"><Signal size={18} /></span><h3>{title}</h3><p>{description}</p>{action}</div>;
}
