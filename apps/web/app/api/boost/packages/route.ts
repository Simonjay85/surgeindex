import { jsonOk } from "../../../../lib/server/http";
import { listBoostPackages } from "../../../../lib/server/boost-config";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const packages = listBoostPackages().map((item) => ({
    id: item.id,
    name: item.name,
    description: item.description,
    currency: item.currency,
    amountCents: item.amountCents,
    targetQualifiedImpressions: item.targetQualifiedImpressions,
    eligiblePlacements: item.eligiblePlacements,
    eligibleCategories: item.eligibleCategories,
    defaultDurationDays: item.defaultDurationDays,
    maximumDurationDays: item.maximumDurationDays,
    active: item.active,
    displayOrder: item.displayOrder,
    checkoutConfigured: Boolean(item.stripePriceId),
  }));
  return jsonOk(request, { packages }, 200, { "Cache-Control": "private, max-age=60" });
}
