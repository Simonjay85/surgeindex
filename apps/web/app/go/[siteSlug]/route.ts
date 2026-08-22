import { NextResponse } from "next/server";
import { domainToUrl, isAllowedRedirectDestination } from "@surge/shared";
import { getSite } from "../../../lib/demo-data";

export async function GET(request: Request, { params }: { params: Promise<{ siteSlug: string }> }) {
  const { siteSlug } = await params;
  const site = getSite(siteSlug);
  if (!site) return NextResponse.json({ error: "Site not found" }, { status: 404 });
  const destination = domainToUrl(site.domain);
  if (!isAllowedRedirectDestination(destination)) return NextResponse.json({ error: "Destination unavailable" }, { status: 400 });
  const response = NextResponse.redirect(destination, 302);
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("X-SurgeIndex-Referral", "demo");
  return response;
}
