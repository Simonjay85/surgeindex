import type { Metadata } from "next";
import { cache } from "react";
import { getServerEnv } from "@surge/config";
import { notFound } from "next/navigation";
import { AppShell } from "../../../components/app-shell";
import { FanwardProfile } from "../../../components/fanward-profile";
import { getPublicFanwardCreatorBySlug } from "../../../lib/server/fanward-service";

export const dynamic = "force-dynamic";

const loadCreator = cache((slug: string) => getPublicFanwardCreatorBySlug(slug));

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  if (!getServerEnv().FEATURE_CREATORS) return { title: "Fanward", robots: { index: false, follow: false } };
  const { slug } = await params;
  const creator = await loadCreator(slug);
  if (!creator) return { title: "Creator not found", robots: { index: false, follow: false } };
  return {
    title: `${creator.displayName} — Fanward`,
    description: creator.bioExcerpt || `${creator.displayName} on Fanward, backed by verified site evidence from ${creator.primarySite.domain}.`,
    alternates: { canonical: `/fanward/${creator.slug}` },
    robots: { index: true, follow: true },
    openGraph: { title: `${creator.displayName} — Fanward`, description: creator.bioExcerpt || creator.headline, type: "profile", url: `/fanward/${creator.slug}` },
  };
}

export default async function FanwardCreatorPage({ params }: { params: Promise<{ slug: string }> }) {
  if (!getServerEnv().FEATURE_CREATORS) notFound();
  const { slug } = await params;
  const creator = await loadCreator(slug);
  if (!creator) notFound();
  return <AppShell><FanwardProfile creator={creator} /></AppShell>;
}
