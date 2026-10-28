import "server-only";

import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import { getPostgresDb } from "@surge/db";
import { getServerEnv } from "@surge/config";

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

/**
 * Use PostgreSQL for production's single-VPS topology. Memory is deliberately
 * limited to demo/test/development so a restart cannot silently remove the
 * production limiter.
 */
export async function checkRateLimit(scope: string, subject: string, limit: number, windowMs: number): Promise<{ allowed: boolean; retryAfterSeconds: number }> {
  const env = getServerEnv();
  // Never persist a raw IP or other caller identifier in the durable bucket.
  // Better Auth's production secret is already required and stable for the
  // process lifetime, so it provides a deployment-local keyed namespace.
  const key = createHash("sha256").update(`${scope}:${subject}:${env.BETTER_AUTH_SECRET ?? "local-rate-limit"}`).digest("hex");
  if (env.APP_MODE === "production" && env.DATA_PROVIDER === "postgres") {
    try {
      const now = Date.now();
      const expiresAt = now + windowMs;
      const result = await getPostgresDb().execute(sql`
        insert into rate_limit_bucket (key, window_started_at, window_expires_at, count, updated_at)
        values (${key}, to_timestamp(${now / 1000}), to_timestamp(${expiresAt / 1000}), 1, now())
        on conflict (key) do update set
          window_started_at = case when rate_limit_bucket.window_expires_at <= now() then excluded.window_started_at else rate_limit_bucket.window_started_at end,
          window_expires_at = case when rate_limit_bucket.window_expires_at <= now() then excluded.window_expires_at else rate_limit_bucket.window_expires_at end,
          count = case when rate_limit_bucket.window_expires_at <= now() then 1 else rate_limit_bucket.count + 1 end,
          updated_at = now()
        returning count, greatest(1, ceil(extract(epoch from (window_expires_at - now()))))::int as retry_after_seconds
      `);
      const row = result.rows[0] as { count?: unknown; retry_after_seconds?: unknown } | undefined;
      const count = Number(row?.count ?? limit + 1);
      return { allowed: count <= limit, retryAfterSeconds: count <= limit ? 0 : Math.max(1, Number(row?.retry_after_seconds ?? Math.ceil(windowMs / 1000))) };
    } catch (error) {
      console.error(JSON.stringify({ component: "rate-limit", scope, errorClass: error instanceof Error ? error.name : "unknown" }));
      return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil(windowMs / 1000)) };
    }
  }
  const now = Date.now();
  const existing = buckets.get(key);
  const bucket = !existing || existing.resetAt <= now ? { count: 0, resetAt: now + windowMs } : existing;
  bucket.count += 1;
  buckets.set(key, bucket);
  if (bucket.count <= limit) return { allowed: true, retryAfterSeconds: 0 };
  return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)) };
}

export function resetRateLimits(): void {
  buckets.clear();
}
