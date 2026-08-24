import { NextResponse } from "next/server";
import { findPublicSiteBySlug } from "@surge/db";
import { getPostgresDb } from "@surge/db";
import { getSitePageMetrics, getSiteRevenueSummary } from "../../../../../lib/server/site-stats";

/** Public page-level aggregates. Revenue is returned only when the owner explicitly disclosed it. */
export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const db = getPostgresDb();
  const site = await findPublicSiteBySlug(db, slug);
  if (!site) return NextResponse.json({ error: "Site not found" }, { status: 404 });
  const [pages, revenue] = await Promise.all([getSitePageMetrics(site.id), getSiteRevenueSummary(site.id, true)]);
  return NextResponse.json(
    {
      data: {
        siteId: site.id,
        pages,
        revenue,
        revenueScope: "site_level_only",
        note: "Sales and Boost revenue are not allocated to individual page paths unless the source provides a verified page attribution.",
      },
      source: "postgres",
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
