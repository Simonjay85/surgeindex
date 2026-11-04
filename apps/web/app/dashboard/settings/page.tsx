import { AppShell } from "../../../components/app-shell";
import { DashboardShell, DashboardTopline } from "../../../components/dashboard-shell";
import { SettingsClient } from "../../../components/settings-client";
import { requirePageUser } from "../../../lib/server/authorization";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const user = await requirePageUser();

  return (
    <AppShell>
      <DashboardShell active="/dashboard/settings">
        <DashboardTopline title="Settings" description="Persistent account profile and security boundaries." />
        <SettingsClient initialName={user.name} email={user.email} isDemo={user.isDemo} />
      </DashboardShell>
    </AppShell>
  );
}
