import { NextResponse } from "next/server";
import { createHmac } from "node:crypto";
import { and, eq, gt } from "drizzle-orm";
import { domainToUrl, isAllowedRedirectDestination, normalizeDomain } from "@surge/shared";
import { checkOutboundClick } from "@surge/anti-fraud";
import { getServerEnv } from "@surge/config";
import { boostCampaign, getPostgresDb, outboundClick, site as siteTable } from "@surge/db";
import { getPublicDataProvider } from "../../../lib/server/public-provider";
import { recordBoostClick } from "../../../lib/server/boost-service";
import { anonymousVisitorHash, verifyClickToken } from "../../../lib/server/boost-tokens";
import { getTrustedClientIp } from "../../../lib/server/client-ip";
import { signAttributionToken } from "../../../lib/server/traffic-pipeline";

export async function GET(request: Request, { params }: { params: Promise<{ siteSlug: string }> }) {
  const { siteSlug } = await params;
  const env = getServerEnv();
  const campaignToken = new URL(request.url).searchParams.get("campaign");
  if (campaignToken) return handleSponsoredClick(request, siteSlug, campaignToken, env);
  const site = await getPublicDataProvider().getSite(siteSlug);
  if (!site) return NextResponse.json({ error: "Site not found" }, { status: 404 });
  const destination = domainToUrl(site.domain);
  if (!isAllowedRedirectDestination(destination)) return NextResponse.json({ error: "Destination unavailable" }, { status: 400 });
  let redirectDestination = destination;
  if (env.APP_MODE === "production" && env.DATA_PROVIDER === "postgres") {
    const db = getPostgresDb();
    const visitorHash = createHmac("sha256", `${env.TRACKER_HASH_SECRET ?? env.TRACKER_HASH_SALT ?? env.TRACKER_SIGNING_SECRET}:${new Date().toISOString().slice(0, 10)}`).update(`${getTrustedClientIp(request)}:${request.headers.get("user-agent") ?? ""}`).digest("hex");
    const recent = await db.select({ id: outboundClick.id }).from(outboundClick).where(and(eq(outboundClick.siteId, site.siteId), eq(outboundClick.visitorHash, visitorHash), gt(outboundClick.occurredAt, new Date(Date.now() - 10 * 60 * 1000)))).limit(25);
    const verdict = checkOutboundClick({ userAgent: request.headers.get("user-agent"), visitorClicksLast10m: recent.length });
    const [click] = await db.insert(outboundClick).values({
      siteId: site.siteId,
      placement: "organic",
      trafficOrigin: "organic_surgedindex_referral",
      visitorHash,
      referrerPath: safeRefererPath(request.headers.get("referer")),
      isUnique: recent.length === 0,
      valid: verdict.decision === "valid",
      decision: verdict.decision,
      isDemo: false,
    }).returning({ id: outboundClick.id });
    if (click && verdict.decision === "valid") {
      const token = signAttributionToken({ siteId: site.siteId, clickId: click.id, expiresAt: Date.now() + env.ATTRIBUTION_TTL_MINUTES * 60 * 1000 }, env.TRACKER_SIGNING_SECRET!);
      const target = new URL(destination);
      target.searchParams.set("_si_at", token);
      redirectDestination = target.toString();
    }
    console.log(JSON.stringify({ component: "referral", siteId: site.siteId, clickId: click?.id ?? null, decision: verdict.decision }));
  }
  const response = NextResponse.redirect(redirectDestination, 302);
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("X-SurgeIndex-Referral", site.isDemo ? "demo" : "organic");
  return response;
}

async function handleSponsoredClick(request: Request, siteSlug: string, token: string, env: ReturnType<typeof getServerEnv>) {
  const payload = verifyClickToken(token);
  if (!payload || payload.siteSlug !== siteSlug) return NextResponse.json({ error: "Sponsored link unavailable" }, { status: 404 });
  if (!isAllowedRedirectDestination(payload.destinationUrl)) return NextResponse.json({ error: "Destination unavailable" }, { status: 400 });
  if (env.APP_MODE === "demo") {
    const response = NextResponse.redirect(payload.destinationUrl, 302);
    response.headers.set("Cache-Control", "no-store");
    response.headers.set("X-SurgeIndex-Referral", "paid-demo");
    response.headers.set("X-SurgeIndex-Demo", "true");
    return response;
  }
  if (env.DATA_PROVIDER !== "postgres") return NextResponse.json({ error: "Sponsored link unavailable" }, { status: 404 });
  const db = getPostgresDb();
  const [row] = await db
    .select({ campaign: boostCampaign, domain: siteTable.domain })
    .from(boostCampaign)
    .innerJoin(siteTable, eq(siteTable.id, boostCampaign.siteId))
    .where(and(eq(boostCampaign.id, payload.campaignId), eq(boostCampaign.siteId, payload.siteId), eq(siteTable.slug, siteSlug), eq(boostCampaign.state, "active")))
    .limit(1);
  if (!row || !row.campaign.destinationUrl || normalizeDomain(row.campaign.destinationUrl) !== normalizeDomain(row.domain) || row.campaign.destinationUrl !== payload.destinationUrl) return NextResponse.json({ error: "Sponsored link unavailable" }, { status: 404 });
  const visitorHash = anonymousVisitorHash(request, payload.siteId);
  if (visitorHash !== payload.visitorContextHash) return NextResponse.json({ error: "Sponsored link unavailable" }, { status: 403 });
  const clickResult = await recordBoostClick({ payload, visitorContextHash: visitorHash, userAgent: request.headers.get("user-agent"), referrerPath: safeRefererPath(request.headers.get("referer")), requestId: request.headers.get("x-request-id") ?? crypto.randomUUID() });
  const [click] = await db.insert(outboundClick).values({ siteId: payload.siteId, campaignId: payload.campaignId, placement: payload.placementKey, trafficOrigin: "paid_surgedindex_referral", visitorHash, referrerPath: safeRefererPath(request.headers.get("referer")), isUnique: clickResult.unique, valid: clickResult.valid, decision: clickResult.valid ? "valid" : "invalid", isDemo: false }).returning({ id: outboundClick.id });
  let destination = payload.destinationUrl;
  if (click && clickResult.valid && env.TRACKER_SIGNING_SECRET) {
    const attribution = signAttributionToken({ siteId: payload.siteId, clickId: click.id, expiresAt: Date.now() + env.ATTRIBUTION_TTL_MINUTES * 60 * 1000 }, env.TRACKER_SIGNING_SECRET);
    const url = new URL(destination);
    url.searchParams.set("_si_at", attribution);
    destination = url.toString();
  }
  const response = NextResponse.redirect(destination, 302);
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("X-SurgeIndex-Referral", "paid");
  return response;
}

function safeRefererPath(value: string | null): string | null {
  if (!value) return null;
  try { return new URL(value).pathname.slice(0, 512) || "/"; } catch { return null; }
}
