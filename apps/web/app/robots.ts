import type { MetadataRoute } from "next";
import { getServerEnv } from "@surge/config";

export default function robots(): MetadataRoute.Robots {
  const env = getServerEnv();
  const allow = ["/", "/site/", "/rankings", "/breakouts", "/categories", "/live", "/radar", "/methodology", "/submit"];
  if (env.NEXT_PUBLIC_COMMERCIAL_ENABLED) allow.push("/boost", "/pricing", "/bid-the-moment");
  return { rules: { userAgent: "*", allow, disallow: ["/dashboard", "/admin", "/auth", "/api", "/creators", "/campaigns", "/fanward", ...(env.NEXT_PUBLIC_COMMERCIAL_ENABLED ? [] : ["/boost", "/pricing", "/bid-the-moment"]) ] }, sitemap: `${env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "")}/sitemap.xml` };
}
