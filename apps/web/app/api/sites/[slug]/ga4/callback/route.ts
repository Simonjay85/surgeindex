import { z } from "zod";
import { getServerEnv } from "@surge/config";
import { NextResponse } from "next/server";
import { completeGa4OAuth, Ga4ServiceError } from "../../../../../../lib/server/ga4-service";

export const runtime = "nodejs";

const paramsSchema = z.object({ slug: z.string().uuid() });

export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const parsedParams = paramsSchema.safeParse(await params);
  if (!parsedParams.success) return redirect(request, "", "error", "invalid_site");
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const providerError = url.searchParams.get("error");
  if (providerError) return redirect(request, parsedParams.data.slug, "error", providerError === "access_denied" ? "access_denied" : "oauth_rejected");
  if (!code || !state) return redirect(request, parsedParams.data.slug, "error", "oauth_callback_invalid");
  try {
    const result = await completeGa4OAuth({ siteId: parsedParams.data.slug, code, state });
    const target = new URL(result.returnPath, getServerEnv().NEXT_PUBLIC_APP_URL);
    target.searchParams.set("ga4", "select_property");
    return NextResponse.redirect(target);
  } catch (error) {
    const codeValue = error instanceof Ga4ServiceError ? error.code : "oauth_callback_failed";
    return redirect(request, parsedParams.data.slug, "error", codeValue);
  }
}

function redirect(_request: Request, siteId: string, key: "error", value: string) {
  const target = new URL(siteId ? `/dashboard/sites/${siteId}/ga4` : "/dashboard", getServerEnv().NEXT_PUBLIC_APP_URL);
  target.searchParams.set("ga4", key);
  target.searchParams.set("code", value);
  return NextResponse.redirect(target);
}
