import { count, eq, inArray } from "drizzle-orm";
import { CheckCircle2, CircleAlert, CreditCard, Database, ShieldAlert } from "lucide-react";
import { getServerEnv } from "@surge/config";
import { boostCampaign, boostDispute, boostInventoryReservation, boostOrder, getPostgresDb, processedWebhookEvent } from "@surge/db";
import { AppShell, DataModeBadge } from "../../../components/app-shell";
import { DashboardShell, DashboardTopline, DemoNotice } from "../../../components/dashboard-shell";
import { requirePageAdmin } from "../../../lib/server/authorization";

export const metadata = { title: "Boost operations" };

export default async function AdminBoostsPage() {
  await requirePageAdmin();
  const env = getServerEnv();
  if (!env.NEXT_PUBLIC_COMMERCIAL_ENABLED) {
    return <AppShell><DashboardShell active="/admin"><DashboardTopline title="Boost operations" description="Commercial operations are closed for the Public Free release." /><div className="section-tight"><div className="empty-state"><ShieldAlert size={22} /><h3>No paid operations are active</h3><p>Stripe, Boost delivery, reservations, disputes, and reconciliation remain disabled until a separate Commercial release passes its hard gates.</p></div></div></DashboardShell></AppShell>;
  }
  const demo = env.APP_MODE !== "production" || env.DATA_PROVIDER !== "postgres";
  const metrics = demo ? { campaigns: 0, pending: 0, active: 0, reservations: 0, disputes: 0, webhookFailures: 0 } : await (async () => {
    const db = getPostgresDb();
    const [campaigns] = await db.select({ value: count() }).from(boostCampaign);
    const [pending] = await db.select({ value: count() }).from(boostOrder).where(inArray(boostOrder.paymentStatus, ["pending", "processing"]));
    const [active] = await db.select({ value: count() }).from(boostCampaign).where(eq(boostCampaign.state, "active"));
    const [reservations] = await db.select({ value: count() }).from(boostInventoryReservation).where(inArray(boostInventoryReservation.status, ["held", "confirmed"]));
    const [disputes] = await db.select({ value: count() }).from(boostDispute).where(eq(boostDispute.status, "open"));
    const [webhookFailures] = await db.select({ value: count() }).from(processedWebhookEvent).where(eq(processedWebhookEvent.processingResult, "failed"));
    return { campaigns: Number(campaigns?.value ?? 0), pending: Number(pending?.value ?? 0), active: Number(active?.value ?? 0), reservations: Number(reservations?.value ?? 0), disputes: Number(disputes?.value ?? 0), webhookFailures: Number(webhookFailures?.value ?? 0) };
  })();
  return <AppShell><DashboardShell active="/admin"><DashboardTopline title="Boost operations" description="Paid delivery, payment, inventory, and moderation health. Organic Heat Score and rank are outside this console." />{demo ? <DemoNotice>Demo operations are empty; no fake production campaigns or payments are created.</DemoNotice> : <div className="demo-ribbon dashboard-notice"><DataModeBadge isDemo={false} compact /> <span>Environment-separated operational records.</span></div>}<div className="section-tight"><div className="dashboard-grid"><div className="dashboard-card"><small>Campaigns</small><strong>{metrics.campaigns}</strong><p><Database size={12} /> persisted records</p></div><div className="dashboard-card"><small>Pending payments</small><strong>{metrics.pending}</strong><p><CreditCard size={12} /> reconcile before activation</p></div><div className="dashboard-card"><small>Active delivery</small><strong>{metrics.active}</strong><p><CheckCircle2 size={12} /> eligible campaigns</p></div><div className="dashboard-card"><small>Held inventory</small><strong>{metrics.reservations}</strong><p><Database size={12} /> expires safely</p></div></div></div><div className="section-tight"><div className="profile-columns"><div className="panel"><div className="panel-heading"><div><h2>Review queues</h2><p>Every admin action requires a reason and audit request ID.</p></div><ShieldAlert size={17} color="#bc7628" /></div><div className="dashboard-list"><div className="dashboard-list-row"><div><strong>Open disputes</strong><span>Active delivery must remain paused pending review.</span></div><strong>{metrics.disputes}</strong></div><div className="dashboard-list-row"><div><strong>Failed webhooks</strong><span>Provider event ledger rows requiring reconciliation.</span></div><strong>{metrics.webhookFailures}</strong></div></div></div><div className="panel"><div className="panel-heading"><div><h2>Product boundary</h2><p>Payment never edits organic scoring.</p></div><CircleAlert size={17} color="#3977bd" /></div><p style={{ color: "var(--foreground-muted)", fontSize: 12 }}>Admin may approve/reject creative, pause/suspend, extend, resolve underdelivery, reconcile payments, and request refunds. Admin cannot edit Heat Score, rank, breakout state, or source definitions.</p></div></div></div></DashboardShell></AppShell>;
}
