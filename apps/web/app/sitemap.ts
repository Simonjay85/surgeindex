import type { MetadataRoute } from "next";
import { DEMO_SITES } from "../lib/demo-data";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return ["", "/rankings", "/breakouts", "/categories", "/boost", "/methodology", "/pricing", "/creators", "/campaigns", "/submit", "/privacy", "/terms", ...DEMO_SITES.map((site) => `/site/${site.slug}`)].map((path) => ({ url: `${base}${path}`, lastModified: new Date("2026-08-23T10:30:00.000Z"), changeFrequency: path.includes("site/") ? "hourly" : "daily", priority: path === "" ? 1 : path.includes("site/") ? .7 : .8 }));
}
