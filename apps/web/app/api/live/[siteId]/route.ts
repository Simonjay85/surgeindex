import { NextResponse } from "next/server";
import { getServerEnv } from "@surge/config";
import { getPublicDataProvider } from "../../../../lib/server/public-provider";
import { getRealtimeSnapshot } from "../../../../lib/server/realtime";

export async function GET(_request: Request, { params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await params;
  const site = await getPublicDataProvider().getSiteById(siteId);
  if (!site || site.status !== "active") return NextResponse.json({ error: "Site not found" }, { status: 404 });
  try {
    const snapshot = await getRealtimeSnapshot(site.siteId);
    return NextResponse.json({ data: { ...snapshot, freshness: snapshot.activeVisitors > 0 || snapshot.activeSessions > 0 ? "fresh" : "stale" }, source: getPublicDataProvider().source }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    const useConfiguredRealtimeOnly = getServerEnv().REALTIME_PROVIDER === "durable_objects";
    return NextResponse.json({ data: { siteId: site.siteId, activeVisitors: useConfiguredRealtimeOnly ? null : site.activeNow, activeSessions: useConfiguredRealtimeOnly ? null : site.activeSessions, updatedAt: site.lastAcceptedEventAt ?? site.lastUpdatedAt, freshness: "offline" }, source: getPublicDataProvider().source }, { headers: { "Cache-Control": "no-store" } });
  }
}
