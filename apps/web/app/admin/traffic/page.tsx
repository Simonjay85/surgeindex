import Link from "next/link";
import { Activity, ArrowLeft, Database, Radio, ServerCrash } from "lucide-react";
import { getServerEnv } from "@surge/config";
import { AppShell, DataModeBadge } from "../../../components/app-shell";
import { DashboardShell, DashboardTopline } from "../../../components/dashboard-shell";
import { requirePageAdmin } from "../../../lib/server/authorization";
import { getTrafficOperationalSummary } from "../../../lib/server/traffic-aggregation";

export const metadata = { title: "Traffic operations" };

export default async function TrafficOperationsPage() {
  const user = await requirePageAdmin();
  const isDemo = getServerEnv().APP_MODE === "demo";
  const summary = isDemo ? { eventsReceived: 0, eventsAccepted: 0, eventsRejected: 0, suspectedEvents: 0, ingestionFailures: 0, connectedSites: 0, staleTrackers: 0, queueLagSeconds: null, realtime: "local", lastAcceptedEventAt: null } : await getTrafficOperationalSummary();
  const cards = [["Events received", summary.eventsReceived], ["Events accepted", summary.eventsAccepted], ["Events rejected", summary.eventsRejected], ["Suspected / review", summary.suspectedEvents], ["Connected sites", summary.connectedSites], ["Stale trackers", summary.staleTrackers], ["Ingestion failures", summary.ingestionFailures], ["Queue lag", summary.queueLagSeconds == null ? "—" : `${summary.queueLagSeconds}s`]];
  return <AppShell><DashboardShell><DashboardTopline title="Traffic operations" description={`Collector health · ${user.name}`} action={<Link className="text-link" href="/admin"><ArrowLeft size={14} /> Moderation</Link>} />{isDemo ? <div className="demo-ribbon dashboard-notice"><DataModeBadge isDemo compact /> <span>Demo mode intentionally has no production event traffic.</span></div> : null}<div className="section-tight"><div className="dashboard-grid">{cards.map(([label, value]) => <div className="dashboard-card" key={String(label)}><small>{label}</small><strong>{value}</strong><p>last 24 hours</p></div>)}</div></div><div className="section-tight"><div className="profile-columns"><div className="panel"><div className="panel-heading"><div><h2>Provider state</h2><p>Explicit environment selection; no silent fallback.</p></div><Database size={17} /></div><div className="dashboard-list"><div className="dashboard-list-row"><div><strong>Queue</strong><span>{getServerEnv().QUEUE_PROVIDER}</span></div><Activity size={15} /></div><div className="dashboard-list-row"><div><strong>Analytics</strong><span>{getServerEnv().ANALYTICS_PROVIDER}</span></div><Database size={15} /></div><div className="dashboard-list-row"><div><strong>Realtime</strong><span>{summary.realtime}</span></div><Radio size={15} /></div><div className="dashboard-list-row"><div><strong>Last accepted event</strong><span>{summary.lastAcceptedEventAt ? new Date(summary.lastAcceptedEventAt).toLocaleString() : "None"}</span></div><Activity size={15} /></div></div></div><div className="panel"><div className="panel-heading"><div><h2>Failure boundary</h2><p>Invalid and suspected events are excluded from public aggregates.</p></div><ServerCrash size={17} color="#bc7628" /></div><div className="dashboard-alert"><ServerCrash size={15} /><span>Raw IPs and raw browser IDs are not persisted. Queue and provider failures are recorded for operator review.</span></div></div></div></div></DashboardShell></AppShell>;
}

