import { NextResponse } from "next/server";
import { getPublicDataProvider } from "../../../../../lib/server/public-provider";

export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const provider = getPublicDataProvider();
  if (!await provider.getSite(slug)) return NextResponse.json({ error: "Site not found" }, { status: 404 });
  const metric = new URL(request.url).searchParams.get("metric") as "visitors" | "active" | "referrals" | null;
  return NextResponse.json({ data: await provider.getTimeseries(slug, metric === "active" || metric === "referrals" ? metric : "visitors"), source: provider.source });
}
