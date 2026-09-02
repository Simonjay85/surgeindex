import type { Metadata } from "next";
import { getServerEnv } from "@surge/config";
import { notFound } from "next/navigation";
import { AdminFanwardClient } from "../../../components/admin-fanward-client";
import { AppShell } from "../../../components/app-shell";
import { DashboardShell, DashboardTopline } from "../../../components/dashboard-shell";
import { requirePageAdmin } from "../../../lib/server/authorization";
import { listFanwardAdminQueue } from "../../../lib/server/fanward-service";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Fanward moderation", robots: { index: false, follow: false } };

export default async function AdminFanwardPage() {
  if (!getServerEnv().FEATURE_CREATORS) notFound();
  const user = await requirePageAdmin();
  const queue = await listFanwardAdminQueue({});
  return <AppShell><DashboardShell active="/admin/fanward"><DashboardTopline title="Fanward moderation" description={`Review creator revisions, site eligibility, suspension, and restoration as ${user.name}. Every action requires a reason and confirmation.`} /><AdminFanwardClient initialQueue={queue} /></DashboardShell></AppShell>;
}
