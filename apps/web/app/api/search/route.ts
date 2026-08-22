import { NextResponse } from "next/server";
import { getPublicDataProvider } from "../../../lib/server/public-provider";

export async function GET(request: Request) {
  const q = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (!q) return NextResponse.json({ data: [] });
  const provider = getPublicDataProvider();
  return NextResponse.json({ data: await provider.getLeaderboard({ window: "live", query: q, limit: 8 }), source: provider.source }, { headers: { "Cache-Control": "private, max-age=15" } });
}
