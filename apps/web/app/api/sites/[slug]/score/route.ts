import { NextResponse } from "next/server";
import { getPublicDataProvider } from "../../../../../lib/server/public-provider";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const provider = getPublicDataProvider();
  const site = await provider.getSite(slug);
  if (!site) return NextResponse.json({ error: "Site not found" }, { status: 404 });
  const explanation = await provider.getScoreExplanation(slug);
  return NextResponse.json(
    {
      data: explanation,
      site: {
        slug: site.slug,
        scoreState: site.scoreState,
        freshness: site.freshness,
        dataConfidence: site.dataConfidence,
        scoreVersion: site.scoreVersion,
      },
      source: provider.source,
      generatedAt: new Date().toISOString(),
    },
    { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" } },
  );
}
