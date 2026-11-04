import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { closeDb, getPostgresDb, category, site, siteOwner, trackerKey, user } from "@surge/db";
import { mutateTrackerKey, revokeTrackerKey } from "../lib/server/tracker-key-service";

const mocks = vi.hoisted(() => ({
  requireVerifiedApiUser: vi.fn(),
  verifyTurnstile: vi.fn(async () => ({ ok: true as const })),
}));

vi.mock("../lib/server/authorization", () => ({ requireVerifiedApiUser: mocks.requireVerifiedApiUser }));
vi.mock("../lib/server/turnstile", () => ({ verifyTurnstile: mocks.verifyTurnstile }));

import { PATCH } from "../app/api/owner/sites/[siteId]/settings/route";

const enabled = process.env.RUN_DB_TESTS === "1" && process.env.APP_MODE === "production" && process.env.DATA_PROVIDER === "postgres" && Boolean(process.env.DATABASE_URL);
const suffix = Date.now().toString(36);
const ownerId = `settings-race-owner-${suffix}`;
const categoryId = crypto.randomUUID();
let siteId = "";

async function settingsPatch(expectedUpdatedAt: string, aliases: string[]) {
  return PATCH(new Request("https://ci.surgeindex.invalid/api/owner/sites/settings", {
    method: "PATCH",
    headers: { "content-type": "application/json", "x-request-id": `settings-race-${suffix}` },
    body: JSON.stringify({
      name: "Settings race fixture",
      description: "",
      categoryId,
      tags: [],
      logoUrl: null,
      faviconUrl: null,
      permittedAliases: aliases,
      publicRevenueVisible: false,
      publicPageMetricsVisible: false,
      expectedUpdatedAt,
      turnstileToken: "fixture-turnstile-token",
    }),
  }), { params: Promise.resolve({ siteId }) });
}

describe.skipIf(!enabled)("site settings and tracker-key concurrency", () => {
  beforeAll(async () => {
    const db = getPostgresDb();
    await db.insert(category).values({ id: categoryId, slug: `settings-race-${suffix}`, name: "Settings race fixtures", description: "" });
    await db.insert(user).values({ id: ownerId, name: "Settings Race Owner", email: `${ownerId}@example.com`, emailVerified: true });
    const [created] = await db.insert(site).values({ id: crypto.randomUUID(), slug: `settings-race-${suffix}`, domain: `settings-race-${suffix}.example.com`, name: "Settings race fixture", description: "", categoryId, status: "active", ownership: "claimed", isDemo: false, permittedAliases: [`www.settings-race-${suffix}.example.com`] }).returning({ id: site.id });
    siteId = created.id;
    await db.insert(siteOwner).values({ siteId, userId: ownerId, role: "owner" });
    mocks.requireVerifiedApiUser.mockResolvedValue({ user: { id: ownerId, role: "user", emailVerified: true, isDemo: false } });
  });

  afterAll(async () => {
    const db = getPostgresDb();
    if (siteId) await db.delete(site).where(eq(site.id, siteId));
    await db.delete(category).where(eq(category.id, categoryId));
    await db.delete(user).where(eq(user.id, ownerId));
    await closeDb();
  });

  it("keeps an actual alias PATCH and rotate in one lock order", async () => {
    const db = getPostgresDb();
    const initial = await mutateTrackerKey({ userId: ownerId, siteId, action: "generate" });
    expect(initial.status).toBe("waiting");
    const [before] = await db.select({ updatedAt: site.updatedAt }).from(site).where(eq(site.id, siteId));
    expect(before).toBeTruthy();
    const aliases = [`app.settings-race-${suffix}.example.com`];
    const [settingsResult, rotateResult] = await Promise.allSettled([
      settingsPatch(before!.updatedAt.toISOString(), aliases),
      mutateTrackerKey({ userId: ownerId, siteId, action: "rotate" }),
    ]);
    expect(settingsResult.status).toBe("fulfilled");
    expect(settingsResult.status === "fulfilled" ? settingsResult.value.status : 500).toBe(200);
    expect(rotateResult.status).toBe("fulfilled");

    const [updatedSite] = await db.select({ domain: site.domain, permittedAliases: site.permittedAliases }).from(site).where(eq(site.id, siteId));
    const activeKeys = await db.select({ status: trackerKey.status, allowedDomains: trackerKey.allowedDomains }).from(trackerKey).where(eq(trackerKey.siteId, siteId)).then((rows) => rows.filter((row) => row.status === "active"));
    expect(updatedSite?.permittedAliases).toEqual(aliases);
    expect(activeKeys).toHaveLength(1);
    expect(activeKeys[0]?.allowedDomains).toEqual([updatedSite!.domain, ...aliases]);
  });

  it("keeps a second alias PATCH and revoke deterministic", async () => {
    const db = getPostgresDb();
    const rotated = await mutateTrackerKey({ userId: ownerId, siteId, action: "rotate" });
    expect(rotated.status).toBe("waiting");
    const [before] = await db.select({ updatedAt: site.updatedAt }).from(site).where(eq(site.id, siteId));
    const aliases = [`checkout.settings-race-${suffix}.example.com`];
    const [settingsResult, revokeResult] = await Promise.allSettled([
      settingsPatch(before!.updatedAt.toISOString(), aliases),
      revokeTrackerKey(ownerId, siteId),
    ]);
    expect(settingsResult.status).toBe("fulfilled");
    expect(settingsResult.status === "fulfilled" ? settingsResult.value.status : 500).toBe(200);
    expect(revokeResult.status).toBe("fulfilled");

    const [updatedSite] = await db.select({ permittedAliases: site.permittedAliases }).from(site).where(eq(site.id, siteId));
    const keys = await db.select({ status: trackerKey.status }).from(trackerKey).where(eq(trackerKey.siteId, siteId));
    expect(updatedSite?.permittedAliases).toEqual(aliases);
    expect(keys.filter((key) => key.status === "active")).toHaveLength(0);
    expect(keys.every((key) => key.status === "revoked")).toBe(true);
  });
});
