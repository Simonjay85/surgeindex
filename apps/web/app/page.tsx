import type { Metadata } from "next";
import { AppShell } from "../components/app-shell";
import { HomeClient } from "../components/home-client";
import { getPublicDataProvider } from "../lib/server/public-provider";
import { getServerEnv } from "@surge/config";

export const metadata: Metadata = {
  alternates: { canonical: "/" },
  openGraph: {
    title: "SurgeIndex — the live leaderboard of internet attention",
    description: "Earn the rank. Buy the reach.",
    type: "website",
    url: "/",
  },
};

export default async function HomePage({ searchParams }: { searchParams: Promise<{ window?: string; category?: string; q?: string }> }) {
  const params = await searchParams;
  const activeWindow = params.window ?? "live";
  const activeCategory = params.category ?? "all";
  const query = params.q ?? "";
  const provider = getPublicDataProvider();
  const env = getServerEnv();
  const [sites, categories] = await Promise.all([
    provider.getLeaderboard({ window: activeWindow, category: activeCategory, query, limit: 12 }),
    provider.getCategories(),
  ]);
  const heroPulse = sites[0] ? await provider.getTimeseries(sites[0].slug, "visitors") : [];
  return <AppShell><HomeClient key={`${activeWindow}:${activeCategory}:${query}`} initialSites={sites} heroPulse={heroPulse} categories={categories} isDemo={provider.source === "demo"} initialWindow={activeWindow} initialCategory={activeCategory} initialQuery={query} turnstileSiteKey={env.TURNSTILE_SITE_KEY} /></AppShell>;
}
