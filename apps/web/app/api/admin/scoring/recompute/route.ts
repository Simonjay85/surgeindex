import { z } from "zod";
import { getServerEnv } from "@surge/config";
import { requireApiAdmin } from "../../../../../lib/server/authorization";
import { assertSameOrigin, jsonError, jsonOk } from "../../../../../lib/server/http";
import { recomputeSite, runAllScoringJobs } from "../../../../../lib/server/ranking-engine";

export const runtime = "nodejs";

const bodySchema = z.object({
  siteId: z.string().uuid().optional(),
  rebuildBaseline: z.boolean().default(true),
});

export async function POST(request: Request) {
  const origin = assertSameOrigin(request);
  if (!origin.ok) return origin.response;
  if (getServerEnv().DATA_PROVIDER === "demo") return jsonError(request, 409, "demo_mode", "Scoring mutations are disabled in demo mode.");
  const auth = await requireApiAdmin(request);
  if ("response" in auth) return auth.response;
  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return jsonError(request, 422, "invalid_payload", "The scoring recompute payload is invalid.");
  try {
    const result = parsed.data.siteId
      ? await recomputeSite(parsed.data.siteId, { rebuildBaseline: parsed.data.rebuildBaseline })
      : await runAllScoringJobs();
    return jsonOk(request, { requestedBy: auth.user.id, result });
  } catch {
    return jsonError(request, 503, "scoring_recompute_failed", "The scoring recompute could not be completed.");
  }
}
