import { getLatestSnapshot } from "../../../lib/trends/read";

export const revalidate = 300;

export async function GET() {
  const snapshot = await getLatestSnapshot();
  if (!snapshot) return Response.json({ error: "No snapshot yet" }, { status: 503 });
  return Response.json(snapshot, { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" } });
}
