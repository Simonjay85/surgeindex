import { NextResponse } from "next/server";
import { getPublicDataProvider } from "../../../lib/server/public-provider";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const window = url.searchParams.get("window") ?? "live";
  const category = url.searchParams.get("category") ?? "all";
  const q = url.searchParams.get("q") ?? "";
  const provider = getPublicDataProvider();
  return NextResponse.json({ data: await provider.getLeaderboard({ window, category, query: q, limit: 50 }), generatedAt: new Date().toISOString(), source: provider.source }, { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" } });
}
