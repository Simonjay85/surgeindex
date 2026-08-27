import type { MetadataRoute } from "next";
import { getServerEnv } from "@surge/config";
import { getPublicDataProvider } from "../lib/server/public-provider";

// The production sitemap reflects the live PostgreSQL catalog. Generate it at
// request time so an immutable release can be built before database promotion.
export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = getServerEnv().NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  const commercialEnabled = getServerEnv().NEXT_PUBLIC_COMMERCIAL_ENABLED;
  const sites = await getPublicDataProvider().getLeaderboard({ window: "live", limit: 5000 });
  const commercialRoutes = commercialEnabled ? ["/boost", "/bid-the-moment", "/pricing"] : [];
  return ["", "/rankings", "/breakouts", "/categories", "/live", "/radar", "/methodology", "/submit", "/privacy", "/terms", "/acceptable-use", ...commercialRoutes, ...sites.map((site) => `/site/${site.slug}`)].map((path) => ({ url: `${base}${path}`, lastModified: new Date(), changeFrequency: path.includes("site/") ? "hourly" : "daily", priority: path === "" ? 1 : path.includes("site/") ? .7 : .8 }));
}
