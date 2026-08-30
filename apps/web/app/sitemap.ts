import type { MetadataRoute } from "next";
import { getServerEnv } from "@surge/config";
import { listPublicFanwardSitemapEntries } from "../lib/server/fanward-service";
import { getPublicDataProvider } from "../lib/server/public-provider";

// The production sitemap reflects the live PostgreSQL catalog. Generate it at
// request time so an immutable release can be built before database promotion.
export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const env = getServerEnv();
  const base = env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  const commercialEnabled = env.NEXT_PUBLIC_COMMERCIAL_ENABLED;
  const [sites, fanwardCreators] = await Promise.all([
    getPublicDataProvider().getLeaderboard({ window: "live", limit: 5000 }),
    env.FEATURE_CREATORS ? listPublicFanwardSitemapEntries() : Promise.resolve([]),
  ]);
  const commercialRoutes = commercialEnabled ? ["/boost", "/bid-the-moment", "/pricing"] : [];
  const staticPaths = ["", "/rankings", "/breakouts", "/categories", "/live", "/radar", "/methodology", "/submit", "/privacy", "/terms", "/acceptable-use", ...commercialRoutes, ...(env.FEATURE_CREATORS ? ["/fanward"] : [])];
  const entries: MetadataRoute.Sitemap = staticPaths.map((path) => ({ url: `${base}${path}`, lastModified: new Date(), changeFrequency: "daily", priority: path === "" ? 1 : .8 }));
  entries.push(...sites.map((site) => ({ url: `${base}/site/${site.slug}`, lastModified: new Date(), changeFrequency: "hourly" as const, priority: .7 })));
  entries.push(...fanwardCreators.map((creator) => ({ url: `${base}/fanward/${creator.slug}`, lastModified: creator.publishedAt, changeFrequency: "daily" as const, priority: .7 })));

  return entries;
}
