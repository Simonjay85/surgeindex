import { createHash, randomUUID } from "node:crypto";
import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { resolveTipsDataDir } from "../live/paths";
import { toVnIso } from "../live/types";
import type { StoredTip, TipInput } from "./schema";

export const TIPS_FILE = "tips.jsonl";

export function hashIp(ip: string, salt = process.env.BETTER_AUTH_SECRET ?? "surgeindex-tips"): string {
  return createHash("sha256").update(`tip:${ip}:${salt}`).digest("hex").slice(0, 24);
}

export async function storeTip(input: TipInput, ip: string, now = Date.now(), dir = resolveTipsDataDir()): Promise<StoredTip> {
  const tip: StoredTip = {
    id: randomUUID(),
    received_at: toVnIso(now),
    topic: input.topic,
    source_url: input.sourceUrl,
    ...(input.note ? { note: input.note } : {}),
    ...(input.email ? { email: input.email } : {}),
    ...(input.page ? { page: input.page } : {}),
    ip_hash: hashIp(ip),
    status: "new",
  };
  await mkdir(dir, { recursive: true });
  await appendFile(path.join(dir, TIPS_FILE), `${JSON.stringify(tip)}\n`, { mode: 0o640 });
  return tip;
}

/** Simple fixed-window limiter (single Next.js process on the VPS; resets on restart). */
const buckets = new Map<string, { count: number; resetAt: number }>();

export function tipRateLimit(subject: string, limit = 5, windowMs = 60 * 60 * 1000, now = Date.now()): { allowed: boolean; retryAfterSeconds: number } {
  if (buckets.size > 5000) for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k);
  const key = hashIp(subject);
  const cur = buckets.get(key);
  const bucket = !cur || cur.resetAt <= now ? { count: 0, resetAt: now + windowMs } : cur;
  bucket.count++;
  buckets.set(key, bucket);
  return bucket.count <= limit ? { allowed: true, retryAfterSeconds: 0 } : { allowed: false, retryAfterSeconds: Math.ceil((bucket.resetAt - now) / 1000) };
}

export function resetTipRateLimit(): void {
  buckets.clear();
}
