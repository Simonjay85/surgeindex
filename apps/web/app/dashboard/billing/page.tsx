import Link from "next/link";
import { CreditCard, FileText, ShieldCheck } from "lucide-react";
import { AppShell } from "../../../components/app-shell";
import { DashboardShell, DashboardTopline, DemoNotice } from "../../../components/dashboard-shell";

export const metadata = { title: "Billing" };

export default function BillingPage() {
  return <AppShell><DashboardShell active="/dashboard/billing"><DashboardTopline title="Billing" description="Payment architecture is present, with mock receipts in demo mode." action={<Link className="button button-quiet" href="/pricing">View pricing</Link>} /><DemoNotice>Nothing is charged in this preview.</DemoNotice><div className="section-tight"><div className="profile-columns"><div className="panel"><div className="panel-heading"><div><h2>Payment method</h2><p>Stripe Checkout is the production adapter.</p></div><CreditCard size={18} color="#3977bd" /></div><div className="dashboard-alert"><ShieldCheck size={16} /><span>No payment method is stored in demo mode. Production secrets remain server-side.</span></div></div><div className="panel"><div className="panel-heading"><div><h2>Receipts</h2><p>Demo payment records.</p></div><FileText size={17} /></div><div className="dashboard-list"><div className="dashboard-list-row"><div><strong>PixelForge boost</strong><span>Mock receipt · #demo_8J2D</span></div><span className="status-chip status-active">succeeded</span></div><div className="dashboard-list-row"><div><strong>ShopSignal boost</strong><span>Awaiting scheduled activation</span></div><span className="status-chip status-scheduled">pending</span></div></div></div></div></div></DashboardShell></AppShell>;
}
