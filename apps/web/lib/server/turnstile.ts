import "server-only";

import { getServerEnv } from "@surge/config";
import { getTrustedClientIp } from "./client-ip";

export type TurnstileCheck =
  | { ok: true }
  | { ok: false; code: "turnstile_required" | "turnstile_failed" | "turnstile_configuration" };

/**
 * Verify a Cloudflare Turnstile token without ever logging the token. Demo and
 * test runs use one explicit fixture token; production always uses Cloudflare
 * when TURNSTILE_REQUIRED=true.
 */
export async function verifyTurnstile(request: Request, token: unknown, action?: string): Promise<TurnstileCheck> {
  const env = getServerEnv();
  const value = typeof token === "string" ? token.trim() : "";
  if (!value && !env.TURNSTILE_REQUIRED) return { ok: true };
  if (!value) return { ok: false, code: "turnstile_required" };
  if ((env.NODE_ENV === "test" || env.APP_MODE === "demo") && value === "turnstile-fixture") return { ok: true };
  if (!env.TURNSTILE_SECRET_KEY) return { ok: false, code: "turnstile_configuration" };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5_000);
  try {
    const body = new URLSearchParams({ secret: env.TURNSTILE_SECRET_KEY, response: value });
    const ip = getTrustedClientIp(request);
    if (ip !== "unknown") body.set("remoteip", ip);
    const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
      signal: controller.signal,
    });
    if (!response.ok) return { ok: false, code: "turnstile_failed" };
    const result = await response.json().catch(() => null) as {
      success?: boolean;
      action?: string;
      hostname?: string;
    } | null;
    if (!result?.success) return { ok: false, code: "turnstile_failed" };
    if (action && result.action !== action) return { ok: false, code: "turnstile_failed" };
    if (env.TURNSTILE_EXPECTED_HOSTNAME && result.hostname !== env.TURNSTILE_EXPECTED_HOSTNAME) return { ok: false, code: "turnstile_failed" };
    return { ok: true };
  } catch {
    return { ok: false, code: "turnstile_failed" };
  } finally {
    clearTimeout(timeout);
  }
}
