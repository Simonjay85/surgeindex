import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import {
  closeDb,
  createClaim,
  createPendingSite,
  findSiteById,
  getPostgresDb,
  listActivity,
  listActivityForUser,
  listClaimReviews,
  listAuditLog,
  listSitesForOwner,
  moderateSite,
  completeClaim,
  type PostgresDatabase,
  site,
  category,
  user,
} from "../src/index";

const enabled = process.env.RUN_DB_TESTS === "1" && Boolean(process.env.DATABASE_URL);
const suffix = Date.now().toString(36);
const userA = `batch2-user-a-${suffix}`;
const userB = `batch2-user-b-${suffix}`;
const admin = `batch2-admin-${suffix}`;
let siteId = "";
let categoryId = "";
let claimId = "";

describe.skipIf(!enabled)("PostgreSQL repository integration", () => {
  let db: PostgresDatabase;

  beforeAll(async () => {
    db = getPostgresDb();
    const [cat] = await db.insert(category).values({ slug: `batch2-${suffix}`, name: "Batch 2 Test", description: "" }).returning({ id: category.id });
    categoryId = cat.id;
    await db.insert(user).values([
      { id: userA, name: "User A", email: `${userA}@example.com` },
      { id: userB, name: "User B", email: `${userB}@example.com` },
      { id: admin, name: "Admin", email: `${admin}@example.com`, role: "admin" },
    ]);
  });

  afterAll(async () => {
    if (!db) return;
    if (siteId) await db.delete(site).where(eq(site.id, siteId));
    if (categoryId) await db.delete(category).where(eq(category.id, categoryId));
    await db.delete(user).where(eq(user.id, userA));
    await db.delete(user).where(eq(user.id, userB));
    await db.delete(user).where(eq(user.id, admin));
    await closeDb();
  });

  it("persists moderation, activity, claims, owner access, and conflict rules", async () => {
    const created = await createPendingSite(db, {
      domain: `batch2-${suffix}.example.com`,
      slug: `batch2-${suffix}`,
      name: "Batch 2 Site",
      description: "A repository integration fixture.",
      categoryId,
      submittedByUserId: userA,
      requestId: `req-submit-${suffix}`,
    });
    expect(created.duplicate).toBe(false);
    if (created.duplicate) return;
    siteId = created.siteId;
    expect((await findSiteById(db, siteId))?.status).toBe("pending");
    expect((await listSitesForOwner(db, userA)).some((row) => row.id === siteId)).toBe(true);
    expect((await listActivityForUser(db, userA)).some((row) => row.siteId === siteId && row.type === "site_submitted")).toBe(true);
    expect((await listActivityForUser(db, userB)).some((row) => row.siteId === siteId)).toBe(false);

    expect(await moderateSite(db, { siteId, adminUserId: admin, action: "approve", reason: "Fixture approved", requestId: `req-approve-${suffix}` })).toBe(true);
    expect((await findSiteById(db, siteId))?.status).toBe("active");

    const started = await createClaim(db, { siteId, userId: userA, method: "meta_tag", token: `token-${suffix}`, expiresAt: new Date(Date.now() + 60_000) });
    expect(started.ok).toBe(true);
    if (!started.ok) return;
    claimId = started.claim.id;
    expect((await completeClaim(db, claimId, userA)).ok).toBe(true);
    expect((await findSiteById(db, siteId))?.ownership).toBe("claimed");
    expect((await listSitesForOwner(db, userA)).some((row) => row.id === siteId)).toBe(true);

    const conflict = await createClaim(db, { siteId, userId: userB, method: "dns_txt", token: `token-conflict-${suffix}`, expiresAt: new Date(Date.now() + 60_000) });
    expect(conflict).toEqual({ ok: false, reason: "ownership_conflict" });
    expect((await listClaimReviews(db)).some((row) => row.siteId === siteId && row.lastError === "ownership_conflict")).toBe(true);

    const activity = await listActivity(db, 50);
    expect(activity.some((row) => row.siteId === siteId && row.type === "site_submitted")).toBe(true);
    expect(activity.some((row) => row.siteId === siteId && row.type === "site_approved")).toBe(true);
    expect(activity.some((row) => row.siteId === siteId && row.type === "ownership_verified")).toBe(true);
    const audit = await listAuditLog(db, 50);
    expect(audit.some((row) => row.targetId === siteId && row.action === "approve" && row.requestId === `req-approve-${suffix}`)).toBe(true);
  });
});
