import type { MetadataRoute } from "next";
import { getServerEnv } from "@surge/config";
import { getLatestSnapshot, listArchiveDates } from "../lib/trends/read";
import { TREND_SOURCES } from "../lib/trends/types";

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
  for (const date of dates) {
    for (const s of sources) {
      entries.push({ url: `${base}/top-10/${s.key}/${date}`, lastModified: new Date(`${date}T23:59:59Z`), changeFrequency: "daily", priority: 0.6 });
    }
  }
  return entries;
}
