import Link from "next/link";
import { CreditCard, Gauge, LayoutDashboard, Settings, Sparkles, Target, Wrench } from "lucide-react";
import { SignOutButton } from "./sign-out-button";

const nav = [
  ["Overview", "/dashboard", LayoutDashboard],
  ["My sites", "/dashboard/sites", Gauge],
  ["Boost campaigns", "/dashboard/boosts", Target],
  ["Billing", "/dashboard/billing", CreditCard],
  ["Settings", "/dashboard/settings", Settings],
] as const;

export function DashboardShell({ children, active = "/dashboard" }: { children: React.ReactNode; active?: string }) {
  return <div className="container page-hero"><div className="dashboard-layout"><aside className="dashboard-sidebar"><span className="dashboard-sidebar-label">Workspace</span>{nav.map(([label, href, Icon]) => <Link className={active === href ? "active" : ""} key={href} href={href}><Icon size={15} />{label}</Link>)}<span className="dashboard-sidebar-label">Operations</span><Link href="/admin"><Wrench size={15} />Admin panel</Link><SignOutButton /></aside><section className="dashboard-main">{children}</section></div></div>;
}

export function DashboardTopline({ title, description, action }: { title: string; description: string; action?: React.ReactNode }) {
  return <div className="dashboard-topline"><div><h1>{title}</h1><p>{description}</p></div>{action}</div>;
}

export function DemoNotice({ children = "Owner dashboard is shown with demo workspace data." }: { children?: React.ReactNode }) {
  return <div className="demo-ribbon dashboard-notice"><Sparkles size={13} /> <strong>Demo workspace</strong> · {children}</div>;
}
