import { NextResponse } from "next/server";
import { getPublicDataProvider } from "../../../../../lib/server/public-provider";

/** Server-side aggregate metrics for a public site profile. Raw events never leave the server. */
export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const provider = getPublicDataProvider();
  const site = await provider.getSite(slug);
  if (!site) return NextResponse.json({ error: "Site not found" }, { status: 404 });
  return NextResponse.json({
    data: {
      siteId: site.siteId,
      activeVisitors: site.activeNow,
      activeSessions: site.activeSessions,
      visitors24h: site.visitors,
      visitors7d: site.visitors7d,
      sessions24h: site.sessions24h,
      pageviews24h: site.pageviews24h,
      engagedSessions24h: site.engagedSessions24h,
      engagementRate: site.engagementRate,
      avgEngagementSeconds: site.avgEngagementSeconds,
      surgeReferrals24h: site.surgeReferrals,
      attributedVisits24h: site.surgeAttributedVisits24h,
      attributedEngagedVisits24h: site.surgeAttributedEngagedVisits24h,
      lastAcceptedEventAt: site.lastAcceptedEventAt,
      lastUpdatedAt: site.lastUpdatedAt,
      source: provider.source,
      isDemo: site.isDemo,
    },
    source: provider.source,
  }, { headers: { "Cache-Control": "no-store" } });
}
