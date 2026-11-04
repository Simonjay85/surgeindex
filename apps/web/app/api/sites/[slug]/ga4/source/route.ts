import { z } from "zod";
import { getServerEnv } from "@surge/config";
import { requireApiUser } from "../../../../../../lib/server/authorization";
import { assertSameOrigin, jsonError, jsonOk } from "../../../../../../lib/server/http";
import { Ga4ServiceError, switchPrimaryGa4Source } from "../../../../../../lib/server/ga4-service";

export const runtime = "nodejs";

const paramsSchema = z.object({ slug: z.string().uuid() });
const bodySchema = z.object({
  source: z.enum(["tracker", "ga4"]),
  reason: z.string().trim().min(10).max(500),
});

export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const origin = assertSameOrigin(request);
  if (!origin.ok) return origin.response;
  if (getServerEnv().APP_MODE !== "production" || getServerEnv().DATA_PROVIDER !== "postgres") {
    return jsonError(request, 409, "demo_mode", "Ranking-source changes are disabled in demo mode.");
  }
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;
  const parsedParams = paramsSchema.safeParse(await params);
  const body = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsedParams.success || !body.success) return jsonError(request, 422, "invalid_source_transition", "Choose a source and provide a reason of at least 10 characters.");
  try {
    return jsonOk(request, await switchPrimaryGa4Source({
      userId: auth.user.id,
      siteId: parsedParams.data.slug,
      source: body.data.source,
      reason: body.data.reason,
      requestId: request.headers.get("x-request-id") ?? crypto.randomUUID(),
    }));
  } catch (error) {
    if (error instanceof Ga4ServiceError) return jsonError(request, error.status, error.code, error.message);
    console.error(JSON.stringify({ component: "ga4-source", event: "transition_failed", errorClass: error instanceof Error ? error.name : "unknown" }));
    return jsonError(request, 500, "source_transition_failed", "The ranking source could not be changed.");
  }
}
