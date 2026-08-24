import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
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
  getClaimForUser,
  recordClaimAttempt,
  activityEvent,
  type PostgresDatabase,
  site,
  siteOwner,
  category,
  user,
} from "../src/index";

const enabled = process.env.RUN_DB_TESTS === "1" && Boolean(process.env.DATABASE_URL);
const suffix = Date.now().toString(36);
const userA = `batch2-user-a-${suffix}`;
const userB = `batch2-user-b-${suffix}`;
const admin = `batch2-admin-${suffix}`;
let siteId = "";
const extraSiteIds: string[] = [];
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
    for (const id of extraSiteIds) await db.delete(site).where(eq(site.id, id));
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

    const retryStarted = await createClaim(db, { siteId, userId: userA, method: "dns_txt", token: `token-retry-${suffix}`, expiresAt: new Date(Date.now() + 60_000) });
    expect(retryStarted.ok).toBe(true);
    if (!retryStarted.ok) return;
    for (let attempt = 1; attempt < 5; attempt += 1) {
      const recorded = await recordClaimAttempt(db, retryStarted.claim.id, "pending", "verification_proof_not_found");
      expect(recorded).toMatchObject({ status: "pending", attempts: attempt });
    }
    const terminal = await recordClaimAttempt(db, retryStarted.claim.id, "pending", "verification_proof_not_found");
    expect(terminal).toMatchObject({ status: "failed", attempts: 5 });
    expect(await recordClaimAttempt(db, retryStarted.claim.id, "pending", "verification_proof_not_found")).toBeNull();
    expect((await getClaimForUser(db, retryStarted.claim.id, userA))?.status).toBe("failed");

    const expiredStarted = await createClaim(db, { siteId, userId: userA, method: "meta_tag", token: `token-expired-${suffix}`, expiresAt: new Date(Date.now() - 1_000) });
    expect(expiredStarted.ok).toBe(true);
    if (!expiredStarted.ok) return;
    expect(await recordClaimAttempt(db, expiredStarted.claim.id, "expired", "challenge_expired")).toMatchObject({ status: "expired", attempts: 1 });

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

  it("serializes competing owners and duplicate completion attempts", async () => {
    const competingSite = await createPendingSite(db, {
      domain: `claim-race-${suffix}.example.com`,
      slug: `claim-race-${suffix}`,
      name: "Claim Race Site",
      description: "Concurrent owner fixture.",
      categoryId,
      submittedByUserId: userA,
      requestId: `req-race-${suffix}`,
    });
    expect(competingSite.duplicate).toBe(false);
    if (competingSite.duplicate) return;
    extraSiteIds.push(competingSite.siteId);

    const claimA = await createClaim(db, { siteId: competingSite.siteId, userId: userA, method: "meta_tag", token: `token-race-a-${suffix}`, expiresAt: new Date(Date.now() + 60_000) });
    const claimB = await createClaim(db, { siteId: competingSite.siteId, userId: userB, method: "dns_txt", token: `token-race-b-${suffix}`, expiresAt: new Date(Date.now() + 60_000) });
    expect(claimA.ok).toBe(true);
    expect(claimB.ok).toBe(true);
    if (!claimA.ok || !claimB.ok) return;

    const competingResults = await Promise.all([
      completeClaim(db, claimA.claim.id, userA),
      completeClaim(db, claimB.claim.id, userB),
    ]);
    expect(competingResults.filter((result) => result.ok)).toHaveLength(1);
    expect(competingResults.filter((result) => !result.ok && result.reason === "ownership_conflict")).toHaveLength(1);
    const owners = await db.select({ userId: siteOwner.userId }).from(siteOwner).where(and(eq(siteOwner.siteId, competingSite.siteId), eq(siteOwner.role, "owner")));
    expect(owners).toHaveLength(1);
    const claimStates = await Promise.all([
      getClaimForUser(db, claimA.claim.id, userA),
      getClaimForUser(db, claimB.claim.id, userB),
    ]);
    expect(claimStates.map((claim) => claim?.status).sort()).toEqual(["failed", "verified"]);
    const raceActivity = await db.select({ id: activityEvent.id }).from(activityEvent).where(and(eq(activityEvent.siteId, competingSite.siteId), eq(activityEvent.type, "ownership_verified")));
    expect(raceActivity).toHaveLength(1);

    const duplicateSite = await createPendingSite(db, {
      domain: `claim-duplicate-${suffix}.example.com`,
      slug: `claim-duplicate-${suffix}`,
      name: "Duplicate Claim Site",
      description: "Concurrent duplicate fixture.",
      categoryId,
      submittedByUserId: userA,
      requestId: `req-duplicate-${suffix}`,
    });
    expect(duplicateSite.duplicate).toBe(false);
    if (duplicateSite.duplicate) return;
    extraSiteIds.push(duplicateSite.siteId);
    const duplicateClaim = await createClaim(db, { siteId: duplicateSite.siteId, userId: userA, method: "meta_tag", token: `token-duplicate-${suffix}`, expiresAt: new Date(Date.now() + 60_000) });
    expect(duplicateClaim.ok).toBe(true);
    if (!duplicateClaim.ok) return;

    const duplicateResults = await Promise.all([
      completeClaim(db, duplicateClaim.claim.id, userA),
      completeClaim(db, duplicateClaim.claim.id, userA),
    ]);
    expect(duplicateResults.filter((result) => result.ok)).toHaveLength(1);
    expect(duplicateResults.filter((result) => !result.ok && result.reason === "not_pending")).toHaveLength(1);
    const duplicateActivity = await db.select({ id: activityEvent.id }).from(activityEvent).where(and(eq(activityEvent.siteId, duplicateSite.siteId), eq(activityEvent.type, "ownership_verified")));
    expect(duplicateActivity).toHaveLength(1);
    expect((await getClaimForUser(db, duplicateClaim.claim.id, userA))?.attempts).toBe(1);
  });
});
