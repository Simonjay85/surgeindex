import { NextResponse } from "next/server";
import { z } from "zod";

const eventSchema = z.object({
  eventId: z.string().uuid(),
  eventType: z.enum(["pageview", "session_start", "heartbeat", "engaged", "session_end"]),
  siteKey: z.string().min(8).max(64),
  visitorId: z.string().min(8).max(64),
  sessionId: z.string().min(8).max(64),
  pathname: z.string().max(512).default("/"),
  referrerHost: z.string().max(253).optional(),
  occurredAt: z.string().datetime().optional(),
  viewport: z.string().max(32).optional(),
  locale: z.string().max(16).optional(),
});

export async function POST(request: Request) {
  const parsed = eventSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid payload" }, { status: 422 });
  // Demo collector validates the contract and returns quickly. The production
  // worker adds origin allow-listing, rotating IP hashing, anti-fraud checks,
  // and queue publication before returning the same accepted response.
  return NextResponse.json({ accepted: true, receivedAt: "2026-08-23T10:30:00.000Z", source: "demo" }, { status: 202, headers: { "Cache-Control": "no-store" } });
}
