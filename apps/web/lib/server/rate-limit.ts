import "server-only";

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

/**
 * Process-local limiter for the MVP. It protects a single Node instance now;
 * a distributed deployment should move the same key/window contract to the
 * configured edge or database rate-limit store before horizontal scaling.
 */
export function checkRateLimit(scope: string, subject: string, limit: number, windowMs: number): { allowed: boolean; retryAfterSeconds: number } {
  const key = `${scope}:${subject}`;
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
