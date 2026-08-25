import { z } from "zod";
import { getServerEnv } from "@surge/config";
import { getPostgresDb, reviewClaim } from "@surge/db";
import { requireApiAdmin } from "../../../../../../lib/server/authorization";
import { assertSameOrigin, jsonError, jsonOk, requestId } from "../../../../../../lib/server/http";

export const runtime = "nodejs";

const paramsSchema = z.object({ claimId: z.string().uuid() });
const bodySchema = z.object({
  action: z.enum(["reject", "expire"]),
  reason: z.string().trim().min(3).max(500),
  confirm: z.literal(true),
}).strict();

export async function POST(request: Request, { params }: { params: Promise<{ claimId: string }> }) {
  const origin = assertSameOrigin(request);
  if (!origin.ok) return origin.response;
  const auth = await requireApiAdmin(request);
  if ("response" in auth) return auth.response;
  if (getServerEnv().APP_MODE !== "production" || getServerEnv().DATA_PROVIDER !== "postgres") return jsonError(request, 409, "demo_mode", "Claim review mutations are disabled in demo mode.");
  const parsedParams = paramsSchema.safeParse(await params);
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsedParams.success || !parsed.success) return jsonError(request, 422, "invalid_payload", "A claim, explicit action, confirmation, and reason are required.");
  const id = requestId(request);
  const result = await reviewClaim(getPostgresDb(), { claimId: parsedParams.data.claimId, adminUserId: auth.user.id, action: parsed.data.action, reason: parsed.data.reason, requestId: id });
  if (!result) return jsonError(request, 404, "claim_not_found", "The claim review record was not found.");
  return jsonOk(request, { reviewed: true, auditId: result.auditId, requestId: id });
}
