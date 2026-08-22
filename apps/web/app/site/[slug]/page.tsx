import { notFound } from "next/navigation";
import { AppShell } from "../../../components/app-shell";
import { SiteProfile } from "../../../components/site-profile";
import { getSite } from "../../../lib/demo-data";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const site = getSite(slug);
  return { title: site ? `${site.name} — ${site.domain}` : "Site profile", description: site?.description };
}

export default async function SitePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const site = getSite(slug);
  if (!site) notFound();
  return <AppShell><SiteProfile site={site} /></AppShell>;
}
