import { createHash, timingSafeEqual } from "node:crypto";

export type LiveAuth = { ok: true } | { ok: false; status: 401 | 503; code: string; message: string };

/**
 * Bearer-token check for POST /api/live/<slug>. LIVE_ADMIN_TOKEN unset means
 * the endpoint is disabled (503). Compared in constant time via SHA-256 digests.
 */
export function checkLiveAdmin(request: Request, configured = process.env.LIVE_ADMIN_TOKEN): LiveAuth {
  const token = configured?.trim();
  if (!token) return { ok: false, status: 503, code: "live_admin_disabled", message: "Live updates are not enabled on this server (LIVE_ADMIN_TOKEN is not set)." };
  const header = request.headers.get("authorization") ?? "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) return { ok: false, status: 401, code: "unauthorized", message: "Missing bearer token." };
  const a = createHash("sha256").update(match[1]!.trim()).digest();
  const b = createHash("sha256").update(token).digest();
  if (!timingSafeEqual(a, b)) return { ok: false, status: 401, code: "unauthorized", message: "Invalid bearer token." };
  return { ok: true };
}
