import { StripeServiceError, processStripeWebhook } from "../../../../lib/server/stripe-service";
import { jsonError, jsonOk, requestId } from "../../../../lib/server/http";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const rawBody = await request.text();
  try {
    const result = await processStripeWebhook({ rawBody, signature: request.headers.get("stripe-signature"), requestId: requestId(request) });
    return jsonOk(request, result);
  } catch (error) {
    if (error instanceof StripeServiceError) return jsonError(request, error.status, error.code, error.message);
    console.error(JSON.stringify({ component: "stripe-webhook", event: "processing_failed", requestId: requestId(request), errorClass: error instanceof Error ? error.name : "unknown" }));
    return jsonError(request, 500, "stripe_webhook_failed", "The payment event could not be processed.");
  }
}
