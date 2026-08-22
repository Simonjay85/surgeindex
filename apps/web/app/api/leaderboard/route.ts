import { NextResponse } from "next/server";
import { getLeaderboard } from "../../../lib/demo-data";

export function GET(request: Request) {
  const url = new URL(request.url);
  const window = url.searchParams.get("window") ?? "live";
  const category = url.searchParams.get("category") ?? "all";
  const q = url.searchParams.get("q") ?? "";
  return NextResponse.json({ data: getLeaderboard(window, category, q).slice(0, 50), generatedAt: "2026-08-23T10:30:00.000Z", source: "demo" }, { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" } });
}
