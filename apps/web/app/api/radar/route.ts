import { NextResponse } from "next/server";
import { getRadarSnapshot, normalizeRadarWindow } from "../../../lib/server/radar-service";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const snapshot = await getRadarSnapshot({ window: normalizeRadarWindow(url.searchParams.get("window")) });
  const cacheControl = snapshot.configured ? "public, s-maxage=300, stale-while-revalidate=900" : "no-store";
  return NextResponse.json({ data: snapshot }, { headers: { "Cache-Control": cacheControl } });
}
