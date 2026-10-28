import { jsonOk } from "../../../../lib/server/http";
import { listBoostPlacements } from "../../../../lib/server/boost-config";

export const runtime = "nodejs";

export async function GET(request: Request) {
  return jsonOk(request, { placements: listBoostPlacements() }, 200, { "Cache-Control": "private, max-age=60" });
}
