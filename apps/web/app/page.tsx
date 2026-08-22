import { AppShell } from "../components/app-shell";
import { HomeClient } from "../components/home-client";
import { getCategories, getLeaderboard } from "../lib/demo-data";

export default async function HomePage({ searchParams }: { searchParams: Promise<{ window?: string; category?: string; q?: string }> }) {
  const params = await searchParams;
  const activeWindow = params.window ?? "live";
  const activeCategory = params.category ?? "all";
  const query = params.q ?? "";
  return <AppShell><HomeClient initialSites={getLeaderboard(activeWindow, activeCategory, query).slice(0, 3)} categories={getCategories()} initialWindow={activeWindow} initialCategory={activeCategory} initialQuery={query} /></AppShell>;
}
