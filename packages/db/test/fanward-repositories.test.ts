import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { and, eq, inArray } from "drizzle-orm";
import {
  adminAuditLog,
  category,
  closeDb,
  creatorProfile,
  FANWARD_SITEMAP_MAX_ENTRIES,
  findPublicFanwardCreatorBySlug,
  getFanwardOwnerWorkspace,
  getPostgresDb,
  listFanwardAdminQueue,
  listPublicFanwardCreators,
  listPublicFanwardSitemapEntries,
  reviewFanwardProfile,
  saveFanwardDraft,
  site,
  siteOwner,
  submitFanwardDraft,
  user,
  type PostgresDatabase,
} from "../src/index";

const enabled = process.env.RUN_DB_TESTS === "1" && Boolean(process.env.DATABASE_URL);
const suffix = Date.now().toString(36);
const ownerA = `fanward-owner-a-${suffix}`;
const ownerB = `fanward-owner-b-${suffix}`;
const admin = `fanward-admin-${suffix}`;
let db: PostgresDatabase;
let categoryId = "";
const siteIds: string[] = [];

async function createEligibleSite(ownerUserId: string, marker: string) {
  const [created] = await db
    .insert(site)
    .values({
      slug: `fanward-${marker}-${suffix}`,
      domain: `fanward-${marker}-${suffix}.example.com`,
      name: `Fanward ${suffix} ${marker.toUpperCase()}`,
      categoryId,
      status: "active",
      ownership: "claimed",
      verification: "tracker",
      isDemo: false,
    })
    .returning({ id: site.id });
  siteIds.push(created.id);
  await db.insert(siteOwner).values({ siteId: created.id, userId: ownerUserId, role: "owner" });
  return created.id;
}

async function createAndPublish(ownerUserId: string, siteId: string, marker: string) {
  const saved = await saveFanwardDraft(db, {
    userId: ownerUserId,
    slug: `fanward-creator-${marker}-${suffix}`,
    primarySiteId: siteId,
    displayName: `Fanward ${suffix} ${marker.toUpperCase()}`,
    headline: "Verified independent creator",
    bio: "This integration fixture has enough truthful biography copy for review.",
    categoryId,
  });
  expect(saved.ok).toBe(true);
  if (!saved.ok) throw new Error(saved.reason);
  const savedWorkspace = await getFanwardOwnerWorkspace(db, ownerUserId);
  const submitted = await submitFanwardDraft(db, {
    userId: ownerUserId,
    expectedUpdatedAt: savedWorkspace.profile!.updatedAt,
  });
  expect(submitted.ok).toBe(true);
  if (!submitted.ok) throw new Error(submitted.reason);
  const approved = await reviewFanwardProfile(db, {
    adminUserId: admin,
    profileId: saved.profileId,
    revisionId: submitted.revisionId,
    action: "approve",
    reason: "Approved integration fixture",
    requestId: `fanward-approve-${marker}-${suffix}`,
  });
  expect(approved.ok).toBe(true);
  return { profileId: saved.profileId, slug: `fanward-creator-${marker}-${suffix}` };
}

describe("Fanward sitemap repository query", () => {
  it("selects only sitemap fields and enforces one fixed bounded query", async () => {
    const publishedAt = new Date("2026-08-30T01:02:03.000Z");
    const rows = [{ slug: "bounded-creator", publishedAt }];
    const query = {
      from: vi.fn(),
      innerJoin: vi.fn(),
      where: vi.fn(),
      orderBy: vi.fn(),
      limit: vi.fn().mockResolvedValue(rows),
    };
    query.from.mockReturnValue(query);
    query.innerJoin.mockReturnValue(query);
    query.where.mockReturnValue(query);
    query.orderBy.mockReturnValue(query);
    const select = vi.fn().mockReturnValue(query);

    const result = await listPublicFanwardSitemapEntries({ select } as unknown as PostgresDatabase);

    expect(FANWARD_SITEMAP_MAX_ENTRIES).toBe(5_000);
    expect(FANWARD_SITEMAP_MAX_ENTRIES).toBeLessThanOrEqual(5_000);
    expect(select).toHaveBeenCalledOnce();
    expect(Object.keys(select.mock.calls[0]![0])).toEqual(["slug", "publishedAt"]);
    expect(query.innerJoin).toHaveBeenCalledTimes(3);
    expect(query.orderBy).toHaveBeenCalledWith(expect.anything(), expect.anything());
    expect(query.limit).toHaveBeenCalledOnce();
    expect(query.limit).toHaveBeenCalledWith(FANWARD_SITEMAP_MAX_ENTRIES);
    expect(result).toEqual(rows);
  });
});

describe.skipIf(!enabled)("Fanward PostgreSQL repositories", () => {
  beforeAll(async () => {
    db = getPostgresDb();
    const [createdCategory] = await db
      .insert(category)
      .values({ slug: `fanward-${suffix}`, name: `Fanward ${suffix}`, description: "" })
      .returning({ id: category.id });
    categoryId = createdCategory.id;
    await db.insert(user).values([
      { id: ownerA, name: "Fanward Owner A", email: `${ownerA}@example.com`, emailVerified: true },
      { id: ownerB, name: "Fanward Owner B", email: `${ownerB}@example.com`, emailVerified: true },
      { id: admin, name: "Fanward Admin", email: `${admin}@example.com`, emailVerified: true, role: "admin" },
    ]);
  });

  afterAll(async () => {
    if (!db) return;
    if (siteIds.length) await db.delete(site).where(inArray(site.id, siteIds));
    if (categoryId) await db.delete(category).where(eq(category.id, categoryId));
    await db.delete(user).where(inArray(user.id, [ownerA, ownerB, admin]));
    await closeDb();
  });

  it("serializes draft/submit, preserves publication during edits, and enforces suspended review policy", async () => {
    const siteA = await createEligibleSite(ownerA, "a");
    const firstSave = await saveFanwardDraft(db, {
      userId: ownerA,
      slug: `fanward-creator-a-${suffix}`,
      primarySiteId: siteA,
      displayName: `Fanward ${suffix} A`,
      headline: "Verified independent creator",
      bio: "This integration fixture has enough truthful biography copy for review.",
      categoryId,
    });
    expect(firstSave.ok).toBe(true);
    if (!firstSave.ok) return;

    const initialWorkspace = await getFanwardOwnerWorkspace(db, ownerA);
    expect(initialWorkspace.primarySite?.eligibility).toEqual({ eligible: true, reason: null });
    const staleSave = await saveFanwardDraft(db, {
      userId: ownerA,
      slug: `ignored-${suffix}`,
      primarySiteId: siteA,
      displayName: `Fanward ${suffix} A`,
      headline: "Verified independent creator",
      bio: "This integration fixture has enough truthful biography copy for review.",
      categoryId,
      expectedUpdatedAt: new Date(0),
    });
    expect(staleSave).toMatchObject({ ok: false, reason: "edit_conflict" });

    const competingSubmits = await Promise.all([
      submitFanwardDraft(db, { userId: ownerA, expectedUpdatedAt: initialWorkspace.profile!.updatedAt }),
      submitFanwardDraft(db, { userId: ownerA, expectedUpdatedAt: initialWorkspace.profile!.updatedAt }),
    ]);
    expect(competingSubmits.filter((result) => result.ok)).toHaveLength(1);
    expect(competingSubmits.filter((result) => !result.ok)).toHaveLength(1);
    const submitted = competingSubmits.find((result) => result.ok);
    if (!submitted?.ok) return;

    const approved = await reviewFanwardProfile(db, {
      adminUserId: admin,
      profileId: firstSave.profileId,
      revisionId: submitted.revisionId,
      action: "approve",
      reason: "Approved first creator revision",
      requestId: `fanward-approve-a-${suffix}`,
    });
    expect(approved).toMatchObject({ ok: true, profileStatus: "active", revisionStatus: "published" });
    expect(await findPublicFanwardCreatorBySlug(db, `fanward-creator-a-${suffix}`)).not.toBeNull();

    const activeWorkspace = await getFanwardOwnerWorkspace(db, ownerA);
    expect(activeWorkspace.revisions.some((revision) => revision.status === "draft")).toBe(false);
    const edit = await saveFanwardDraft(db, {
      userId: ownerA,
      slug: `ignored-active-${suffix}`,
      primarySiteId: siteA,
      displayName: `Fanward ${suffix} A`,
      headline: "Updated verified creator headline",
      bio: "This updated creator biography remains private until an administrator approves it.",
      categoryId,
      expectedUpdatedAt: activeWorkspace.profile!.updatedAt,
    });
    expect(edit.ok).toBe(true);
    const editingWorkspace = await getFanwardOwnerWorkspace(db, ownerA);
    expect(editingWorkspace.profile!.updatedAt.getTime()).toBeGreaterThan(activeWorkspace.profile!.updatedAt.getTime());
    expect(editingWorkspace.profile?.status).toBe("active");
    expect(editingWorkspace.revisions.some((revision) => revision.status === "published")).toBe(true);
    expect(editingWorkspace.revisions.some((revision) => revision.status === "draft")).toBe(true);
    expect((await findPublicFanwardCreatorBySlug(db, `fanward-creator-a-${suffix}`))?.revision.headline).toBe("Verified independent creator");

    const pendingEdit = await submitFanwardDraft(db, { userId: ownerA, expectedUpdatedAt: editingWorkspace.profile!.updatedAt });
    expect(pendingEdit.ok).toBe(true);
    if (!pendingEdit.ok) return;
    const suspended = await reviewFanwardProfile(db, {
      adminUserId: admin,
      profileId: firstSave.profileId,
      action: "suspend",
      reason: "Suspend while reviewing ownership state",
      requestId: `fanward-suspend-a-${suffix}`,
    });
    expect(suspended).toMatchObject({ ok: true, profileStatus: "suspended" });
    expect(await findPublicFanwardCreatorBySlug(db, `fanward-creator-a-${suffix}`)).toBeNull();
    const blockedApprove = await reviewFanwardProfile(db, {
      adminUserId: admin,
      profileId: firstSave.profileId,
      revisionId: pendingEdit.revisionId,
      action: "approve",
      reason: "Must not implicitly restore suspension",
      requestId: `fanward-blocked-approve-${suffix}`,
    });
    expect(blockedApprove).toEqual({ ok: false, reason: "invalid_transition" });

    const siteB = await createEligibleSite(ownerB, "b");
    const creatorB = await createAndPublish(ownerB, siteB, "b");
    const suspendedQueue = await listFanwardAdminQueue(db, { query: suffix, limit: 1, offset: 0 });
    const secondPage = await listFanwardAdminQueue(db, { query: suffix, limit: 1, offset: 1 });
    expect(suspendedQueue.total).toBe(2);
    expect(suspendedQueue.items[0]?.profile.status).toBe("suspended");
    expect(new Set([...suspendedQueue.items, ...secondPage.items].map((item) => item.profile.id)).size).toBe(2);
    expect(secondPage.items[0]?.profile.id).toBe(creatorB.profileId);

    const rejectedWhileSuspended = await reviewFanwardProfile(db, {
      adminUserId: admin,
      profileId: firstSave.profileId,
      revisionId: pendingEdit.revisionId,
      action: "reject",
      reason: "Reject the edit while keeping the published profile hidden",
      requestId: `fanward-reject-suspended-${suffix}`,
    });
    expect(rejectedWhileSuspended).toMatchObject({ ok: true, profileStatus: "suspended", revisionStatus: "rejected" });
    expect(await findPublicFanwardCreatorBySlug(db, `fanward-creator-a-${suffix}`)).toBeNull();

    const restored = await reviewFanwardProfile(db, {
      adminUserId: admin,
      profileId: firstSave.profileId,
      action: "restore",
      reason: "Eligibility was reconfirmed",
      requestId: `fanward-restore-a-${suffix}`,
    });
    expect(restored).toMatchObject({ ok: true, profileStatus: "active", revisionStatus: "published" });
    expect(await findPublicFanwardCreatorBySlug(db, `fanward-creator-a-${suffix}`)).not.toBeNull();

    const sitemapEntries = (await listPublicFanwardSitemapEntries(db))
      .filter((entry) => entry.slug.endsWith(`-${suffix}`));
    expect(sitemapEntries.map((entry) => entry.slug)).toEqual(expect.arrayContaining([
      `fanward-creator-a-${suffix}`,
      `fanward-creator-b-${suffix}`,
    ]));
    expect(sitemapEntries).toHaveLength(2);
    expect(sitemapEntries[0]!.publishedAt.getTime()).toBeGreaterThanOrEqual(sitemapEntries[1]!.publishedAt.getTime());

    const firstPublicPage = await listPublicFanwardCreators(db, { query: suffix, limit: 1 });
    expect(firstPublicPage.hasMore).toBe(true);
    const cursorCreator = firstPublicPage.creators[0]!;
    const nextPublicPage = await listPublicFanwardCreators(db, {
      query: suffix,
      limit: 1,
      cursor: { publishedAt: cursorCreator.revision.publishedAt!, profileId: cursorCreator.profile.id },
    });
    expect(nextPublicPage.creators[0]?.profile.id).not.toBe(cursorCreator.profile.id);

    const audits = await db
      .select({ action: adminAuditLog.action, targetId: adminAuditLog.targetId })
      .from(adminAuditLog)
      .where(and(eq(adminAuditLog.targetId, firstSave.profileId), eq(adminAuditLog.action, "fanward_suspend")));
    expect(audits).toHaveLength(1);
  });
});
