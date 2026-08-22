import { notFound } from "next/navigation";
import { VerificationClient } from "../../../../../components/verification-client";
import { requirePageUser } from "../../../../../lib/server/authorization";
import { getPublicDataProvider } from "../../../../../lib/server/public-provider";

export default async function VerificationPage({ params }: { params: Promise<{ siteId: string }> }) {
  const user = await requirePageUser();
  const { siteId } = await params;
  const site = await getPublicDataProvider().getOwnedSite(user.id, siteId);
  if (!site) notFound();
  return <VerificationClient site={site} />;
}
