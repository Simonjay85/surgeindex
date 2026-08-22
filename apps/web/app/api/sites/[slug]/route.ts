import { NextResponse } from "next/server";
import { getPublicDataProvider } from "../../../../lib/server/public-provider";

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const provider = getPublicDataProvider();
  const site = await provider.getSite(slug);
  if (!site) return NextResponse.json({ error: "Site not found" }, { status: 404 });
  return NextResponse.json({ data: { ...site, related: await provider.getRelatedSites(slug), timeseries: await provider.getTimeseries(slug) }, source: provider.source });
}
