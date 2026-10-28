import type { Metadata } from "next";
import { getServerEnv } from "@surge/config";
import { notFound } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { AppShell } from "../../../components/app-shell";
import { DashboardShell, DashboardTopline } from "../../../components/dashboard-shell";
import { FanwardProfileForm } from "../../../components/fanward-profile-form";
import { ResendVerificationForm } from "../../../components/password-recovery-form";
import { requirePageUser } from "../../../lib/server/authorization";
import { getFanwardOwnerWorkspace } from "../../../lib/server/fanward-service";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Creator profile", robots: { index: false, follow: false } };

export default async function FanwardOwnerPage() {
  if (!getServerEnv().FEATURE_CREATORS) notFound();
  const user = await requirePageUser("/dashboard/fanward");
  const env = getServerEnv();
  if (!user.emailVerified) {
    return <AppShell><DashboardShell active="/dashboard/fanward"><DashboardTopline title="Creator profile" description="A verified account is required before a creator profile can be created or submitted." /><div className="panel verification-required" role="status"><div className="panel-heading"><div><h2>Verify your email before editing Fanward.</h2><p>Profile drafts and moderation submissions stay tied to a verified owner account. Check your inbox, then return here to continue.</p></div><ShieldCheck size={18} color="#24704d" /></div><ResendVerificationForm turnstileSiteKey={env.TURNSTILE_SITE_KEY} initialEmail={user.email} /></div></DashboardShell></AppShell>;
  }
  const workspace = await getFanwardOwnerWorkspace(user.id);
  return <AppShell><DashboardShell active="/dashboard/fanward"><DashboardTopline title="Creator profile" description="Create and moderate the public identity attached to one verified site. Profile text and site-derived scoring remain separate." /><FanwardProfileForm initialWorkspace={workspace} turnstileRequired={env.TURNSTILE_REQUIRED} turnstileSiteKey={env.TURNSTILE_SITE_KEY} /></DashboardShell></AppShell>;
}
