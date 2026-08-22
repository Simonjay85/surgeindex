import { NextResponse } from "next/server";
import { createHmac } from "node:crypto";
import { and, eq, gt } from "drizzle-orm";
import { domainToUrl, isAllowedRedirectDestination } from "@surge/shared";
import { checkOutboundClick } from "@surge/anti-fraud";
import { getServerEnv } from "@surge/config";
import { getPostgresDb, outboundClick } from "@surge/db";
import { getPublicDataProvider } from "../../../lib/server/public-provider";
import { signAttributionToken } from "../../../lib/server/traffic-pipeline";

export async function GET(request: Request, { params }: { params: Promise<{ siteSlug: string }> }) {
  const { siteSlug } = await params;
  const site = await getPublicDataProvider().getSite(siteSlug);
  if (!site) return NextResponse.json({ error: "Site not found" }, { status: 404 });
  const destination = domainToUrl(site.domain);
  if (!isAllowedRedirectDestination(destination)) return NextResponse.json({ error: "Destination unavailable" }, { status: 400 });
  let redirectDestination = destination;
  const env = getServerEnv();
  if (env.APP_MODE === "production" && env.DATA_PROVIDER === "postgres") {
    const db = getPostgresDb();
    const visitorHash = createHmac("sha256", `${env.TRACKER_HASH_SECRET ?? env.TRACKER_HASH_SALT ?? env.TRACKER_SIGNING_SECRET}:${new Date().toISOString().slice(0, 10)}`).update(`${request.headers.get("x-forwarded-for") ?? "unknown"}:${request.headers.get("user-agent") ?? ""}`).digest("hex");
    const recent = await db.select({ id: outboundClick.id }).from(outboundClick).where(and(eq(outboundClick.siteId, site.siteId), eq(outboundClick.visitorHash, visitorHash), gt(outboundClick.occurredAt, new Date(Date.now() - 10 * 60 * 1000)))).limit(25);
    const verdict = checkOutboundClick({ userAgent: request.headers.get("user-agent"), visitorClicksLast10m: recent.length });
    const [click] = await db.insert(outboundClick).values({
      siteId: site.siteId,
      placement: "organic",
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

function safeRefererPath(value: string | null): string | null {
  if (!value) return null;
  try { return new URL(value).pathname.slice(0, 512) || "/"; } catch { return null; }
}
