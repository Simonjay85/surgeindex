import { notFound } from "next/navigation";
import { getServerEnv } from "@surge/config";
import { BadgeClient } from "../../../../../components/badge-client";
import { requirePageUser } from "../../../../../lib/server/authorization";
import { getPublicDataProvider } from "../../../../../lib/server/public-provider";

export default async function BadgePage({ params }: { params: Promise<{ siteId: string }> }) {
  const user = await requirePageUser();
  const { siteId } = await params;
  const site = await getPublicDataProvider().getOwnedSite(user.id, siteId);
  if (!site) notFound();
  return <BadgeClient site={site} publicBaseUrl={getServerEnv().NEXT_PUBLIC_APP_URL} />;
}
