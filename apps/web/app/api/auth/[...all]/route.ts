import { toNextJsHandler } from "better-auth/next-js";
import { checkRateLimit } from "../../../../lib/server/rate-limit";
import { getTrustedClientIp } from "../../../../lib/server/client-ip";
import { assertSameOrigin, jsonError } from "../../../../lib/server/http";
import { verifyTurnstile } from "../../../../lib/server/turnstile";
import { getAuth } from "../../../../lib/server/auth";
import { isSafeInternalPath } from "../../../../lib/utils";

export const runtime = "nodejs";

async function guardedPost(request: Request) {
  const origin = assertSameOrigin(request);
  if (!origin.ok) return origin.response;
  const pathname = new URL(request.url).pathname;
  const body = await request.clone().json().catch(() => null) as Record<string, unknown> | null;
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase().slice(0, 320) : "unknown";
  const isSignup = pathname.endsWith("/sign-up/email");
  const isForgotPassword = pathname.endsWith("/request-password-reset") || pathname.endsWith("/forget-password");
  const isResetPassword = pathname.endsWith("/reset-password");
  const isResendVerification = pathname.endsWith("/send-verification-email");
  const authScope = isSignup ? "auth-signup" : isForgotPassword ? "auth-forgot-password" : isResendVerification ? "auth-resend-verification" : isResetPassword ? "auth-reset-password" : "auth-signin";
  const authLimit = isSignup ? 6 : isForgotPassword || isResendVerification ? 5 : isResetPassword ? 10 : 20;
  const rate = await checkRateLimit(authScope, `${getTrustedClientIp(request)}:${email}`, authLimit, 15 * 60 * 1000);
  if (!rate.allowed) return jsonError(request, 429, "rate_limited", `Too many authentication attempts. Try again in ${rate.retryAfterSeconds} seconds.`);
  for (const key of ["callbackURL", "callbackUrl", "redirectTo", "redirectURI"]) {
    if (body && Object.hasOwn(body, key) && !isSafeInternalPath(body[key])) {
      return jsonError(request, 400, "unsafe_redirect", "Only same-origin paths are allowed for authentication redirects.");
    }
  }
  const turnstileAction = isSignup ? "signup" : isForgotPassword || isResetPassword ? "password-reset" : isResendVerification ? "verification-resend" : null;
  if (turnstileAction) {
    const check = await verifyTurnstile(request, body?.turnstileToken, turnstileAction);
    if (!check.ok) return jsonError(request, check.code === "turnstile_configuration" ? 503 : 422, check.code, "The anti-bot check could not be completed.");
    if (body && Object.hasOwn(body, "turnstileToken")) {
      const authBody = { ...(body ?? {}) };
      delete authBody.turnstileToken;
      const headers = new Headers(request.headers);
      headers.delete("content-length");
      request = new Request(request.url, { method: request.method, headers, body: JSON.stringify(authBody) });
    }
  }
  return toNextJsHandler(getAuth()).POST(request);
}

function guardedGet(request: Request) {
  const url = new URL(request.url);
  for (const key of ["callbackURL", "callbackUrl", "redirectTo", "redirectURI"]) {
    const value = url.searchParams.get(key);
    if (value && !isSafeInternalPath(value)) return jsonError(request, 400, "unsafe_redirect", "Only same-origin paths are allowed for authentication redirects.");
  }
  return toNextJsHandler(getAuth()).GET(request);
}

export const GET = guardedGet;
export const POST = guardedPost;
export const PATCH = (request: Request) => toNextJsHandler(getAuth()).PATCH(request);
export const PUT = (request: Request) => toNextJsHandler(getAuth()).PUT(request);
export const DELETE = (request: Request) => toNextJsHandler(getAuth()).DELETE(request);
