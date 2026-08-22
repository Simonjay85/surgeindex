import type { MetadataRoute } from "next";
import { getPublicDataProvider } from "../lib/server/public-provider";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const sites = await getPublicDataProvider().getLeaderboard({ window: "live", limit: 5000 });
  return ["", "/rankings", "/breakouts", "/categories", "/boost", "/methodology", "/pricing", "/creators", "/campaigns", "/submit", "/privacy", "/terms", ...sites.map((site) => `/site/${site.slug}`)].map((path) => ({ url: `${base}${path}`, lastModified: new Date(), changeFrequency: path.includes("site/") ? "hourly" : "daily", priority: path === "" ? 1 : path.includes("site/") ? .7 : .8 }));
}
