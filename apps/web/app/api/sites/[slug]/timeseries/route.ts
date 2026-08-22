import { NextResponse } from "next/server";
import { getSite, getTimeseries } from "../../../../../lib/demo-data";

export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!getSite(slug)) return NextResponse.json({ error: "Site not found" }, { status: 404 });
  const metric = new URL(request.url).searchParams.get("metric") as "visitors" | "active" | "referrals" | null;
  return NextResponse.json({ data: getTimeseries(slug, metric === "active" || metric === "referrals" ? metric : "visitors"), source: "demo" });
}
