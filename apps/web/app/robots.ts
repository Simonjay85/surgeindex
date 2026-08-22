import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: "*", allow: ["/", "/site/", "/rankings", "/breakouts", "/categories", "/methodology", "/pricing"], disallow: ["/dashboard", "/admin", "/auth", "/api"] }, sitemap: `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/sitemap.xml` };
}
