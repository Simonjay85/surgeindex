import { CheckCircle2, CircleAlert, Database, KeyRound, RefreshCw } from "lucide-react";
import { getServerEnv } from "@surge/config";
import { AppShell } from "../../../components/app-shell";
import { DashboardShell, DashboardTopline } from "../../../components/dashboard-shell";
import { requirePageAdmin } from "../../../lib/server/authorization";
import { getGa4Operations } from "../../../lib/server/ga4-service";

export const metadata = { title: "GA4 operations" };

export default async function AdminGa4Page() {
  await requirePageAdmin();
  const demo = getServerEnv().APP_MODE !== "production" || getServerEnv().DATA_PROVIDER !== "postgres";
  const operations = demo ? { connections: [], backfills: [], quotaLimited: [], tokenVersions: [] } : await getGa4Operations();
  return <AppShell><DashboardShell active="/admin"><DashboardTopline title="GA4 operations" description="Connection health, backfill queues, quota state, and encryption versions." /><div className="dashboard-grid"><div className="dashboard-card"><small>Connections</small><strong>{operations.connections.length}</strong><p>Admin can see status, never plaintext tokens.</p></div><div className="dashboard-card"><small>Reauthorization / errors</small><strong>{operations.connections.filter((row) => ["reauthorization_required", "error", "degraded"].includes(row.state)).length}</strong><p>Last valid aggregates remain retained.</p></div><div className="dashboard-card"><small>Quota-limited</small><strong>{operations.quotaLimited.length}</strong><p>Core and Realtime are tracked separately.</p></div><div className="dashboard-card"><small>Token key versions</small><strong>{operations.tokenVersions.length || "—"}</strong><p><KeyRound size={13} /> Version metadata only.</p></div></div><div className="section-tight"><div className="panel"><div className="panel-heading"><div><h2>Connected properties</h2><p>Source switches remain explicit and audited; connecting GA4 does not change the primary ranking source.</p></div><Database size={17} /></div>{operations.connections.length ? <div className="dashboard-list">{operations.connections.map((row) => <div className="dashboard-list-row" key={row.id}><div><strong>{row.propertyName ?? row.propertyId}</strong><span>{row.siteId} · {row.state} · last sync {row.lastSyncAt ? new Date(row.lastSyncAt).toLocaleString() : "never"}</span></div>{row.rankingEligible ? <CheckCircle2 size={16} color="#2f8b62" /> : <CircleAlert size={16} color="#bc7628" />}</div>)}</div> : <div className="empty-state"><RefreshCw size={17} /><h3>{demo ? "Demo operations are empty" : "No GA4 connections"}</h3><p>Fixture and real-provider results are isolated by environment.</p></div>}</div></div></DashboardShell></AppShell>;
}
