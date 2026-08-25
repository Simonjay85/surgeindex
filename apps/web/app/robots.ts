import type { MetadataRoute } from "next";
import { getServerEnv } from "@surge/config";

export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: "*", allow: ["/", "/site/", "/rankings", "/breakouts", "/categories", "/live", "/boost", "/methodology", "/pricing", "/submit"], disallow: ["/dashboard", "/admin", "/auth", "/api", "/creators", "/campaigns", "/fanward"] }, sitemap: `${getServerEnv().NEXT_PUBLIC_APP_URL.replace(/\/$/, "")}/sitemap.xml` };
}
