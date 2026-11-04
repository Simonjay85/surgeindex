import { getLatestSnapshot } from "../../../lib/trends/read";
import { compactSnapshot } from "../../../lib/trends/types";

export const revalidate = 300;

/** Compact latest snapshot (every board and item). Full detail: /api/trends/full. */
export async function GET() {
  const snapshot = await getLatestSnapshot();
  if (!snapshot) return Response.json({ error: "No snapshot yet" }, { status: 503 });
  return Response.json(compactSnapshot(snapshot), { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" } });
}
