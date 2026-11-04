import { getServerEnv } from "@surge/config";
import { AdminScoringClient } from "../../../components/admin-scoring-client";
import { requirePageAdmin } from "../../../lib/server/authorization";

export const metadata = { title: "Scoring operations" };

export default async function AdminScoringPage() {
  await requirePageAdmin();
  return <AdminScoringClient isDemo={getServerEnv().DATA_PROVIDER === "demo"} />;
}
