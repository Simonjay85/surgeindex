import { NextResponse } from "next/server";
import { getServerEnv } from "@surge/config";
import { assertSameOrigin } from "../../../lib/server/http";
import { getTrustedClientIp } from "../../../lib/server/client-ip";
import { verifyTurnstile } from "../../../lib/server/turnstile";
import { sendTransactionalEmail } from "../../../lib/server/email";
import { tipSchema } from "../../../lib/tips/schema";
import { storeTip, tipRateLimit } from "../../../lib/tips/store";

export const runtime = "nodejs";

const NOTIFY_DEFAULT = "simonjay0805@gmail.com";

function fail(status: number, code: string, message: string, headers?: HeadersInit) {
  return NextResponse.json({ error: { code, message } }, { status, headers: { "Cache-Control": "no-store", ...headers } });
}

/** True when the existing Resend (EMAIL_PROVIDER=http) setup is complete. */
function emailConfigured(): boolean {
  try {
    const env = getServerEnv();
    return env.EMAIL_PROVIDER === "http" && Boolean(env.EMAIL_HTTP_URL && env.EMAIL_HTTP_API_KEY && env.EMAIL_FROM);
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  const origin = assertSameOrigin(request);
  if (!origin.ok) return origin.response;
  const ip = getTrustedClientIp(request);
  // Without a trusted proxy every caller is "unknown": keep a looser shared bucket (Turnstile still applies).
  const rate = ip === "unknown" ? tipRateLimit(ip, 30) : tipRateLimit(ip);
  if (!rate.allowed) return fail(429, "rate_limited", `Bạn gửi hơi nhanh. Thử lại sau ${Math.ceil(rate.retryAfterSeconds / 60)} phút nhé.`, { "Retry-After": String(rate.retryAfterSeconds) });

  const parsed = tipSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(422, "invalid_tip", parsed.error.issues[0]?.message ?? "Thông tin chưa hợp lệ.");
  const input = parsed.data;
  // Honeypot filled: pretend success, store nothing.
  if (input.website) return NextResponse.json({ ok: true }, { status: 201 });

  const turnstile = await verifyTurnstile(request, input.turnstileToken, "tip");
  if (!turnstile.ok) return fail(turnstile.code === "turnstile_configuration" ? 503 : 422, turnstile.code, "Chưa xác minh được bạn không phải bot. Vui lòng thử lại.");

  let tip;
  try {
    tip = await storeTip(input, ip);
  } catch (e) {
    console.error(JSON.stringify({ component: "tips", error: (e as Error).message }));
    return fail(500, "store_failed", "Chưa lưu được tin. Vui lòng thử lại sau.");
  }

  if (emailConfigured()) {
    const to = process.env.TIPS_NOTIFY_EMAIL?.trim() || NOTIFY_DEFAULT;
    const lines = [
      `Chủ đề: ${tip.topic}`,
      `Link nguồn: ${tip.source_url}`,
      tip.note ? `Ghi chú: ${tip.note}` : null,
      tip.email ? `Email người gửi: ${tip.email}` : "Email người gửi: (không để lại)",
      tip.page ? `Gửi từ trang: ${tip.page}` : null,
      `Thời gian: ${tip.received_at}`,
      `ID: ${tip.id}`,
      "",
      "Tin chưa được xác minh. Không tự động đăng — kiểm tra nguồn trước khi dùng.",
    ].filter((l): l is string => l !== null);
    try {
      await sendTransactionalEmail({ to, subject: `[SurgeIndex] Tin nóng mới: ${tip.topic.slice(0, 80)}`, text: lines.join("\n") });
    } catch (e) {
      console.error(JSON.stringify({ component: "tips", email: "failed", error: (e as Error).message }));
    }
  }

  return NextResponse.json({ ok: true, id: tip.id }, { status: 201, headers: { "Cache-Control": "no-store" } });
}
