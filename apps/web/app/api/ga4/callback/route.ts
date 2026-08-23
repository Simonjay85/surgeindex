import { getServerEnv } from "@surge/config";
import { NextResponse } from "next/server";
import { completeGa4OAuth, Ga4ServiceError } from "../../../../lib/server/ga4-service";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const configured = getServerEnv().GA4_OAUTH_REDIRECT_URI;
  const requestUrl = new URL(request.url);
  if (configured) {
    const configuredUrl = new URL(configured);
    if (requestUrl.origin !== configuredUrl.origin || requestUrl.pathname !== configuredUrl.pathname) {
      return redirect("/dashboard", "oauth_callback_origin_invalid");
    }
  }
  const code = requestUrl.searchParams.get("code");
  const state = requestUrl.searchParams.get("state");
  if (requestUrl.searchParams.get("error")) return redirect("/dashboard", requestUrl.searchParams.get("error") === "access_denied" ? "access_denied" : "oauth_rejected");
  if (!code || !state) return redirect("/dashboard", "oauth_callback_invalid");
  try {
    const result = await completeGa4OAuth({ code, state });
    const target = new URL(result.returnPath, getServerEnv().NEXT_PUBLIC_APP_URL);
    target.searchParams.set("ga4", "select_property");
    return NextResponse.redirect(target);
  } catch (error) {
    const codeValue = error instanceof Ga4ServiceError ? error.code : "oauth_callback_failed";
    return redirect("/dashboard", codeValue);
  }
}

function redirect(path: string, code: string) {
  const target = new URL(path, getServerEnv().NEXT_PUBLIC_APP_URL);
  target.searchParams.set("ga4", "error");
  target.searchParams.set("code", code);
  return NextResponse.redirect(target);
}
