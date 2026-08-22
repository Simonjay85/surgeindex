import Link from "next/link";
import { BarChart3, BadgeCheck, CreditCard, Gauge, LayoutDashboard, Settings, ShieldCheck, Sparkles, Target, Wrench } from "lucide-react";

const nav = [
  ["Overview", "/dashboard", LayoutDashboard],
  ["My sites", "/dashboard/sites", Gauge],
  ["Boost campaigns", "/dashboard/boosts", Target],
  ["Billing", "/dashboard/billing", CreditCard],
  ["Settings", "/dashboard/settings", Settings],
] as const;

export function DashboardShell({ children, active = "/dashboard" }: { children: React.ReactNode; active?: string }) {
  return <div className="container page-hero"><div className="dashboard-layout"><aside className="dashboard-sidebar"><span className="dashboard-sidebar-label">Workspace</span>{nav.map(([label, href, Icon]) => <Link className={active === href ? "active" : ""} key={href} href={href}><Icon size={15} />{label}</Link>)}<span className="dashboard-sidebar-label">Site tools</span><Link href="/dashboard/sites/site-launchpilot/analytics"><BarChart3 size={15} />Analytics</Link><Link href="/dashboard/sites/site-launchpilot/verification"><ShieldCheck size={15} />Verification</Link><Link href="/dashboard/sites/site-launchpilot/badge"><BadgeCheck size={15} />Badge</Link><span className="dashboard-sidebar-label">Demo</span><Link href="/admin"><Wrench size={15} />Admin panel</Link></aside><section className="dashboard-main">{children}</section></div></div>;
}

export function DashboardTopline({ title, description, action }: { title: string; description: string; action?: React.ReactNode }) {
  return <div className="dashboard-topline"><div><h1>{title}</h1><p>{description}</p></div>{action}</div>;
}

export function DemoNotice({ children = "Owner dashboard is shown with demo workspace data." }: { children?: React.ReactNode }) {
  return <div className="demo-ribbon dashboard-notice"><Sparkles size={13} /> <strong>Demo workspace</strong> · {children}</div>;
}
