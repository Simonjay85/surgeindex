import { getServerEnv } from "@surge/config";
import { requirePageAdmin } from "../../lib/server/authorization";
import { AdminModerationClient } from "../../components/admin-moderation-client";

export const metadata = { title: "Admin moderation" };

export default async function AdminPage() {
  const user = await requirePageAdmin();
  return <AdminModerationClient isDemo={getServerEnv().DATA_PROVIDER === "demo"} userName={user.name} />;
}
