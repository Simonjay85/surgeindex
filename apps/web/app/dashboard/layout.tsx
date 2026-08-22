import { requirePageUser } from "../../lib/server/authorization";

/** Every owner surface is protected at the route-tree boundary. */
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  await requirePageUser();
  return children;
}
