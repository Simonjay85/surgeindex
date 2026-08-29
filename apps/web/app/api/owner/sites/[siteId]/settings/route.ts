import { z } from "zod";
import { and, eq, or } from "drizzle-orm";
import { adminAuditLog, category, getPostgresDb, site, siteOwner, siteTag, trackerKey } from "@surge/db";
import { getServerEnv } from "@surge/config";
import { normalizeDomain } from "@surge/shared";
import { requireVerifiedApiUser } from "../../../../../../lib/server/authorization";
import { assertSameOrigin, jsonError, jsonOk, requestId } from "../../../../../../lib/server/http";
import { authorizeSiteSettingsChange } from "../../../../../../lib/server/site-settings-policy";
import { verifyTurnstile } from "../../../../../../lib/server/turnstile";

export const runtime = "nodejs";

const paramsSchema = z.object({ siteId: z.string().uuid() });
const optionalHttpsUrl = z.string().trim().url().refine((value) => new URL(value).protocol === "https:", "Only HTTPS overrides are accepted.").nullable();
const settingsSchema = z.object({
  name: z.string().trim().min(1).max(160),
  description: z.string().trim().max(320),
  categoryId: z.string().uuid(),
  tags: z.array(z.string().trim().min(1).max(40)).max(20),
  logoUrl: optionalHttpsUrl,
  faviconUrl: optionalHttpsUrl,
  permittedAliases: z.array(z.string().trim().min(1).max(253)).max(20),
  publicRevenueVisible: z.boolean(),
  publicPageMetricsVisible: z.boolean(),
  expectedUpdatedAt: z.string().datetime({ offset: true }),
  turnstileToken: z.string().trim().max(2_048).optional(),
}).strict();

function cleanTags(tags: string[]): string[] {
  const seen = new Set<string>();
  return tags.map((tag) => tag.replace(/\s+/g, " ").trim()).filter((tag) => {
    const key = tag.toLowerCase();
    if (!tag || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function cleanAliases(aliases: string[]): string[] | null {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const alias of aliases) {
    const normalized = normalizeDomain(alias);
    if (!normalized) return null;
    if (!seen.has(normalized)) {
      seen.add(normalized);
      result.push(normalized);
    }
  }
  return result;
}

function sameDomainSet(left: string[], right: string[]): boolean {
  const normalize = (values: string[]) => [...new Set(values)].sort();
  const normalizedLeft = normalize(left);
  const normalizedRight = normalize(right);
  return normalizedLeft.length === normalizedRight.length && normalizedLeft.every((value, index) => value === normalizedRight[index]);
}

async function canEditSite(siteId: string, userId: string, role: "user" | "admin") {
  if (role === "admin") return true;
  const [membership] = await getPostgresDb()
    .select({ role: siteOwner.role })
    .from(siteOwner)
    .where(and(eq(siteOwner.siteId, siteId), eq(siteOwner.userId, userId), or(eq(siteOwner.role, "owner"), eq(siteOwner.role, "editor"))))
    .limit(1);
  return Boolean(membership);
}

export async function GET(request: Request, { params }: { params: Promise<{ siteId: string }> }) {
  const auth = await requireVerifiedApiUser(request);
  if ("response" in auth) return auth.response;
  if (getServerEnv().DATA_PROVIDER !== "postgres") return jsonError(request, 409, "demo_mode", "Listing settings are read-only in demo mode.");
  const parsedParams = paramsSchema.safeParse(await params);
  if (!parsedParams.success) return jsonError(request, 422, "invalid_site", "The site was not found.");
  if (!await canEditSite(parsedParams.data.siteId, auth.user.id, auth.user.role)) return jsonError(request, 403, "site_owner_required", "Owner access is required to edit this listing.");
  const db = getPostgresDb();
  const [record] = await db
    .select({ id: site.id, name: site.name, description: site.description, domain: site.domain, categoryId: site.categoryId, logoUrl: site.logoUrl, faviconUrl: site.faviconUrl, permittedAliases: site.permittedAliases, publicRevenueVisible: site.publicRevenueVisible, publicPageMetricsVisible: site.publicPageMetricsVisible, updatedAt: site.updatedAt })
    .from(site)
    .where(eq(site.id, parsedParams.data.siteId))
    .limit(1);
  if (!record) return jsonError(request, 404, "site_not_found", "The site was not found.");
  const [tags, categories] = await Promise.all([
    db.select({ tag: siteTag.tag }).from(siteTag).where(eq(siteTag.siteId, record.id)).orderBy(siteTag.tag),
    db.select({ id: category.id, slug: category.slug, name: category.name }).from(category).orderBy(category.name),
  ]);
  return jsonOk(request, { site: { ...record, updatedAt: record.updatedAt.toISOString(), tags: tags.map((tag) => tag.tag) }, categories });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ siteId: string }> }) {
  const origin = assertSameOrigin(request);
  if (!origin.ok) return origin.response;
  const auth = await requireVerifiedApiUser(request);
  if ("response" in auth) return auth.response;
  if (getServerEnv().DATA_PROVIDER !== "postgres") return jsonError(request, 409, "demo_mode", "Listing settings are read-only in demo mode.");
  const parsedParams = paramsSchema.safeParse(await params);
  if (!parsedParams.success) return jsonError(request, 422, "invalid_site", "The site was not found.");
  const parsed = settingsSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError(request, 422, "invalid_settings", "Review the listing fields and try again.");
  const aliases = cleanAliases(parsed.data.permittedAliases);
  if (!aliases) return jsonError(request, 422, "invalid_alias", "Each permitted alias must be a public domain.");
  const tags = cleanTags(parsed.data.tags);
  const turnstile = await verifyTurnstile(request, parsed.data.turnstileToken, "site-settings");
  if (!turnstile.ok) return jsonError(request, turnstile.code === "turnstile_configuration" ? 503 : 422, turnstile.code, "The anti-bot check could not be completed.");

  try {
    const result = await getPostgresDb().transaction(async (tx) => {
      const [before] = await tx
        .select({ id: site.id, domain: site.domain, updatedAt: site.updatedAt, name: site.name, description: site.description, categoryId: site.categoryId, logoUrl: site.logoUrl, faviconUrl: site.faviconUrl, permittedAliases: site.permittedAliases, publicRevenueVisible: site.publicRevenueVisible, publicPageMetricsVisible: site.publicPageMetricsVisible })
        .from(site)
        .where(eq(site.id, parsedParams.data.siteId))
        .limit(1)
        .for("update");
      if (!before) return { kind: "not_found" as const };
      let membershipRole: "owner" | "editor" | "admin" | "none" = auth.user.role === "admin" ? "admin" : "none";
      if (auth.user.role !== "admin") {
        const [membership] = await tx
          .select({ role: siteOwner.role })
          .from(siteOwner)
          .where(and(eq(siteOwner.siteId, before.id), eq(siteOwner.userId, auth.user.id)))
          .limit(1)
          .for("update");
        if (!membership) return { kind: "not_authorized" as const };
        membershipRole = membership.role;
      }
      const aliasesChanged = !sameDomainSet(before.permittedAliases, aliases);
      const privacyChanged = before.publicRevenueVisible !== parsed.data.publicRevenueVisible || before.publicPageMetricsVisible !== parsed.data.publicPageMetricsVisible;
      const authorization = authorizeSiteSettingsChange(membershipRole, { aliasesChanged, privacyChanged });
      if (authorization === "not_authorized") return { kind: "not_authorized" as const };
      if (authorization === "owner_required") return { kind: "owner_required" as const };
      if (before.updatedAt.getTime() !== new Date(parsed.data.expectedUpdatedAt).getTime()) return { kind: "conflict" as const, updatedAt: before.updatedAt.toISOString() };
      const [selectedCategory] = await tx.select({ id: category.id }).from(category).where(eq(category.id, parsed.data.categoryId)).limit(1);
      if (!selectedCategory) return { kind: "category_not_found" as const };
      // Keep the mutation lock order consistent with tracker-key operations:
      // site -> membership -> tracker key. This prevents a settings update
      // from racing a key rotation while aliases are being propagated.
      await tx
        .select({ id: trackerKey.id })
        .from(trackerKey)
        .where(and(eq(trackerKey.siteId, before.id), or(eq(trackerKey.status, "active"), eq(trackerKey.status, "stale"))))
        .for("update");
      const [updated] = await tx.update(site).set({ name: parsed.data.name, description: parsed.data.description, categoryId: parsed.data.categoryId, logoUrl: parsed.data.logoUrl, faviconUrl: parsed.data.faviconUrl, permittedAliases: aliases, publicRevenueVisible: parsed.data.publicRevenueVisible, publicPageMetricsVisible: parsed.data.publicPageMetricsVisible, updatedAt: new Date() }).where(eq(site.id, before.id)).returning({ updatedAt: site.updatedAt });
      await tx.update(trackerKey).set({ allowedDomains: [before.domain, ...aliases.filter((alias) => alias !== before.domain)] }).where(and(eq(trackerKey.siteId, before.id), or(eq(trackerKey.status, "active"), eq(trackerKey.status, "stale"))));
      await tx.delete(siteTag).where(eq(siteTag.siteId, before.id));
      if (tags.length) await tx.insert(siteTag).values(tags.map((tag) => ({ siteId: before.id, tag })));
      await tx.insert(adminAuditLog).values({
        actorUserId: auth.user.id,
        action: "site_listing_updated",
        targetType: "site",
        targetId: before.id,
        previousState: { name: before.name, description: before.description, categoryId: before.categoryId, logoUrl: before.logoUrl, faviconUrl: before.faviconUrl, permittedAliases: before.permittedAliases, publicRevenueVisible: before.publicRevenueVisible, publicPageMetricsVisible: before.publicPageMetricsVisible },
        newState: { name: parsed.data.name, description: parsed.data.description, categoryId: parsed.data.categoryId, logoUrl: parsed.data.logoUrl, faviconUrl: parsed.data.faviconUrl, permittedAliases: aliases, tags, publicRevenueVisible: parsed.data.publicRevenueVisible, publicPageMetricsVisible: parsed.data.publicPageMetricsVisible },
        details: { changedBy: auth.user.role === "admin" ? "admin" : "site_owner" },
        reason: "Owner listing editor update",
        requestId: requestId(request),
      });
      return { kind: "updated" as const, updatedAt: updated?.updatedAt.toISOString() ?? new Date().toISOString() };
    });
    if (result.kind === "not_found") return jsonError(request, 404, "site_not_found", "The site was not found.");
    if (result.kind === "not_authorized") return jsonError(request, 403, "site_owner_required", "Owner access is required to edit this listing.");
    if (result.kind === "owner_required") return jsonError(request, 403, "owner_required", "Only the verified site owner can change tracker domains or public disclosure settings.");
    if (result.kind === "category_not_found") return jsonError(request, 422, "category_not_found", "Choose a valid category.");
    if (result.kind === "conflict") return jsonError(request, 409, "edit_conflict", `This listing changed since you opened it. Reload before saving. Current version: ${result.updatedAt}`);
    return jsonOk(request, result);
  } catch {
    return jsonError(request, 500, "settings_update_failed", "The listing settings could not be saved.");
  }
}
