import { notFound } from "next/navigation";
import { AppShell } from "../../../components/app-shell";
import { SiteProfile } from "../../../components/site-profile";
import { getPublicDataProvider } from "../../../lib/server/public-provider";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const site = await getPublicDataProvider().getSite(slug);
  return { title: site ? `${site.name} — ${site.domain}` : "Site profile", description: site?.description };
}

export default async function SitePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const provider = getPublicDataProvider();
  const site = await provider.getSite(slug);
  if (!site) notFound();
  const [related, history, points, explanation] = await Promise.all([
    provider.getRelatedSites(slug),
    provider.getRankHistory(slug),
    provider.getTimeseries(slug, "visitors"),
    provider.getScoreExplanation(slug),
  ]);
  return <AppShell><SiteProfile site={site} related={related} history={history} points={points} explanation={explanation} /></AppShell>;
}
