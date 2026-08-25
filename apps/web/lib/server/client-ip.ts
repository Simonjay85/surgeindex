import "server-only";

import { isIP } from "node:net";
import { getServerEnv } from "@surge/config";

/**
 * Return the address asserted by the deployment's trusted reverse proxy.
 *
 * X-Forwarded-For is intentionally ignored. Nginx must overwrite X-Real-IP
 * after validating the direct peer (or Cloudflare's CF-Connecting-IP through
 * the real_ip allowlist). When the app is not behind an explicitly configured
 * proxy, returning an aggregate "unknown" subject is safer than accepting a
 * client-controlled address.
 */
export function getTrustedClientIp(request: Request): string {
  const mode = getServerEnv().TRUSTED_PROXY_MODE;
  if (mode === "none") return "unknown";
  const candidate = request.headers.get("x-real-ip")?.trim() ?? "";
  if (!candidate || isIP(candidate) === 0) return "unknown";
  return candidate;
}

export function isTrustedProxyModeConfigured(): boolean {
  return getServerEnv().TRUSTED_PROXY_MODE !== "none";
}
