import Link from "next/link";
import { Activity, CreditCard, Gauge, LayoutDashboard, Settings, Sparkles, Target, UserRound, Wrench } from "lucide-react";
import { commercialUiEnabled, fanwardUiEnabled } from "./app-shell";
import { SignOutButton } from "./sign-out-button";

const nav = [
  ["Overview", "/dashboard", LayoutDashboard],
  ["My sites", "/dashboard/sites", Gauge],
  ...(fanwardUiEnabled ? [["Creator profile", "/dashboard/fanward", UserRound]] as const : []),
  ...(commercialUiEnabled ? [["Boost campaigns", "/dashboard/boosts", Target], ["Billing", "/dashboard/billing", CreditCard]] as const : []),
  ["Settings", "/dashboard/settings", Settings],
] as const;

export function DashboardShell({ children, active = "/dashboard" }: { children: React.ReactNode; active?: string }) {
  return <div className="container page-hero"><div className="dashboard-layout"><aside className="dashboard-sidebar"><span className="dashboard-sidebar-label">Workspace</span>{nav.map(([label, href, Icon]) => <Link aria-current={active === href ? "page" : undefined} className={active === href ? "active" : ""} key={href} href={href}><Icon size={15} />{label}</Link>)}<span className="dashboard-sidebar-label">Operations</span><Link aria-current={active === "/admin" ? "page" : undefined} className={active === "/admin" ? "active" : ""} href="/admin"><Wrench size={15} />Admin panel</Link>{fanwardUiEnabled ? <Link aria-current={active === "/admin/fanward" ? "page" : undefined} className={active === "/admin/fanward" ? "active" : ""} href="/admin/fanward"><UserRound size={15} />Fanward review</Link> : null}{commercialUiEnabled ? <Link className={active === "/admin/boosts" ? "active" : ""} href="/admin/boosts"><Target size={15} />Boost operations</Link> : null}<Link className={active === "/admin/scoring" ? "active" : ""} href="/admin/scoring"><Activity size={15} />Scoring health</Link><SignOutButton /></aside><section className="dashboard-main">{children}</section></div></div>;
}

export function DashboardTopline({ title, description, action }: { title: string; description: string; action?: React.ReactNode }) {
  return <div className="dashboard-topline"><div><h1>{title}</h1><p>{description}</p></div>{action}</div>;
}

export function DemoNotice({ children = "Owner dashboard is shown with demo workspace data." }: { children?: React.ReactNode }) {
  return <div className="demo-ribbon dashboard-notice"><Sparkles size={13} /> <strong>Demo workspace</strong> · {children}</div>;
}
