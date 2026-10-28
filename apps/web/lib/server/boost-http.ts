import { BoostServiceError } from "./boost-service";
import { StripeServiceError } from "./stripe-service";
import { jsonError } from "./http";

export function boostErrorResponse(request: Request, error: unknown) {
  if (error instanceof BoostServiceError || error instanceof StripeServiceError) {
    return jsonError(request, error.status, error.code, error.message);
  }
  return jsonError(request, 500, "boost_request_failed", "The Boost request could not be completed.");
}
