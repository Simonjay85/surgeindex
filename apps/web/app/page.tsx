import { AppShell } from "../components/app-shell";
import { HomeClient } from "../components/home-client";
import { getPublicDataProvider } from "../lib/server/public-provider";

export default async function HomePage({ searchParams }: { searchParams: Promise<{ window?: string; category?: string; q?: string }> }) {
  const params = await searchParams;
  const activeWindow = params.window ?? "live";
  const activeCategory = params.category ?? "all";
  const query = params.q ?? "";
  const provider = getPublicDataProvider();
  const [sites, categories] = await Promise.all([
    provider.getLeaderboard({ window: activeWindow, category: activeCategory, query, limit: 3 }),
    provider.getCategories(),
  ]);
  return <AppShell><HomeClient initialSites={sites} categories={categories} isDemo={provider.source === "demo"} initialWindow={activeWindow} initialCategory={activeCategory} initialQuery={query} /></AppShell>;
}
