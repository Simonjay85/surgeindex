import { z } from "zod";
import { getPostgresDb, waitlistEntry } from "@surge/db";
import { getServerEnv } from "@surge/config";
import { assertSameOrigin, jsonError, jsonOk } from "../../../lib/server/http";
import { checkRateLimit } from "../../../lib/server/rate-limit";
import { getTrustedClientIp } from "../../../lib/server/client-ip";
import { verifyTurnstile } from "../../../lib/server/turnstile";

export const runtime = "nodejs";

const waitlistSchema = z.object({
  topic: z.enum(["fanward", "brand campaigns"]),
  email: z.string().trim().toLowerCase().email().max(320),
  consent: z.literal(true),
  turnstileToken: z.string().trim().max(2_048).optional(),
}).strict();

export async function POST(request: Request) {
  const origin = assertSameOrigin(request);
  if (!origin.ok) return origin.response;
  if (getServerEnv().DATA_PROVIDER !== "postgres") {
    return jsonError(request, 409, "demo_mode", "Waitlist signup requires production storage.");
  }
  const subject = getTrustedClientIp(request);
  const rate = await checkRateLimit("waitlist", subject, 8, 60 * 60 * 1_000);
  if (!rate.allowed) return jsonError(request, 429, "rate_limited", `Too many requests. Try again in ${rate.retryAfterSeconds} seconds.`);
  const parsed = waitlistSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError(request, 422, "invalid_waitlist_entry", "Enter a valid email and accept the signup request.");
  const turnstile = await verifyTurnstile(request, parsed.data.turnstileToken, "waitlist");
  if (!turnstile.ok) return jsonError(request, turnstile.code === "turnstile_configuration" ? 503 : 422, turnstile.code, "The anti-bot check could not be completed.");

  await getPostgresDb()
    .insert(waitlistEntry)
    .values({ topic: parsed.data.topic, email: parsed.data.email, consent: parsed.data.consent })
    .onConflictDoNothing({ target: [waitlistEntry.topic, waitlistEntry.email] });
  return jsonOk(request, { joined: true, topic: parsed.data.topic }, 201);
}
