import type { MetadataRoute } from "next";
import { getServerEnv } from "@surge/config";
import { getLatestSnapshot, listArchiveDates } from "../lib/trends/read";
import { TREND_SOURCES } from "../lib/trends/types";
import { listStories } from "../lib/stories";

// Built from the trend snapshots on disk; no database access.
export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = getServerEnv().NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  const [snapshot, dates] = await Promise.all([getLatestSnapshot(), listArchiveDates()]);
  const updated = snapshot ? new Date(snapshot.generatedAt) : new Date();
  const sources = TREND_SOURCES.filter((s) => !s.comingSoon);
  const entries: MetadataRoute.Sitemap = [
    { url: `${base}/`, lastModified: updated, changeFrequency: "hourly", priority: 1 },
    { url: `${base}/top-10`, lastModified: updated, changeFrequency: "hourly", priority: 0.9 },
    ...sources.map((s) => ({ url: `${base}/top-10/${s.key}`, lastModified: updated, changeFrequency: "hourly" as const, priority: 0.9 })),
    ...["/methodology", "/privacy", "/terms"].map((p) => ({ url: `${base}${p}`, changeFrequency: "monthly" as const, priority: 0.4 })),
  ];
  // Surge Stories: static archive pages, dated by their own last update.
  const stories = listStories();
  if (stories.length) {
    entries.push({ url: `${base}/vn/stories`, lastModified: new Date(`${stories[0]!.last_updated}T12:00:00+07:00`), changeFrequency: "weekly", priority: 0.6 });
    for (const story of stories) {
      entries.push({ url: `${base}${story.url}`, lastModified: new Date(`${story.last_updated}T12:00:00+07:00`), changeFrequency: story.live ? "hourly" : "weekly", priority: 0.7 });
    }
  }
  for (const date of dates) {
    for (const s of sources) {
      entries.push({ url: `${base}/top-10/${s.key}/${date}`, lastModified: new Date(`${date}T23:59:59Z`), changeFrequency: "daily", priority: 0.6 });
    }
  }
  return entries;
}
