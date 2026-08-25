import type { MetadataRoute } from "next";
import { getServerEnv } from "@surge/config";
import { getPublicDataProvider } from "../lib/server/public-provider";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = getServerEnv().NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  const sites = await getPublicDataProvider().getLeaderboard({ window: "live", limit: 5000 });
  return ["", "/rankings", "/breakouts", "/categories", "/live", "/radar", "/boost", "/bid-the-moment", "/methodology", "/pricing", "/submit", "/privacy", "/terms", ...sites.map((site) => `/site/${site.slug}`)].map((path) => ({ url: `${base}${path}`, lastModified: new Date(), changeFrequency: path.includes("site/") ? "hourly" : "daily", priority: path === "" ? 1 : path.includes("site/") ? .7 : .8 }));
}
