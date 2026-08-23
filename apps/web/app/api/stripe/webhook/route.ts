import { boostErrorResponse } from "../../../../lib/server/boost-http";
import { jsonOk, requestId } from "../../../../lib/server/http";
import { processStripeWebhook } from "../../../../lib/server/stripe-service";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const rawBody = await request.text();
  try {
    const result = await processStripeWebhook({ rawBody, signature: request.headers.get("stripe-signature"), requestId: requestId(request) });
    return jsonOk(request, result);
  } catch (error) {
    return boostErrorResponse(request, error);
  }
}
