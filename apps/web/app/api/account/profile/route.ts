import { eq } from "drizzle-orm";
import { z } from "zod";
import { getPostgresDb, user } from "@surge/db";
import { requireApiUser } from "../../../../lib/server/authorization";
import { assertSameOrigin, jsonError, jsonOk } from "../../../../lib/server/http";

export const runtime = "nodejs";

const profileSchema = z.object({
  name: z.string().trim().min(1, "Enter your name.").max(100, "Name is too long."),
}).strict();

export async function PATCH(request: Request) {
  const origin = assertSameOrigin(request);
  if (!origin.ok) return origin.response;
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;
  if (auth.user.isDemo) return jsonError(request, 409, "demo_mode", "Demo profiles cannot be persisted.");
  const parsed = profileSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError(request, 422, "invalid_profile", parsed.error.issues[0]?.message ?? "Enter a valid name.");

  const [updated] = await getPostgresDb()
    .update(user)
    .set({ name: parsed.data.name, updatedAt: new Date() })
    .where(eq(user.id, auth.user.id))
    .returning({ name: user.name, email: user.email });
  if (!updated) return jsonError(request, 404, "account_not_found", "The account no longer exists.");
  return jsonOk(request, updated);
}
