import { NextResponse } from "next/server";
import { getRelatedSites, getSite, getTimeseries } from "../../../../lib/demo-data";

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const site = getSite(slug);
  if (!site) return NextResponse.json({ error: "Site not found" }, { status: 404 });
  return NextResponse.json({ data: { ...site, related: getRelatedSites(slug), timeseries: getTimeseries(slug) }, source: "demo" });
}
