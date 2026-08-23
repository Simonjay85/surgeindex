import Link from "next/link";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { AppShell } from "../../../../components/app-shell";
import { DashboardShell, DashboardTopline } from "../../../../components/dashboard-shell";
import { requirePageUser } from "../../../../lib/server/authorization";

export const metadata = { title: "Create Boost campaign" };

export default async function NewBoostPage() {
  await requirePageUser();
  return <AppShell><DashboardShell active="/dashboard/boosts"><DashboardTopline title="Create a Boost campaign" description="Choose an owned site, placement, server package, and reviewed creative." action={<Link className="text-link" href="/dashboard/boosts"><ArrowLeft size={14} /> Back to campaigns</Link>} /><div className="panel"><div className="panel-heading"><div><h2>Start in the campaign workspace</h2><p>The current flow keeps the full draft, reservation, moderation, and Checkout sequence in one auditable surface.</p></div><ShieldCheck size={18} color="#2f8b62" /></div><Link className="button button-coral" href="/dashboard/boosts">Open campaign builder</Link></div></DashboardShell></AppShell>;
}
