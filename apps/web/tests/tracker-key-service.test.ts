import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { PostgresEventStoreProvider } from "@surge/analytics";
import { closeDb, completeClaim, createClaim, getPostgresDb, category, site, siteClaim, siteOwner, trackerKey, user } from "@surge/db";
import { getTrackerKeyStatus, mutateTrackerKey, revokeTrackerKey, testTrackerInstallation } from "../lib/server/tracker-key-service";
import type { NormalizedTrackerEvent } from "@surge/shared";

const enabled = process.env.RUN_DB_TESTS === "1" && process.env.APP_MODE === "production" && Boolean(process.env.DATABASE_URL);
const suffix = Date.now().toString(36);
const ownerId = `tracker-owner-${suffix}`;
const otherUserId = `tracker-other-${suffix}`;
const editorId = `tracker-editor-${suffix}`;
const categoryId = crypto.randomUUID();
const siteId = crypto.randomUUID();
let claimRaceSiteId = "";

describe.skipIf(!enabled)("tracker key authorization and lifecycle", () => {
  beforeAll(async () => {
    const db = getPostgresDb();
    await db.insert(category).values({ id: categoryId, slug: `tracker-${suffix}`, name: "Tracker Fixtures", description: "" });
    await db.insert(user).values([
      { id: ownerId, name: "Tracker Owner", email: `${ownerId}@example.com` },
      { id: otherUserId, name: "Other User", email: `${otherUserId}@example.com` },
      { id: editorId, name: "Tracker Editor", email: `${editorId}@example.com` },
    ]);
    await db.insert(site).values({ id: siteId, slug: `tracker-${suffix}`, domain: `tracker-${suffix}.example.com`, name: "Tracker Fixture", description: "", categoryId, status: "active", ownership: "claimed", isDemo: false, permittedAliases: [`www.tracker-${suffix}.example.com`] });
    await db.insert(siteOwner).values([
      { siteId, userId: ownerId, role: "owner" },
      { siteId, userId: editorId, role: "editor" },
    ]);
  });

  afterAll(async () => {
    const db = getPostgresDb();
    await db.delete(site).where(eq(site.id, siteId));
    if (claimRaceSiteId) await db.delete(site).where(eq(site.id, claimRaceSiteId));
    await db.delete(category).where(eq(category.id, categoryId));
    await db.delete(user).where(eq(user.id, ownerId));
    await db.delete(user).where(eq(user.id, otherUserId));
    await db.delete(user).where(eq(user.id, editorId));
    await closeDb();
  });

  it("requires the exact owner role for every tracker-key operation", async () => {
    await expect(getTrackerKeyStatus(editorId, siteId)).rejects.toMatchObject({ code: "ownership_required" });
    await expect(mutateTrackerKey({ userId: editorId, siteId, action: "generate" })).rejects.toMatchObject({ code: "ownership_required" });
    await expect(mutateTrackerKey({ userId: editorId, siteId, action: "rotate" })).rejects.toMatchObject({ code: "ownership_required" });
    await expect(revokeTrackerKey(editorId, siteId)).rejects.toMatchObject({ code: "ownership_required" });
    await expect(testTrackerInstallation(editorId, siteId)).rejects.toMatchObject({ code: "ownership_required" });
  });

  it("requires ownership and keeps rotation/revocation states one-way", async () => {
    const firstResults = await Promise.all([
      mutateTrackerKey({ userId: ownerId, siteId, action: "generate" }),
      mutateTrackerKey({ userId: ownerId, siteId, action: "generate" }),
    ]);
    const first = firstResults[0];
    expect(first.status).toBe("waiting");
    expect(first.key?.publicKey).toMatch(/^pk_live_/);
    expect(first.key?.publicKey).not.toContain(siteId);
    expect(firstResults[1].key?.publicKey).toBe(first.key?.publicKey);
    expect(first.key?.allowedDomains).toEqual([`tracker-${suffix}.example.com`, `www.tracker-${suffix}.example.com`]);

    const now = new Date().toISOString();
    await new PostgresEventStoreProvider().ingest([{
      eventId: "88888888-8888-4888-8888-888888888888",
      eventType: "pageview",
      siteId,
      visitorHash: "visitor-key-invalid-origin",
      sessionHash: "session-key-invalid-origin",
      pathname: "/",
      referrerHost: null,
      receivedAt: now,
      occurredAt: now,
      clientOccurredAt: now,
      visible: true,
      engagedSeconds: null,
      trackerVersion: "3.0.0",
      attributionTokenHash: null,
      attributionClickId: null,
      trackerPublicKey: first.key!.publicKey,
      originHost: "evil.example",
      country: null,
      device: "desktop",
      decision: "invalid",
      fraudScore: 90,
      fraudReasonCodes: ["disallowed_origin"],
      fraudRuleVersion: "v1",
      collectorRequestId: `tracker-key-invalid-origin-${suffix}`,
      isDemo: false,
    } satisfies NormalizedTrackerEvent]);
    expect((await testTrackerInstallation(ownerId, siteId)).accepted).toBe(false);

    await new PostgresEventStoreProvider().ingest([{
      eventId: "77777777-7777-4777-8777-777777777777",
      eventType: "pageview",
      siteId,
      visitorHash: "visitor-key-test",
      sessionHash: "session-key-test",
      pathname: "/",
      referrerHost: null,
      receivedAt: now,
      occurredAt: now,
      clientOccurredAt: now,
      visible: true,
      engagedSeconds: null,
      trackerVersion: "3.0.0",
      attributionTokenHash: null,
      attributionClickId: null,
      trackerPublicKey: first.key!.publicKey,
      originHost: `tracker-${suffix}.example.com`,
      country: null,
      device: "desktop",
      decision: "valid",
      fraudScore: 0,
      fraudReasonCodes: [],
      fraudRuleVersion: "v1",
      collectorRequestId: `tracker-key-test-${suffix}`,
      isDemo: false,
    } satisfies NormalizedTrackerEvent]);
    expect((await getTrackerKeyStatus(ownerId, siteId)).status).toBe("active");
    expect((await testTrackerInstallation(ownerId, siteId)).accepted).toBe(true);

    await expect(getTrackerKeyStatus(otherUserId, siteId)).rejects.toMatchObject({ code: "ownership_required" });
    const secondGenerate = await mutateTrackerKey({ userId: ownerId, siteId, action: "generate" });
    expect(secondGenerate.key?.version).toBe(first.key?.version);

    const rotated = await mutateTrackerKey({ userId: ownerId, siteId, action: "rotate" });
    expect(rotated.key?.version).toBe(2);
    expect(rotated.key?.publicKey).not.toBe(first.key?.publicKey);

    const revoked = await revokeTrackerKey(ownerId, siteId);
    expect(revoked.status).toBe("revoked");
    expect(revoked.key).toBeNull();

    const rotatedAfterRevoke = await mutateTrackerKey({ userId: ownerId, siteId, action: "rotate" });
    expect(rotatedAfterRevoke.key?.version).toBe(3);
    const keys = await getPostgresDb().select({ publicKey: trackerKey.publicKey, status: trackerKey.status, version: trackerKey.version }).from(trackerKey).where(eq(trackerKey.siteId, siteId));
    expect(keys.find((key) => key.publicKey === first.key?.publicKey)?.status).toBe("revoked");
    expect(keys.find((key) => key.version === 2)?.status).toBe("revoked");
    expect(keys.find((key) => key.version === 3)?.status).toBe("active");

    const concurrentRotates = await Promise.all([
      mutateTrackerKey({ userId: ownerId, siteId, action: "rotate" }),
      mutateTrackerKey({ userId: ownerId, siteId, action: "rotate" }),
    ]);
    const afterRotates = await getPostgresDb().select({ publicKey: trackerKey.publicKey, status: trackerKey.status, version: trackerKey.version }).from(trackerKey).where(eq(trackerKey.siteId, siteId));
    expect(concurrentRotates.every((result) => result.status === "active")).toBe(true);
    expect(afterRotates).toHaveLength(5);
    expect(afterRotates.filter((key) => key.status === "active")).toHaveLength(1);
    expect(new Set(afterRotates.map((key) => key.version)).size).toBe(afterRotates.length);

    await Promise.all([
      revokeTrackerKey(ownerId, siteId),
      mutateTrackerKey({ userId: ownerId, siteId, action: "rotate" }),
    ]);
    const afterRevokeRotate = await getPostgresDb().select({ status: trackerKey.status, version: trackerKey.version }).from(trackerKey).where(eq(trackerKey.siteId, siteId));
    // The serialized order determines whether rotate follows revoke (one new
    // active key) or revoke follows rotate (no active key), but neither order
    // may leave two live keys or duplicate versions.
    expect(afterRevokeRotate.filter((key) => key.status === "active").length).toBeLessThanOrEqual(1);
    expect(new Set(afterRevokeRotate.map((key) => key.version)).size).toBe(afterRevokeRotate.length);
  });

  it("settles a claim and key race without creating an unauthorized key", async () => {
    const db = getPostgresDb();
    const domain = `claim-key-race-${suffix}.example.com`;
    const [created] = await db
      .insert(site)
      .values({ id: crypto.randomUUID(), slug: `claim-key-race-${suffix}`, domain, name: "Claim key race fixture", description: "", categoryId, status: "active", ownership: "unclaimed", isDemo: false })
      .returning({ id: site.id });
    claimRaceSiteId = created.id;
    const started = await createClaim(db, { siteId: claimRaceSiteId, userId: ownerId, method: "meta_tag", token: `claim-key-race-${suffix}`, expiresAt: new Date(Date.now() + 60_000) });
    expect(started.ok).toBe(true);
    if (!started.ok) return;

    const [claimResult, keyResult] = await Promise.allSettled([
      completeClaim(db, started.claim.id, ownerId),
      mutateTrackerKey({ userId: ownerId, siteId: claimRaceSiteId, action: "generate" }),
    ]);
    expect(claimResult.status).toBe("fulfilled");
    expect(claimResult.status === "fulfilled" ? claimResult.value : null).toMatchObject({ ok: true, siteId: claimRaceSiteId });
    if (keyResult.status === "rejected") expect(keyResult.reason).toMatchObject({ code: "ownership_required" });
    const [claim] = await db.select({ status: siteClaim.status }).from(siteClaim).where(eq(siteClaim.id, started.claim.id));
    const [claimedSite] = await db.select({ ownership: site.ownership }).from(site).where(eq(site.id, claimRaceSiteId));
    const owners = await db.select({ userId: siteOwner.userId, role: siteOwner.role }).from(siteOwner).where(eq(siteOwner.siteId, claimRaceSiteId));
    const keys = await db.select({ status: trackerKey.status, isDemo: site.isDemo }).from(trackerKey).innerJoin(site, eq(trackerKey.siteId, site.id)).where(eq(trackerKey.siteId, claimRaceSiteId));
    expect(claim?.status).toBe("verified");
    expect(claimedSite?.ownership).toBe("claimed");
    expect(owners).toEqual([{ userId: ownerId, role: "owner" }]);
    expect(keys.filter((key) => key.status === "active")).toHaveLength(keyResult.status === "fulfilled" ? 1 : 0);
    expect(keys.every((key) => key.isDemo === false)).toBe(true);

    const eventual = await mutateTrackerKey({ userId: ownerId, siteId: claimRaceSiteId, action: "generate" });
    expect(eventual.status).toBe("waiting");
    expect(eventual.key?.allowedDomains).toEqual([domain]);
  });
});
