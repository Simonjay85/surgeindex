import { jsonError } from "../../../../lib/server/http";

export const runtime = "nodejs";

export async function POST(request: Request) {
  return jsonError(request, 410, "stripe_webhook_gone", "Use /api/webhooks/stripe for Stripe webhook delivery.");
}
