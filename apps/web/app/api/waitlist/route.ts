import { z } from "zod";
import { getPostgresDb, waitlistEntry } from "@surge/db";
import { getServerEnv } from "@surge/config";
import { assertSameOrigin, jsonError, jsonOk } from "../../../lib/server/http";
import { checkRateLimit } from "../../../lib/server/rate-limit";

export const runtime = "nodejs";

const waitlistSchema = z.object({
  topic: z.enum(["fanward", "brand campaigns"]),
  email: z.string().trim().toLowerCase().email().max(320),
  consent: z.literal(true),
}).strict();

export async function POST(request: Request) {
  const origin = assertSameOrigin(request);
  if (!origin.ok) return origin.response;
  if (getServerEnv().DATA_PROVIDER !== "postgres") {
    return jsonError(request, 409, "demo_mode", "Waitlist signup requires production storage.");
  }
  const subject = request.headers.get("cf-connecting-ip")
    ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    ?? "local";
  const rate = checkRateLimit("waitlist", subject, 8, 60 * 60 * 1_000);
  if (!rate.allowed) return jsonError(request, 429, "rate_limited", `Too many requests. Try again in ${rate.retryAfterSeconds} seconds.`);
  const parsed = waitlistSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError(request, 422, "invalid_waitlist_entry", "Enter a valid email and accept the signup request.");

  await getPostgresDb()
    .insert(waitlistEntry)
    .values(parsed.data)
    .onConflictDoNothing({ target: [waitlistEntry.topic, waitlistEntry.email] });
  return jsonOk(request, { joined: true, topic: parsed.data.topic }, 201);
}
