import { NextResponse } from "next/server";
import { getServerEnv } from "@surge/config";
import { getPublicDataProvider } from "../../../../lib/server/public-provider";
import { isValidSiteId } from "../../../../lib/server/identifiers";
import { getRealtimeSnapshot } from "../../../../lib/server/realtime";
import { getStory } from "../../../../lib/stories";
import { checkLiveAdmin } from "../../../../lib/live/auth";
import { appendLive, readLiveFile, readPressFile } from "../../../../lib/live/store";
import { livePostSchema } from "../../../../lib/live/types";

export const runtime = "nodejs";

/**
 * /api/live/<id> serves two things that share the path segment:
 *  - a live Surge Story slug (e.g. truong-giang): GET the live blog JSON,
 *    POST (Bearer LIVE_ADMIN_TOKEN) to append an update or resolve the story;
 *  - a legacy site UUID: GET realtime visitors (unchanged).
 */
function liveStory(id: string) {
  const story = getStory("vn", id);
  return story?.live ? story : undefined;
}

export async function GET(_request: Request, { params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await params;
  const story = liveStory(siteId);
  if (story) {
    const [live, press] = await Promise.all([readLiveFile(story.slug), readPressFile(story.slug)]);
    return NextResponse.json(
      { slug: story.slug, url: story.url, live: !live.resolved, updated_at: live.updated_at, updates: live.updates, resolved: live.resolved, press: press?.items.slice(0, 20) ?? [] },
      { headers: { "Cache-Control": "public, max-age=30, s-maxage=30" } },
    );
  }
  if (!isValidSiteId(siteId)) {
    return NextResponse.json({ error: "Site not found" }, { status: 404, headers: { "Cache-Control": "no-store" } });
  }
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

function fail(status: number, code: string, message: string) {
  return NextResponse.json({ error: { code, message } }, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request, { params }: { params: Promise<{ siteId: string }> }) {
  const auth = checkLiveAdmin(request);
  if (!auth.ok) return fail(auth.status, auth.code, auth.message);
  const { siteId } = await params;
  const story = liveStory(siteId);
  if (!story) return fail(404, "not_live", "No live story with this slug.");
  const raw = await request.json().catch(() => null);
  const body = raw && typeof raw === "object" && !("action" in raw) ? { action: "update", ...raw } : raw;
  const parsed = livePostSchema.safeParse(body);
  if (!parsed.success) return fail(422, "invalid_update", parsed.error.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`).join("; "));
  try {
    const file = await appendLive(story.slug, parsed.data);
    const entry = parsed.data.action === "resolve" ? file.resolved : file.updates[0];
    return NextResponse.json({ ok: true, action: parsed.data.action, entry, updates: file.updates.length, resolved: Boolean(file.resolved) }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    if ((e as { code?: string }).code === "already_resolved") return fail(409, "already_resolved", "This story is already resolved; updates are append-only.");
    console.error(JSON.stringify({ component: "live-post", slug: story.slug, error: (e as Error).message }));
    return fail(500, "write_failed", "Could not save the update.");
  }
}
