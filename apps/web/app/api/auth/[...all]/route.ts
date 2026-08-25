import { toNextJsHandler } from "better-auth/next-js";
import { checkRateLimit } from "../../../../lib/server/rate-limit";
import { getTrustedClientIp } from "../../../../lib/server/client-ip";
import { assertSameOrigin, jsonError } from "../../../../lib/server/http";
import { verifyTurnstile } from "../../../../lib/server/turnstile";
import { getAuth } from "../../../../lib/server/auth";

export const runtime = "nodejs";

async function guardedPost(request: Request) {
  const origin = assertSameOrigin(request);
  if (!origin.ok) return origin.response;
  const pathname = new URL(request.url).pathname;
  const body = await request.clone().json().catch(() => null) as { email?: unknown; turnstileToken?: unknown } | null;
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase().slice(0, 320) : "unknown";
  const isSignup = pathname.endsWith("/sign-up/email");
  const isForgotPassword = pathname.endsWith("/forget-password");
  const isResendVerification = pathname.endsWith("/send-verification-email");
  const authScope = isSignup ? "auth-signup" : isForgotPassword ? "auth-forgot-password" : isResendVerification ? "auth-resend-verification" : "auth-signin";
  const authLimit = isSignup ? 6 : isForgotPassword || isResendVerification ? 5 : 20;
  const rate = await checkRateLimit(authScope, `${getTrustedClientIp(request)}:${email}`, authLimit, 15 * 60 * 1000);
  if (!rate.allowed) return jsonError(request, 429, "rate_limited", `Too many authentication attempts. Try again in ${rate.retryAfterSeconds} seconds.`);
  const turnstileAction = isSignup ? "signup" : isForgotPassword ? "password-reset" : isResendVerification ? "verification-resend" : null;
  if (turnstileAction) {
    const check = await verifyTurnstile(request, body?.turnstileToken, turnstileAction);
    if (!check.ok) return jsonError(request, check.code === "turnstile_configuration" ? 503 : 422, check.code, "The anti-bot check could not be completed.");
    if (body && Object.hasOwn(body, "turnstileToken")) {
      const authBody = { ...(body as Record<string, unknown>) };
      delete authBody.turnstileToken;
      const headers = new Headers(request.headers);
      headers.delete("content-length");
      request = new Request(request.url, { method: request.method, headers, body: JSON.stringify(authBody) });
    }
  }
  return toNextJsHandler(getAuth()).POST(request);
}

export const GET = (request: Request) => toNextJsHandler(getAuth()).GET(request);
export const POST = guardedPost;
export const PATCH = (request: Request) => toNextJsHandler(getAuth()).PATCH(request);
export const PUT = (request: Request) => toNextJsHandler(getAuth()).PUT(request);
export const DELETE = (request: Request) => toNextJsHandler(getAuth()).DELETE(request);
