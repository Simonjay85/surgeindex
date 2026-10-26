import type { MetadataRoute } from "next";
import { getServerEnv } from "@surge/config";

export default function robots(): MetadataRoute.Robots {
  const env = getServerEnv();
  return {
    rules: {
      userAgent: "*",
      allow: ["/", "/top-10", "/vn", "/methodology", "/privacy", "/terms"],
      // Legacy directory/owner surfaces are hidden in the Top 10 product.
      disallow: ["/dashboard", "/admin", "/auth", "/api", "/claim", "/boost", "/pricing", "/bid-the-moment", "/creators", "/campaigns", "/fanward", "/submit"],
    },
    sitemap: `${env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "")}/sitemap.xml`,
  };
}
