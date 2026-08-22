import { NextResponse } from "next/server";
import { getLeaderboard } from "../../../lib/demo-data";

export function GET(request: Request) {
  const q = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (!q) return NextResponse.json({ data: [] });
  return NextResponse.json({ data: getLeaderboard("live", undefined, q).slice(0, 8), source: "demo" }, { headers: { "Cache-Control": "private, max-age=15" } });
}
