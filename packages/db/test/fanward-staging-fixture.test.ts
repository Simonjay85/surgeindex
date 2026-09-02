import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  assertFanwardFixtureSessionRevokeConfirmation,
  assertFanwardFixtureOutputSafe,
  buildFanwardFixtureEvidence,
  buildFanwardFixtureIdentity,
  buildFanwardFixtureRateLimitKeys,
  deriveFanwardFixtureHttpsClientIp,
  FANWARD_FIXTURE_ALLOWED_DIRECT_FK_CONSTRAINTS,
  FANWARD_FIXTURE_SCHEMA_15_DIRECT_REFERENCES,
  FANWARD_FIXTURE_SCHEMA_15_FK_SIGNATURES,
  FANWARD_FIXTURE_SCHEMA_15_FORBIDDEN_DIRECT_TABLES,
  findFanwardFixtureForeignKeyGraphDrift,
  findFanwardFixtureMutationDrift,
  findFanwardFixtureRateLimitPhaseDrift,
  findFanwardFixtureDrift,
  isFanwardFixtureInternalPostgresEndpoint,
  readFanwardFixtureIds,
  readFanwardFixtureRateLimitPhase,
  readFanwardFixtureSecrets,
  subtractFanwardFixtureMutationCounters,
  validateFanwardStagingFixtureEnvironment,
  type FanwardFixtureContext,
  type FanwardFixtureIds,
  type FanwardFixtureMutationInventory,
  type FanwardFixturePrincipalSnapshot,
  type FanwardFixtureSnapshot,
} from "../src/index";

const releaseSha = "a".repeat(40);
const ownerPassword = "OwnerFixturePassword_1234567890";
const adminPassword = "AdminFixturePassword_0987654321";
const authSecret = "fixture-auth-secret-that-is-long-enough-1234567890";

function validEnvironment(): NodeJS.ProcessEnv {
  return {
    FANWARD_FIXTURE_CONFIRM: "staging.surgeindex.lol",
    FANWARD_FIXTURE_HTTPS_CLIENT_IP: deriveFanwardFixtureHttpsClientIp(releaseSha),
    FANWARD_FIXTURE_RUN_ID: "release-20260830",
    FANWARD_FIXTURE_RELEASE_SHA: releaseSha,
    FANWARD_FIXTURE_CATEGORY_SLUG: "other",
    FANWARD_FIXTURE_OWNER_PASSWORD: ownerPassword,
    FANWARD_FIXTURE_ADMIN_PASSWORD: adminPassword,
    BETTER_AUTH_SECRET: authSecret,
    NEXT_PUBLIC_APP_URL: "https://staging.surgeindex.lol",
    BETTER_AUTH_URL: "https://staging.surgeindex.lol",
    TURNSTILE_EXPECTED_HOSTNAME: "staging.surgeindex.lol",
    TURNSTILE_REQUIRED: "true",
    APP_MODE: "production",
    DATA_PROVIDER: "postgres",
    DB_DRIVER: "pg",
    FEATURE_CREATORS: "true",
    EXPECTED_MIGRATION_COUNT: "15",
    DATABASE_URL: "postgresql://fixture@127.0.0.1:55434/surgeindex_staging",
    DATABASE_URL_UNPOOLED: "postgresql://fixture@127.0.0.1:55434/surgeindex_staging",
  };
}

function contextAndIds(): { context: FanwardFixtureContext; ids: FanwardFixtureIds } {
  const context = validateFanwardStagingFixtureEnvironment(validEnvironment(), releaseSha);
  const ids: FanwardFixtureIds = {
    siteId: "11111111-1111-4111-8111-111111111111",
    siteOwnerId: "22222222-2222-4222-8222-222222222222",
    categoryId: "33333333-3333-4333-8333-333333333333",
    ownerUserId: context.identity.ownerUserId,
    adminUserId: context.identity.adminUserId,
    ownerAccountId: context.identity.ownerAccountId,
    adminAccountId: context.identity.adminAccountId,
  };
  return { context, ids };
}

function principal(
  id: string,
  accountId: string,
  role: "user" | "admin",
  name: string,
  email: string,
): FanwardFixturePrincipalSnapshot {
  return {
    id,
    name,
    email,
    emailVerified: true,
    image: null,
    role,
    isDemo: true,
    sessionCount: 0,
    accountCount: 1,
    account: {
      id: accountId,
      accountId: id,
      providerId: "credential",
      issuer: "credential",
      hasPassword: true,
      passwordMatches: true,
      hasOAuthMaterial: false,
    },
  };
}

function validSnapshot(context: FanwardFixtureContext, ids: FanwardFixtureIds): FanwardFixtureSnapshot {
  return {
    site: {
      id: ids.siteId,
      slug: context.identity.siteSlug,
      domain: context.identity.siteDomain,
      name: context.identity.siteName,
      description: context.identity.siteDescription,
      categoryId: ids.categoryId,
      status: "active",
      verification: "tracker",
      ownership: "claimed",
      submittedByUserId: ids.ownerUserId,
      logoUrl: null,
      faviconUrl: null,
      ogImageUrl: null,
      permittedAliases: [],
      featured: false,
      isDemo: false,
      publicRevenueVisible: false,
      publicPageMetricsVisible: false,
      deletedAt: null,
    },
    identityCollisionIds: [ids.siteId],
    category: { id: ids.categoryId, slug: context.categorySlug },
    owner: principal(
      ids.ownerUserId,
      ids.ownerAccountId,
      "user",
      context.identity.ownerName,
      context.identity.ownerEmail,
    ),
    admin: principal(
      ids.adminUserId,
      ids.adminAccountId,
      "admin",
      context.identity.adminName,
      context.identity.adminEmail,
    ),
    memberships: [{ id: ids.siteOwnerId, siteId: ids.siteId, userId: ids.ownerUserId, role: "owner" }],
    otherFixtureUserMembershipCount: 0,
    otherFixtureUserSubmittedSiteCount: 0,
    verification: {
      siteId: ids.siteId,
      source: "tracker",
      method: "tracker",
      status: "active",
      verifiedAt: new Date("2026-08-30T00:00:00.000Z"),
      lastSyncAt: null,
      lastError: null,
      evidence: buildFanwardFixtureEvidence(context, ids),
    },
    profiles: [],
    revisionIds: [],
    forbiddenCounts: { tracker_event: 0, site_score: 0, site_revenue_current: 0 },
    unexpectedFixtureAuditCount: 0,
    retainedAuditCounts: { moderationActions: 0, adminAuditLogs: 0 },
  };
}

describe("Fanward staging fixture safety guards", () => {
  it("accepts only the exact staging release and builds clearly synthetic identities", () => {
    const context = validateFanwardStagingFixtureEnvironment(validEnvironment(), releaseSha);
    expect(context.origin).toBe("https://staging.surgeindex.lol");
    expect(context.identity.siteDomain).toMatch(/\.staging\.invalid$/);
    expect(context.identity.ownerEmail).toMatch(/@staging\.invalid$/);
    expect(context.identity.adminEmail).toMatch(/@staging\.invalid$/);
    expect(context.identity.marker).toContain(releaseSha);
    expect(context.httpsClientIp).toBe("127.171.171.171");
    expect(buildFanwardFixtureIdentity(context.runId, releaseSha)).toEqual(context.identity);
  });

  it.each([
    ["production origin", { NEXT_PUBLIC_APP_URL: "https://surgeindex.lol" }],
    ["non-exact staging origin", { NEXT_PUBLIC_APP_URL: "https://staging.surgeindex.lol/" }],
    ["production auth origin", { BETTER_AUTH_URL: "https://surgeindex.lol" }],
    ["missing confirmation", { FANWARD_FIXTURE_CONFIRM: "surgeindex.lol" }],
    ["non-loopback HTTPS fixture client", { FANWARD_FIXTURE_HTTPS_CLIENT_IP: "203.0.113.8" }],
    ["production port", { DATABASE_URL: "postgresql://fixture@127.0.0.1:55433/surgeindex" }],
    ["wrong database", { DATABASE_URL: "postgresql://fixture@127.0.0.1:55434/surgeindex" }],
    ["remote database", { DATABASE_URL: "postgresql://fixture@db.example.com:55434/surgeindex_staging" }],
    ["query host override", { DATABASE_URL: "postgresql://fixture@127.0.0.1:55434/surgeindex_staging?host=10.20.30.40" }],
    ["query port override", { DATABASE_URL: "postgresql://fixture@127.0.0.1:55434/surgeindex_staging?port=55433" }],
    ["query database override", { DATABASE_URL: "postgresql://fixture@127.0.0.1:55434/surgeindex_staging?database=surgeindex" }],
    ["query options", { DATABASE_URL: "postgresql://fixture@127.0.0.1:55434/surgeindex_staging?options=-csearch_path%3Dpublic" }],
    ["query ssl option", { DATABASE_URL: "postgresql://fixture@127.0.0.1:55434/surgeindex_staging?sslmode=require" }],
    ["empty query", { DATABASE_URL: "postgresql://fixture@127.0.0.1:55434/surgeindex_staging?" }],
    ["URL fragment", { DATABASE_URL: "postgresql://fixture@127.0.0.1:55434/surgeindex_staging#staging" }],
    ["empty fragment", { DATABASE_URL: "postgresql://fixture@127.0.0.1:55434/surgeindex_staging#" }],
    ["unpooled query override", { DATABASE_URL_UNPOOLED: "postgresql://fixture@127.0.0.1:55434/surgeindex_staging?host=10.20.30.40" }],
    ["wrong SHA", { FANWARD_FIXTURE_RELEASE_SHA: "b".repeat(40) }],
    ["weak run id", { FANWARD_FIXTURE_RUN_ID: "prod" }],
    ["feature disabled", { FEATURE_CREATORS: "false" }],
  ])("refuses %s", (_label, override) => {
    expect(() => validateFanwardStagingFixtureEnvironment({ ...validEnvironment(), ...override }, releaseSha)).toThrow();
  });

  it("accepts only a private PostgreSQL server endpoint on its internal port", () => {
    expect(isFanwardFixtureInternalPostgresEndpoint("127.0.0.1", 5432)).toBe(true);
    expect(isFanwardFixtureInternalPostgresEndpoint("10.20.30.40", 5432)).toBe(true);
    expect(isFanwardFixtureInternalPostgresEndpoint("172.16.0.2", 5432)).toBe(true);
    expect(isFanwardFixtureInternalPostgresEndpoint("172.31.255.2", 5432)).toBe(true);
    expect(isFanwardFixtureInternalPostgresEndpoint("192.168.1.8", 5432)).toBe(true);
    expect(isFanwardFixtureInternalPostgresEndpoint("::ffff:172.18.0.2", 5432)).toBe(true);
    expect(isFanwardFixtureInternalPostgresEndpoint("fd00::2", 5432)).toBe(true);
    expect(isFanwardFixtureInternalPostgresEndpoint("172.15.0.2", 5432)).toBe(false);
    expect(isFanwardFixtureInternalPostgresEndpoint("172.32.0.2", 5432)).toBe(false);
    expect(isFanwardFixtureInternalPostgresEndpoint("203.0.113.8", 5432)).toBe(false);
    expect(isFanwardFixtureInternalPostgresEndpoint("127.0.0.1", 55434)).toBe(false);
  });

  it("requires two separate root-env passwords without echoing them in errors", () => {
    const env = validEnvironment();
    expect(readFanwardFixtureSecrets(env)).toEqual({ ownerPassword, adminPassword, authSecret });
    const repeated = { ...env, FANWARD_FIXTURE_ADMIN_PASSWORD: ownerPassword };
    let message = "";
    try {
      readFanwardFixtureSecrets(repeated);
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    expect(message).not.toContain(ownerPassword);
    expect(message).toContain("must be different");
    expect(() => readFanwardFixtureSecrets({
      ...env,
      FANWARD_FIXTURE_OWNER_PASSWORD: ` ${ownerPassword} `,
    })).toThrow("URL-safe characters");
  });

  it("preserves the raw Better Auth secret when deriving cleanup keys", () => {
    const paddedAuthSecret = ` ${authSecret} `;
    const secrets = readFanwardFixtureSecrets({
      ...validEnvironment(),
      BETTER_AUTH_SECRET: paddedAuthSecret,
    });
    expect(secrets.authSecret).toBe(paddedAuthSecret);
    const { context, ids } = contextAndIds();
    expect(buildFanwardFixtureRateLimitKeys(context, ids, paddedAuthSecret))
      .not.toEqual(buildFanwardFixtureRateLimitKeys(context, ids, authSecret));
  });

  it("requires every exact cleanup ID and rejects principal substitution", () => {
    const { context, ids } = contextAndIds();
    const env = {
      ...validEnvironment(),
      FANWARD_FIXTURE_SITE_ID: ids.siteId,
      FANWARD_FIXTURE_SITE_OWNER_ID: ids.siteOwnerId,
      FANWARD_FIXTURE_CATEGORY_ID: ids.categoryId,
      FANWARD_FIXTURE_OWNER_USER_ID: ids.ownerUserId,
      FANWARD_FIXTURE_ADMIN_USER_ID: ids.adminUserId,
      FANWARD_FIXTURE_OWNER_ACCOUNT_ID: ids.ownerAccountId,
      FANWARD_FIXTURE_ADMIN_ACCOUNT_ID: ids.adminAccountId,
    };
    expect(readFanwardFixtureIds(env, context)).toEqual(ids);
    expect(() => readFanwardFixtureIds({ ...env, FANWARD_FIXTURE_ADMIN_USER_ID: "different-admin" }, context)).toThrow();
  });

  it("derives all ten exact release-scoped loopback HTTPS and authenticated API limiter keys", () => {
    const { context, ids } = contextAndIds();
    const clientIp = deriveFanwardFixtureHttpsClientIp(releaseSha);
    const expectedSubjects = [
      ["fanward-owner-read", ids.ownerUserId],
      ["fanward-owner-save", ids.ownerUserId],
      ["fanward-owner-submit", ids.ownerUserId],
      ["fanward-admin-read", ids.adminUserId],
      ["fanward-admin-review", ids.adminUserId],
      ["fanward-public-list", clientIp],
      ["fanward-public-detail", clientIp],
      ["auth-signin", `${clientIp}:${context.identity.ownerEmail}`],
      ["auth-signin", `${clientIp}:${context.identity.adminEmail}`],
      ["auth-signin", `${clientIp}:unknown`],
    ] as const;
    const expectedKeys = expectedSubjects.map(([scope, subject]) => (
      createHash("sha256").update(`${scope}:${subject}:${authSecret}`).digest("hex")
    ));
    const actualKeys = buildFanwardFixtureRateLimitKeys(context, ids, authSecret);
    expect(context.httpsClientIp).toBe(clientIp);
    expect(actualKeys).toEqual(expectedKeys);
    expect(actualKeys).toHaveLength(10);
    expect(new Set(actualKeys).size).toBe(10);
    expect(JSON.stringify(actualKeys)).not.toContain(authSecret);
  });

  it("requires an exact phase-aware set of release-scoped limiter keys", () => {
    const { context, ids } = contextAndIds();
    const keys = buildFanwardFixtureRateLimitKeys(context, ids, authSecret);
    expect(findFanwardFixtureRateLimitPhaseDrift(keys, [], "preflight")).toEqual([]);
    expect(findFanwardFixtureRateLimitPhaseDrift(keys, keys.slice(0, 9), "active")).toEqual([]);
    expect(findFanwardFixtureRateLimitPhaseDrift(keys, keys, "complete")).toEqual([]);
    expect(findFanwardFixtureRateLimitPhaseDrift(keys, keys.slice(0, 4), "recovery")).toEqual([]);
    expect(findFanwardFixtureRateLimitPhaseDrift(keys, keys.slice(0, 8), "active"))
      .toEqual(["fixture_rate_limit_phase_active"]);
    expect(findFanwardFixtureRateLimitPhaseDrift(keys, keys.slice(0, 9), "complete"))
      .toEqual(["fixture_rate_limit_phase_complete"]);
    expect(findFanwardFixtureRateLimitPhaseDrift(keys, [keys[0]!, keys[0]!], "recovery"))
      .toEqual(["duplicate_fixture_rate_limit_key"]);
    expect(readFanwardFixtureRateLimitPhase({ FANWARD_FIXTURE_RATE_LIMIT_PHASE: "active" })).toBe("active");
    expect(() => readFanwardFixtureRateLimitPhase({ FANWARD_FIXTURE_RATE_LIMIT_PHASE: "partial" }))
      .toThrow("preflight, active, complete, or recovery");
  });

  it("suppresses any result that contains a password or hash", () => {
    const passwordHash = "scrypt-hash-material-that-must-not-leak";
    expect(() => assertFanwardFixtureOutputSafe({ status: "ready", ids: { siteId: "safe" } }, [ownerPassword, passwordHash, authSecret])).not.toThrow();
    expect(() => assertFanwardFixtureOutputSafe({ accidental: ownerPassword }, [ownerPassword, passwordHash])).toThrow("suppressed");
    expect(() => assertFanwardFixtureOutputSafe({ accidental: passwordHash }, [ownerPassword, passwordHash])).toThrow("suppressed");
    expect(() => assertFanwardFixtureOutputSafe({ accidental: authSecret }, [authSecret])).toThrow("suppressed");
  });

  it("requires the exact release-scoped marker before session revocation", () => {
    const { context } = contextAndIds();
    expect(() => assertFanwardFixtureSessionRevokeConfirmation({
      FANWARD_FIXTURE_SESSION_REVOKE_CONFIRM: context.identity.marker,
    }, context)).not.toThrow();
    expect(() => assertFanwardFixtureSessionRevokeConfirmation({
      FANWARD_FIXTURE_SESSION_REVOKE_CONFIRM: `${context.identity.marker}-wrong`,
    }, context)).toThrow("exact release-scoped fixture marker");
  });
});

describe("Fanward staging fixture drift and cleanup boundary", () => {
  it("accepts the exact fixture while permitting real HTTPS session lifecycle and Fanward revisions", () => {
    const { context, ids } = contextAndIds();
    const snapshot = validSnapshot(context, ids);
    snapshot.owner!.sessionCount = 1;
    snapshot.admin!.sessionCount = 1;
    snapshot.profiles = [{ id: "44444444-4444-4444-8444-444444444444", ownerUserId: ids.ownerUserId, primarySiteId: ids.siteId }];
    snapshot.revisionIds = ["55555555-5555-4555-8555-555555555555"];
    snapshot.retainedAuditCounts = { moderationActions: 4, adminAuditLogs: 4 };
    expect(findFanwardFixtureDrift(context, ids, snapshot)).toEqual([]);
  });

  it.each([
    ["site visibility", (snapshot: FanwardFixtureSnapshot) => { snapshot.site!.isDemo = true; }, "site_visibility_boundary"],
    ["verification marker", (snapshot: FanwardFixtureSnapshot) => { snapshot.verification!.evidence = { fixtureMarker: "changed" }; }, "site_verification_evidence"],
    ["metric data", (snapshot: FanwardFixtureSnapshot) => { snapshot.forbiddenCounts.site_score = 1; }, "forbidden_fixture_data"],
    ["credential OAuth material", (snapshot: FanwardFixtureSnapshot) => { snapshot.owner!.account!.hasOAuthMaterial = true; }, "user_credential"],
    ["principal image", (snapshot: FanwardFixtureSnapshot) => { snapshot.owner!.image = "https://example.invalid/image.png"; }, "user_principal"],
    ["extra account", (snapshot: FanwardFixtureSnapshot) => { snapshot.owner!.accountCount = 2; }, "user_account_count"],
    ["other ownership", (snapshot: FanwardFixtureSnapshot) => { snapshot.otherFixtureUserMembershipCount = 1; }, "unexpected_fixture_user_membership"],
    ["unrelated audit action", (snapshot: FanwardFixtureSnapshot) => { snapshot.unexpectedFixtureAuditCount = 1; }, "unexpected_fixture_audit_scope"],
  ])("detects %s drift before cleanup", (_label, mutate, expected) => {
    const { context, ids } = contextAndIds();
    const snapshot = validSnapshot(context, ids);
    mutate(snapshot);
    expect(findFanwardFixtureDrift(context, ids, snapshot)).toContain(expected);
  });

  it("distinguishes a fully absent fixture from partial residue or an ID collision", () => {
    const { context, ids } = contextAndIds();
    const absent = validSnapshot(context, ids);
    absent.site = null;
    absent.identityCollisionIds = [];
    absent.owner = null;
    absent.admin = null;
    absent.memberships = [];
    absent.verification = null;
    expect(findFanwardFixtureDrift(context, ids, absent)).toEqual([]);

    absent.owner = principal(ids.ownerUserId, ids.ownerAccountId, "user", context.identity.ownerName, context.identity.ownerEmail);
    expect(findFanwardFixtureDrift(context, ids, absent)).toContain("partial_fixture_residue");
    absent.owner = null;
    absent.identityCollisionIds = ["66666666-6666-4666-8666-666666666666"];
    expect(findFanwardFixtureDrift(context, ids, absent)).toContain("fixture_identity_collision");
    absent.identityCollisionIds = [];
    absent.forbiddenCounts["public.subscription"] = 1;
    expect(findFanwardFixtureDrift(context, ids, absent)).toContain("partial_fixture_residue");
  });
});

describe("Fanward staging fixture exhaustive cleanup inventory", () => {
  it("pins the complete reviewed migration-15 FK graph", () => {
    expect(FANWARD_FIXTURE_SCHEMA_15_FK_SIGNATURES).toHaveLength(102);
    expect(findFanwardFixtureForeignKeyGraphDrift(FANWARD_FIXTURE_SCHEMA_15_FK_SIGNATURES)).toEqual([]);
    expect(FANWARD_FIXTURE_SCHEMA_15_FK_SIGNATURES.some((value) => value.includes("current_ranking_site_id"))).toBe(true);
    expect(FANWARD_FIXTURE_SCHEMA_15_FK_SIGNATURES.some((value) => value.includes("ga_oauth_transaction_site_id"))).toBe(true);
    expect(FANWARD_FIXTURE_SCHEMA_15_FK_SIGNATURES.some((value) => value.includes("subscription_user_id"))).toBe(true);
    expect(FANWARD_FIXTURE_SCHEMA_15_FK_SIGNATURES.some((value) => value.includes(">public.session("))).toBe(false);
  });

  it("pins every direct site/user residue predicate and its narrow allowance set", () => {
    expect(FANWARD_FIXTURE_SCHEMA_15_DIRECT_REFERENCES).toHaveLength(59);
    expect(FANWARD_FIXTURE_ALLOWED_DIRECT_FK_CONSTRAINTS).toHaveLength(12);
    expect(FANWARD_FIXTURE_SCHEMA_15_FORBIDDEN_DIRECT_TABLES).toHaveLength(40);
    expect(FANWARD_FIXTURE_SCHEMA_15_FORBIDDEN_DIRECT_TABLES).toEqual(expect.arrayContaining([
      "public.current_ranking",
      "public.ga_oauth_transaction",
      "public.site_claim",
      "public.subscription",
      "public.stripe_customer",
      "public.boost_order",
    ]));
    expect(FANWARD_FIXTURE_SCHEMA_15_FORBIDDEN_DIRECT_TABLES).not.toEqual(expect.arrayContaining([
      "public.account",
      "public.session",
      "public.site_owner",
      "public.site_verification",
    ]));
  });

  it("fails closed for missing, extra, or duplicate FK signatures", () => {
    const missing = FANWARD_FIXTURE_SCHEMA_15_FK_SIGNATURES.slice(1);
    expect(findFanwardFixtureForeignKeyGraphDrift(missing).some((value) => value.startsWith("missing_foreign_key:"))).toBe(true);
    expect(findFanwardFixtureForeignKeyGraphDrift([
      ...FANWARD_FIXTURE_SCHEMA_15_FK_SIGNATURES,
      "unexpected|public.child(user_id)>public.user(id)|d=c|u=a|v=1|f=0|i=0",
    ]).some((value) => value.startsWith("unexpected_foreign_key:"))).toBe(true);
    expect(findFanwardFixtureForeignKeyGraphDrift([
      ...FANWARD_FIXTURE_SCHEMA_15_FK_SIGNATURES,
      FANWARD_FIXTURE_SCHEMA_15_FK_SIGNATURES[0]!,
    ])).toContain("duplicate_foreign_key_signature");
  });

  it.each([
    "public.current_ranking",
    "public.ga_oauth_transaction",
    "public.subscription",
    "public.stripe_customer",
    "public.boost_order",
  ])("rejects a delete in non-allowlisted %s", (table) => {
    const expected: FanwardFixtureMutationInventory = {
      "public.site": { inserted: 0, updated: 0, deleted: 1 },
      "public.user": { inserted: 0, updated: 0, deleted: 2 },
    };
    const actual: FanwardFixtureMutationInventory = {
      ...expected,
      [table]: { inserted: 0, updated: 0, deleted: 1 },
    };
    expect(findFanwardFixtureMutationDrift(expected, actual)).toContain(`${table}:deleted:1!=0`);
  });

  it("accepts only exact per-table operation counts and rejects inserts or unrelated updates", () => {
    const expected: FanwardFixtureMutationInventory = {
      "public.site": { inserted: 0, updated: 0, deleted: 1 },
      "public.user": { inserted: 0, updated: 0, deleted: 2 },
      "public.account": { inserted: 0, updated: 0, deleted: 2 },
      "public.creator_profile_revision": { inserted: 0, updated: 0, deleted: 3 },
      "public.moderation_action": { inserted: 0, updated: 2, deleted: 0 },
      "public.admin_audit_log": { inserted: 0, updated: 2, deleted: 0 },
    };
    expect(findFanwardFixtureMutationDrift(expected, structuredClone(expected))).toEqual([]);
    expect(findFanwardFixtureMutationDrift(expected, {
      ...structuredClone(expected),
      "public.moderation_action": { inserted: 0, updated: 1, deleted: 0 },
      "public.blocked_domain": { inserted: 0, updated: 1, deleted: 0 },
      "public.side_effect": { inserted: 1, updated: 0, deleted: 0 },
    })).toEqual(expect.arrayContaining([
      "public.moderation_action:updated:1!=2",
      "public.blocked_domain:updated:1!=0",
      "public.side_effect:inserted:1!=0",
    ]));
  });

  it("subtracts same-backend transaction counters and rejects non-monotonic samples", () => {
    const before: FanwardFixtureMutationInventory = {
      "public.site": { inserted: 4, updated: 2, deleted: 9 },
    };
    const after: FanwardFixtureMutationInventory = {
      "public.site": { inserted: 4, updated: 2, deleted: 10 },
      "public.user": { inserted: 0, updated: 0, deleted: 2 },
    };
    expect(subtractFanwardFixtureMutationCounters(before, after)).toEqual({
      "public.site": { inserted: 0, updated: 0, deleted: 1 },
      "public.user": { inserted: 0, updated: 0, deleted: 2 },
    });
    expect(() => subtractFanwardFixtureMutationCounters(after, before)).toThrow("non-monotonic");
  });
});
