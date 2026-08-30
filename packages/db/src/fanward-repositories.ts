import {
  and,
  asc,
  desc,
  eq,
  gt,
  ilike,
  inArray,
  isNotNull,
  isNull,
  lt,
  or,
  sql,
} from "drizzle-orm";
import type { PostgresDatabase } from "./connection";
import {
  adminAuditLog,
  category,
  creatorProfile,
  creatorProfileRevision,
  moderationAction,
  site,
  siteOwner,
  siteScore,
  siteScoreComponent,
  user,
} from "./schema";

export type FanwardRepository = PostgresDatabase;
export type FanwardProfileStatus = typeof creatorProfile.$inferSelect.status;
export type FanwardRevisionStatus = typeof creatorProfileRevision.$inferSelect.status;

export type FanwardEligibilityReason =
  | "site_not_found"
  | "site_owner_required"
  | "site_not_active"
  | "site_not_claimed"
  | "traffic_not_verified"
  | "demo_site"
  | "site_already_linked";

export interface RepositoryFanwardCategory {
  id: string;
  slug: string;
  name: string;
}

export interface RepositoryFanwardSite {
  id: string;
  slug: string;
  name: string;
  domain: string;
  status: typeof site.$inferSelect.status;
  ownership: typeof site.$inferSelect.ownership;
  verification: typeof site.$inferSelect.verification;
  logoUrl: string | null;
}

export interface RepositoryFanwardRevision {
  id: string;
  creatorProfileId: string;
  displayName: string;
  headline: string;
  bio: string;
  category: RepositoryFanwardCategory | null;
  status: FanwardRevisionStatus;
  submittedAt: Date | null;
  publishedAt: Date | null;
  reviewedAt: Date | null;
  reviewReason: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface RepositoryFanwardProfile {
  id: string;
  ownerUserId: string;
  slug: string;
  primarySiteId: string;
  status: FanwardProfileStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface RepositoryPublicFanwardCreator {
  profile: RepositoryFanwardProfile;
  revision: RepositoryFanwardRevision;
  site: RepositoryFanwardSite;
}

export interface RepositoryFanwardScore {
  id: string;
  siteId: string;
  scoreVersion: string;
  rankingState: typeof siteScore.$inferSelect.rankingState;
  confidence: number;
  source: typeof siteScore.$inferSelect.rankingSource;
  updatedAt: Date;
  components: Array<{
    component: string;
    normalizedValue: number;
    available: boolean;
  }>;
}

export interface FanwardPublicCursor {
  publishedAt: Date;
  profileId: string;
}

export interface ListPublicFanwardInput {
  query?: string;
  categorySlug?: string;
  cursor?: FanwardPublicCursor;
  limit: number;
}

export interface ListPublicFanwardResult {
  creators: RepositoryPublicFanwardCreator[];
  hasMore: boolean;
  total: number;
  categories: RepositoryFanwardCategory[];
}

const revisionSelection = {
  revisionId: creatorProfileRevision.id,
  revisionProfileId: creatorProfileRevision.creatorProfileId,
  displayName: creatorProfileRevision.displayName,
  headline: creatorProfileRevision.headline,
  bio: creatorProfileRevision.bio,
  revisionStatus: creatorProfileRevision.status,
  submittedAt: creatorProfileRevision.submittedAt,
  publishedAt: creatorProfileRevision.publishedAt,
  reviewedAt: creatorProfileRevision.reviewedAt,
  reviewReason: creatorProfileRevision.reviewReason,
  revisionCreatedAt: creatorProfileRevision.createdAt,
  revisionUpdatedAt: creatorProfileRevision.updatedAt,
  categoryId: category.id,
  categorySlug: category.slug,
  categoryName: category.name,
};

function hydrateRevision(row: {
  revisionId: string;
  revisionProfileId: string;
  displayName: string;
  headline: string;
  bio: string;
  revisionStatus: FanwardRevisionStatus;
  submittedAt: Date | null;
  publishedAt: Date | null;
  reviewedAt: Date | null;
  reviewReason: string | null;
  revisionCreatedAt: Date;
  revisionUpdatedAt: Date;
  categoryId: string | null;
  categorySlug: string | null;
  categoryName: string | null;
}): RepositoryFanwardRevision {
  return {
    id: row.revisionId,
    creatorProfileId: row.revisionProfileId,
    displayName: row.displayName,
    headline: row.headline,
    bio: row.bio,
    category: row.categoryId && row.categorySlug && row.categoryName
      ? { id: row.categoryId, slug: row.categorySlug, name: row.categoryName }
      : null,
    status: row.revisionStatus,
    submittedAt: row.submittedAt,
    publishedAt: row.publishedAt,
    reviewedAt: row.reviewedAt,
    reviewReason: row.reviewReason,
    createdAt: row.revisionCreatedAt,
    updatedAt: row.revisionUpdatedAt,
  };
}

function hydrateProfile(row: {
  profileId: string;
  ownerUserId: string;
  profileSlug: string;
  primarySiteId: string;
  profileStatus: FanwardProfileStatus;
  profileCreatedAt: Date;
  profileUpdatedAt: Date;
}): RepositoryFanwardProfile {
  return {
    id: row.profileId,
    ownerUserId: row.ownerUserId,
    slug: row.profileSlug,
    primarySiteId: row.primarySiteId,
    status: row.profileStatus,
    createdAt: row.profileCreatedAt,
    updatedAt: row.profileUpdatedAt,
  };
}

function hydrateSite(row: {
  siteId: string;
  siteSlug: string;
  siteName: string;
  domain: string;
  siteStatus: typeof site.$inferSelect.status;
  ownership: typeof site.$inferSelect.ownership;
  verification: typeof site.$inferSelect.verification;
  logoUrl: string | null;
}): RepositoryFanwardSite {
  return {
    id: row.siteId,
    slug: row.siteSlug,
    name: row.siteName,
    domain: row.domain,
    status: row.siteStatus,
    ownership: row.ownership,
    verification: row.verification,
    logoUrl: row.logoUrl,
  };
}

const publicSelection = {
  profileId: creatorProfile.id,
  ownerUserId: creatorProfile.ownerUserId,
  profileSlug: creatorProfile.slug,
  primarySiteId: creatorProfile.primarySiteId,
  profileStatus: creatorProfile.status,
  profileCreatedAt: creatorProfile.createdAt,
  profileUpdatedAt: creatorProfile.updatedAt,
  ...revisionSelection,
  siteId: site.id,
  siteSlug: site.slug,
  siteName: site.name,
  domain: site.domain,
  siteStatus: site.status,
  ownership: site.ownership,
  verification: site.verification,
  logoUrl: site.logoUrl,
};

const publicEligibility = and(
  eq(creatorProfile.status, "active"),
  isNull(creatorProfile.deletedAt),
  eq(creatorProfileRevision.status, "published"),
  isNotNull(creatorProfileRevision.publishedAt),
  eq(site.status, "active"),
  eq(site.ownership, "claimed"),
  or(eq(site.verification, "tracker"), eq(site.verification, "ga4")),
  eq(site.isDemo, false),
  isNull(site.deletedAt),
  eq(siteOwner.role, "owner"),
  sql`${siteOwner.userId} = ${creatorProfile.ownerUserId}`,
);

function publicFilters(input: Pick<ListPublicFanwardInput, "query" | "categorySlug" | "cursor">) {
  const query = input.query?.trim();
  const cursor = input.cursor;
  return and(
    publicEligibility,
    query
      ? or(
          ilike(creatorProfileRevision.displayName, `%${query}%`),
          ilike(creatorProfileRevision.headline, `%${query}%`),
          ilike(site.name, `%${query}%`),
          ilike(site.domain, `%${query}%`),
        )
      : undefined,
    input.categorySlug ? eq(category.slug, input.categorySlug) : undefined,
    cursor
      ? or(
          lt(creatorProfileRevision.publishedAt, cursor.publishedAt),
          and(
            eq(creatorProfileRevision.publishedAt, cursor.publishedAt),
            gt(creatorProfile.id, cursor.profileId),
          ),
        )
      : undefined,
  );
}

function publicBaseQuery(db: FanwardRepository) {
  return db
    .select(publicSelection)
    .from(creatorProfile)
    .innerJoin(creatorProfileRevision, eq(creatorProfileRevision.creatorProfileId, creatorProfile.id))
    .innerJoin(site, eq(site.id, creatorProfile.primarySiteId))
    .innerJoin(siteOwner, eq(siteOwner.siteId, site.id))
    .leftJoin(category, eq(category.id, creatorProfileRevision.categoryId));
}

export async function listPublicFanwardCreators(
  db: FanwardRepository,
  input: ListPublicFanwardInput,
): Promise<ListPublicFanwardResult> {
  const rows = await publicBaseQuery(db)
    .where(publicFilters(input))
    .orderBy(desc(creatorProfileRevision.publishedAt), asc(creatorProfile.id))
    .limit(input.limit + 1);
  const hasMore = rows.length > input.limit;
  const page = rows.slice(0, input.limit);

  const [totalRows, categoryRows] = await Promise.all([
    db
      .select({ total: sql<number>`count(*)::int` })
      .from(creatorProfile)
      .innerJoin(creatorProfileRevision, eq(creatorProfileRevision.creatorProfileId, creatorProfile.id))
      .innerJoin(site, eq(site.id, creatorProfile.primarySiteId))
      .innerJoin(siteOwner, eq(siteOwner.siteId, site.id))
      .leftJoin(category, eq(category.id, creatorProfileRevision.categoryId))
      .where(publicFilters({ query: input.query, categorySlug: input.categorySlug })),
    db
      .selectDistinct({ id: category.id, slug: category.slug, name: category.name })
      .from(creatorProfile)
      .innerJoin(creatorProfileRevision, eq(creatorProfileRevision.creatorProfileId, creatorProfile.id))
      .innerJoin(site, eq(site.id, creatorProfile.primarySiteId))
      .innerJoin(siteOwner, eq(siteOwner.siteId, site.id))
      .innerJoin(category, eq(category.id, creatorProfileRevision.categoryId))
      .where(publicEligibility)
      .orderBy(asc(category.name), asc(category.id)),
  ]);

  return {
    creators: page.map((row) => ({
      profile: hydrateProfile(row),
      revision: hydrateRevision(row),
      site: hydrateSite(row),
    })),
    hasMore,
    total: totalRows[0]?.total ?? 0,
    categories: categoryRows,
  };
}

export async function findPublicFanwardCreatorBySlug(
  db: FanwardRepository,
  slug: string,
): Promise<RepositoryPublicFanwardCreator | null> {
  const [row] = await publicBaseQuery(db)
    .where(and(publicEligibility, eq(creatorProfile.slug, slug)))
    .limit(1);
  return row
    ? { profile: hydrateProfile(row), revision: hydrateRevision(row), site: hydrateSite(row) }
    : null;
}

export async function loadLatestFanwardScores(
  db: FanwardRepository,
  siteIds: string[],
): Promise<Map<string, RepositoryFanwardScore>> {
  if (!siteIds.length) return new Map();
  const scoreRows = await db
    .selectDistinctOn([siteScore.siteId], {
      id: siteScore.id,
      siteId: siteScore.siteId,
      scoreVersion: siteScore.scoreVersion,
      rankingState: siteScore.rankingState,
      confidence: siteScore.confidence,
      source: siteScore.rankingSource,
      updatedAt: siteScore.calculationSlot,
    })
    .from(siteScore)
    .where(and(inArray(siteScore.siteId, siteIds), eq(siteScore.calculationWindow, "live")))
    .orderBy(siteScore.siteId, desc(siteScore.calculationSlot), desc(siteScore.createdAt));
  if (!scoreRows.length) return new Map();
  const componentRows = await db
    .select({
      scoreId: siteScoreComponent.scoreId,
      component: siteScoreComponent.component,
      normalizedValue: siteScoreComponent.normalizedValue,
      available: siteScoreComponent.available,
    })
    .from(siteScoreComponent)
    .where(inArray(siteScoreComponent.scoreId, scoreRows.map((row) => row.id)));
  const componentsByScore = new Map<string, RepositoryFanwardScore["components"]>();
  for (const row of componentRows) {
    const components = componentsByScore.get(row.scoreId) ?? [];
    components.push({
      component: row.component,
      normalizedValue: Number(row.normalizedValue),
      available: row.available,
    });
    componentsByScore.set(row.scoreId, components);
  }
  return new Map(scoreRows.map((row) => [row.siteId, {
    ...row,
    confidence: Number(row.confidence),
    components: componentsByScore.get(row.id) ?? [],
  }]));
}

export async function listFanwardCategories(db: FanwardRepository): Promise<RepositoryFanwardCategory[]> {
  return db.select({ id: category.id, slug: category.slug, name: category.name }).from(category).orderBy(asc(category.name), asc(category.id));
}

export async function listEligibleFanwardSitesForOwner(
  db: FanwardRepository,
  userId: string,
): Promise<RepositoryFanwardSite[]> {
  const rows = await db
    .select({
      siteId: site.id,
      siteSlug: site.slug,
      siteName: site.name,
      domain: site.domain,
      siteStatus: site.status,
      ownership: site.ownership,
      verification: site.verification,
      logoUrl: site.logoUrl,
    })
    .from(site)
    .innerJoin(siteOwner, eq(siteOwner.siteId, site.id))
    .where(and(
      eq(siteOwner.userId, userId),
      eq(siteOwner.role, "owner"),
      eq(site.status, "active"),
      eq(site.ownership, "claimed"),
      or(eq(site.verification, "tracker"), eq(site.verification, "ga4")),
      eq(site.isDemo, false),
      isNull(site.deletedAt),
    ))
    .orderBy(asc(site.name), asc(site.id));
  return rows.map(hydrateSite);
}

export interface RepositoryFanwardOwnerWorkspace {
  profile: RepositoryFanwardProfile | null;
  revisions: RepositoryFanwardRevision[];
  primarySite: {
    site: RepositoryFanwardSite;
    eligibility: { eligible: boolean; reason: FanwardEligibilityReason | null };
  } | null;
  eligibleSites: RepositoryFanwardSite[];
  categories: RepositoryFanwardCategory[];
}

async function getFanwardPrimarySiteForOwner(
  db: FanwardRepository,
  userId: string,
  siteId: string,
): Promise<RepositoryFanwardOwnerWorkspace["primarySite"]> {
  const [row] = await db
    .select({
      siteId: site.id,
      siteSlug: site.slug,
      siteName: site.name,
      domain: site.domain,
      siteStatus: site.status,
      ownership: site.ownership,
      verification: site.verification,
      logoUrl: site.logoUrl,
      isDemo: site.isDemo,
      deletedAt: site.deletedAt,
      ownerMembershipUserId: siteOwner.userId,
    })
    .from(site)
    .leftJoin(siteOwner, and(
      eq(siteOwner.siteId, site.id),
      eq(siteOwner.userId, userId),
      eq(siteOwner.role, "owner"),
    ))
    .where(eq(site.id, siteId))
    .limit(1);
  if (!row) return null;
  let reason: FanwardEligibilityReason | null = null;
  if (row.deletedAt) reason = "site_not_found";
  else if (!row.ownerMembershipUserId) reason = "site_owner_required";
  else if (row.siteStatus !== "active") reason = "site_not_active";
  else if (row.ownership !== "claimed") reason = "site_not_claimed";
  else if (row.verification !== "tracker" && row.verification !== "ga4") reason = "traffic_not_verified";
  else if (row.isDemo) reason = "demo_site";
  return { site: hydrateSite(row), eligibility: { eligible: reason == null, reason } };
}

export async function getFanwardOwnerWorkspace(
  db: FanwardRepository,
  userId: string,
): Promise<RepositoryFanwardOwnerWorkspace> {
  const [profile] = await db
    .select({
      profileId: creatorProfile.id,
      ownerUserId: creatorProfile.ownerUserId,
      profileSlug: creatorProfile.slug,
      primarySiteId: creatorProfile.primarySiteId,
      profileStatus: creatorProfile.status,
      profileCreatedAt: creatorProfile.createdAt,
      profileUpdatedAt: creatorProfile.updatedAt,
    })
    .from(creatorProfile)
    .where(and(eq(creatorProfile.ownerUserId, userId), isNull(creatorProfile.deletedAt)))
    .limit(1);
  const [eligibleSites, categories, revisions, primarySite] = await Promise.all([
    listEligibleFanwardSitesForOwner(db, userId),
    listFanwardCategories(db),
    profile
      ? db
          .select(revisionSelection)
          .from(creatorProfileRevision)
          .leftJoin(category, eq(category.id, creatorProfileRevision.categoryId))
          .where(eq(creatorProfileRevision.creatorProfileId, profile.profileId))
          .orderBy(desc(creatorProfileRevision.createdAt), desc(creatorProfileRevision.id))
      : Promise.resolve([]),
    profile ? getFanwardPrimarySiteForOwner(db, userId, profile.primarySiteId) : Promise.resolve(null),
  ]);
  return {
    profile: profile ? hydrateProfile(profile) : null,
    revisions: revisions.map(hydrateRevision),
    primarySite,
    eligibleSites,
    categories,
  };
}

export type FanwardOwnerWriteFailure =
  | FanwardEligibilityReason
  | "profile_conflict"
  | "profile_not_found"
  | "primary_site_locked"
  | "category_not_found"
  | "edit_conflict"
  | "pending_exists"
  | "draft_not_found"
  | "draft_incomplete"
  | "profile_suspended";

export type FanwardOwnerWriteResult =
  | { ok: true; profileId: string; revisionId: string }
  | { ok: false; reason: FanwardOwnerWriteFailure; updatedAt?: Date };

export interface SaveFanwardDraftInput {
  userId: string;
  slug: string;
  primarySiteId: string;
  displayName: string;
  headline: string;
  bio: string;
  categoryId: string | null;
  expectedUpdatedAt?: Date;
}

type FanwardTransaction = Parameters<Parameters<FanwardRepository["transaction"]>[0]>[0];

async function lockOwnerNamespace(tx: FanwardTransaction, userId: string): Promise<void> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`fanward-owner:${userId}`}, 0))`);
}

async function lockedSiteEligibility(
  tx: FanwardTransaction,
  userId: string,
  siteId: string,
  profileId?: string,
): Promise<{ eligible: true; site: RepositoryFanwardSite } | { eligible: false; reason: FanwardEligibilityReason }> {
  const [siteRow] = await tx
    .select({
      siteId: site.id,
      siteSlug: site.slug,
      siteName: site.name,
      domain: site.domain,
      siteStatus: site.status,
      ownership: site.ownership,
      verification: site.verification,
      logoUrl: site.logoUrl,
      isDemo: site.isDemo,
      deletedAt: site.deletedAt,
    })
    .from(site)
    .where(eq(site.id, siteId))
    .limit(1)
    .for("update");
  if (!siteRow || siteRow.deletedAt) return { eligible: false, reason: "site_not_found" };
  const [membership] = await tx
    .select({ userId: siteOwner.userId, role: siteOwner.role })
    .from(siteOwner)
    .where(and(eq(siteOwner.siteId, siteId), eq(siteOwner.userId, userId), eq(siteOwner.role, "owner")))
    .limit(1);
  if (!membership) return { eligible: false, reason: "site_owner_required" };
  if (siteRow.siteStatus !== "active") return { eligible: false, reason: "site_not_active" };
  if (siteRow.ownership !== "claimed") return { eligible: false, reason: "site_not_claimed" };
  if (siteRow.verification !== "tracker" && siteRow.verification !== "ga4") return { eligible: false, reason: "traffic_not_verified" };
  if (siteRow.isDemo) return { eligible: false, reason: "demo_site" };
  const [linked] = await tx
    .select({ id: creatorProfile.id })
    .from(creatorProfile)
    .where(and(eq(creatorProfile.primarySiteId, siteId), isNull(creatorProfile.deletedAt)))
    .limit(1);
  if (linked && linked.id !== profileId) return { eligible: false, reason: "site_already_linked" };
  return { eligible: true, site: hydrateSite(siteRow) };
}

async function categoryExists(tx: FanwardTransaction, categoryId: string | null): Promise<boolean> {
  if (!categoryId) return true;
  const [record] = await tx.select({ id: category.id }).from(category).where(eq(category.id, categoryId)).limit(1);
  return Boolean(record);
}

/** Keep the ISO concurrency token strictly monotonic even within one JS millisecond. */
function nextProfileTimestamp(previous?: Date): Date {
  return new Date(Math.max(Date.now(), (previous?.getTime() ?? 0) + 1));
}

export async function saveFanwardDraft(
  db: FanwardRepository,
  input: SaveFanwardDraftInput,
): Promise<FanwardOwnerWriteResult> {
  return db.transaction(async (tx) => {
    await lockOwnerNamespace(tx, input.userId);
    const [existingProfile] = await tx
      .select({
        id: creatorProfile.id,
        primarySiteId: creatorProfile.primarySiteId,
        status: creatorProfile.status,
        updatedAt: creatorProfile.updatedAt,
      })
      .from(creatorProfile)
      .where(and(eq(creatorProfile.ownerUserId, input.userId), isNull(creatorProfile.deletedAt)))
      .limit(1)
      .for("update");

    if (existingProfile?.status === "suspended") return { ok: false, reason: "profile_suspended" };
    if (existingProfile && existingProfile.primarySiteId !== input.primarySiteId) {
      return { ok: false, reason: "primary_site_locked" };
    }
    if (existingProfile && (!input.expectedUpdatedAt || existingProfile.updatedAt.getTime() !== input.expectedUpdatedAt.getTime())) {
      return { ok: false, reason: "edit_conflict", updatedAt: existingProfile.updatedAt };
    }
    const eligibility = await lockedSiteEligibility(tx, input.userId, input.primarySiteId, existingProfile?.id);
    if (!eligibility.eligible) return { ok: false, reason: eligibility.reason };
    if (!await categoryExists(tx, input.categoryId)) return { ok: false, reason: "category_not_found" };

    const now = nextProfileTimestamp(existingProfile?.updatedAt);
    let profileId = existingProfile?.id;
    if (!profileId) {
      const [created] = await tx
        .insert(creatorProfile)
        .values({
          ownerUserId: input.userId,
          slug: input.slug,
          primarySiteId: input.primarySiteId,
          status: "draft",
          updatedAt: now,
        })
        .onConflictDoNothing()
        .returning({ id: creatorProfile.id });
      if (!created) return { ok: false, reason: "profile_conflict" };
      profileId = created.id;
    }

    const [pending] = await tx
      .select({ id: creatorProfileRevision.id })
      .from(creatorProfileRevision)
      .where(and(eq(creatorProfileRevision.creatorProfileId, profileId), eq(creatorProfileRevision.status, "pending")))
      .limit(1)
      .for("update");
    if (pending) return { ok: false, reason: "pending_exists" };
    const [draft] = await tx
      .select({ id: creatorProfileRevision.id })
      .from(creatorProfileRevision)
      .where(and(eq(creatorProfileRevision.creatorProfileId, profileId), eq(creatorProfileRevision.status, "draft")))
      .limit(1)
      .for("update");
    const revisionValues = {
      displayName: input.displayName,
      headline: input.headline,
      bio: input.bio,
      categoryId: input.categoryId,
      createdByUserId: input.userId,
      reviewReason: null,
      reviewedAt: null,
      reviewedByUserId: null,
      updatedAt: now,
    };
    const revisionId = draft
      ? (await tx
          .update(creatorProfileRevision)
          .set(revisionValues)
          .where(and(eq(creatorProfileRevision.id, draft.id), eq(creatorProfileRevision.status, "draft")))
          .returning({ id: creatorProfileRevision.id }))[0]?.id
      : (await tx
          .insert(creatorProfileRevision)
          .values({ ...revisionValues, creatorProfileId: profileId, status: "draft" })
          .returning({ id: creatorProfileRevision.id }))[0]?.id;
    if (!revisionId) return { ok: false, reason: "profile_conflict" };
    await tx
      .update(creatorProfile)
      .set({ status: existingProfile?.status === "active" ? "active" : "draft", updatedAt: now })
      .where(eq(creatorProfile.id, profileId));
    return { ok: true, profileId, revisionId };
  });
}

export async function submitFanwardDraft(
  db: FanwardRepository,
  input: { userId: string; expectedUpdatedAt: Date },
): Promise<FanwardOwnerWriteResult> {
  return db.transaction(async (tx) => {
    await lockOwnerNamespace(tx, input.userId);
    const [profile] = await tx
      .select({ id: creatorProfile.id, primarySiteId: creatorProfile.primarySiteId, status: creatorProfile.status, updatedAt: creatorProfile.updatedAt })
      .from(creatorProfile)
      .where(and(eq(creatorProfile.ownerUserId, input.userId), isNull(creatorProfile.deletedAt)))
      .limit(1)
      .for("update");
    if (!profile) return { ok: false, reason: "profile_not_found" };
    if (profile.status === "suspended") return { ok: false, reason: "profile_suspended" };
    if (profile.updatedAt.getTime() !== input.expectedUpdatedAt.getTime()) {
      return { ok: false, reason: "edit_conflict", updatedAt: profile.updatedAt };
    }
    const eligibility = await lockedSiteEligibility(tx, input.userId, profile.primarySiteId, profile.id);
    if (!eligibility.eligible) return { ok: false, reason: eligibility.reason };
    const [pending] = await tx
      .select({ id: creatorProfileRevision.id })
      .from(creatorProfileRevision)
      .where(and(eq(creatorProfileRevision.creatorProfileId, profile.id), eq(creatorProfileRevision.status, "pending")))
      .limit(1)
      .for("update");
    if (pending) return { ok: false, reason: "pending_exists" };
    const [draft] = await tx
      .select({
        id: creatorProfileRevision.id,
        displayName: creatorProfileRevision.displayName,
        headline: creatorProfileRevision.headline,
        bio: creatorProfileRevision.bio,
        categoryId: creatorProfileRevision.categoryId,
      })
      .from(creatorProfileRevision)
      .where(and(eq(creatorProfileRevision.creatorProfileId, profile.id), eq(creatorProfileRevision.status, "draft")))
      .limit(1)
      .for("update");
    if (!draft) return { ok: false, reason: "draft_not_found" };
    if (
      draft.displayName.trim().length < 2
      || draft.displayName.trim().length > 80
      || draft.headline.trim().length < 8
      || draft.headline.trim().length > 160
      || draft.bio.trim().length < 40
      || draft.bio.trim().length > 2_000
      || !draft.categoryId
    ) {
      return { ok: false, reason: "draft_incomplete" };
    }
    const now = nextProfileTimestamp(profile.updatedAt);
    const [transitioned] = await tx
      .update(creatorProfileRevision)
      .set({ status: "pending", submittedAt: now, updatedAt: now })
      .where(and(eq(creatorProfileRevision.id, draft.id), eq(creatorProfileRevision.status, "draft")))
      .returning({ id: creatorProfileRevision.id });
    if (!transitioned) return { ok: false, reason: "draft_not_found" };
    await tx
      .update(creatorProfile)
      .set({ status: profile.status === "active" ? "active" : "pending", updatedAt: now })
      .where(eq(creatorProfile.id, profile.id));
    return { ok: true, profileId: profile.id, revisionId: transitioned.id };
  });
}

export interface RepositoryFanwardAdminItem {
  profile: RepositoryFanwardProfile;
  owner: { id: string; name: string; email: string };
  site: RepositoryFanwardSite;
  pendingRevision: RepositoryFanwardRevision | null;
  publishedRevision: RepositoryFanwardRevision | null;
  eligibility: { eligible: boolean; reason: FanwardEligibilityReason | null };
}

export interface ListFanwardAdminQueueInput {
  query?: string;
  limit: number;
  offset: number;
}

export interface ListFanwardAdminQueueResult {
  items: RepositoryFanwardAdminItem[];
  total: number;
}

function eligibilityFromAdminRow(row: {
  ownerMembershipUserId: string | null;
  siteStatus: typeof site.$inferSelect.status;
  ownership: typeof site.$inferSelect.ownership;
  verification: typeof site.$inferSelect.verification;
  siteIsDemo: boolean;
  siteDeletedAt: Date | null;
}): { eligible: boolean; reason: FanwardEligibilityReason | null } {
  if (row.siteDeletedAt) return { eligible: false, reason: "site_not_found" };
  if (!row.ownerMembershipUserId) return { eligible: false, reason: "site_owner_required" };
  if (row.siteStatus !== "active") return { eligible: false, reason: "site_not_active" };
  if (row.ownership !== "claimed") return { eligible: false, reason: "site_not_claimed" };
  if (row.verification !== "tracker" && row.verification !== "ga4") return { eligible: false, reason: "traffic_not_verified" };
  if (row.siteIsDemo) return { eligible: false, reason: "demo_site" };
  return { eligible: true, reason: null };
}

export async function listFanwardAdminQueue(
  db: FanwardRepository,
  input: ListFanwardAdminQueueInput,
): Promise<ListFanwardAdminQueueResult> {
  const query = input.query?.trim();
  const hasPending = sql<boolean>`exists (
    select 1 from ${creatorProfileRevision}
    where ${creatorProfileRevision.creatorProfileId} = ${creatorProfile.id}
      and ${creatorProfileRevision.status} = 'pending'
  )`;
  const hasPublished = sql<boolean>`exists (
    select 1 from ${creatorProfileRevision}
    where ${creatorProfileRevision.creatorProfileId} = ${creatorProfile.id}
      and ${creatorProfileRevision.status} = 'published'
  )`;
  const where = and(
    isNull(creatorProfile.deletedAt),
    or(
      hasPending,
      and(inArray(creatorProfile.status, ["active", "suspended"]), hasPublished),
    ),
    query
      ? or(
          ilike(creatorProfile.slug, `%${query}%`),
          ilike(site.name, `%${query}%`),
          ilike(site.domain, `%${query}%`),
          ilike(user.email, `%${query}%`),
          sql<boolean>`exists (
            select 1 from ${creatorProfileRevision}
            where ${creatorProfileRevision.creatorProfileId} = ${creatorProfile.id}
              and ${creatorProfileRevision.status} in ('pending', 'published')
              and (
                ${creatorProfileRevision.displayName} ilike ${`%${query}%`}
                or ${creatorProfileRevision.headline} ilike ${`%${query}%`}
              )
          )`,
        )
      : undefined,
  );
  const adminSelection = {
    profileId: creatorProfile.id,
    ownerUserId: creatorProfile.ownerUserId,
    profileSlug: creatorProfile.slug,
    primarySiteId: creatorProfile.primarySiteId,
    profileStatus: creatorProfile.status,
    profileCreatedAt: creatorProfile.createdAt,
    profileUpdatedAt: creatorProfile.updatedAt,
    ownerName: user.name,
    ownerEmail: user.email,
    siteId: site.id,
    siteSlug: site.slug,
    siteName: site.name,
    domain: site.domain,
    siteStatus: site.status,
    ownership: site.ownership,
    verification: site.verification,
    logoUrl: site.logoUrl,
    siteIsDemo: site.isDemo,
    siteDeletedAt: site.deletedAt,
    ownerMembershipUserId: siteOwner.userId,
  };
  const base = db
    .select(adminSelection)
    .from(creatorProfile)
    .innerJoin(user, eq(user.id, creatorProfile.ownerUserId))
    .innerJoin(site, eq(site.id, creatorProfile.primarySiteId))
    .leftJoin(siteOwner, and(
      eq(siteOwner.siteId, site.id),
      eq(siteOwner.userId, creatorProfile.ownerUserId),
      eq(siteOwner.role, "owner"),
    ));
  const rows = await base
    .where(where)
    .orderBy(
      sql`case when ${creatorProfile.status} = 'suspended' then 0 when ${hasPending} then 1 else 2 end`,
      desc(creatorProfile.updatedAt),
      asc(creatorProfile.id),
    )
    .limit(input.limit)
    .offset(input.offset);
  const [totalRow] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(creatorProfile)
    .innerJoin(user, eq(user.id, creatorProfile.ownerUserId))
    .innerJoin(site, eq(site.id, creatorProfile.primarySiteId))
    .where(where);
  const profileIds = rows.map((row) => row.profileId);
  const revisionRows = profileIds.length
    ? await db
        .select(revisionSelection)
        .from(creatorProfileRevision)
        .leftJoin(category, eq(category.id, creatorProfileRevision.categoryId))
        .where(and(
          inArray(creatorProfileRevision.creatorProfileId, profileIds),
          inArray(creatorProfileRevision.status, ["pending", "published"]),
        ))
    : [];
  const pendingByProfile = new Map(
    revisionRows
      .filter((row) => row.revisionStatus === "pending")
      .map((row) => [row.revisionProfileId, hydrateRevision(row)]),
  );
  const publishedByProfile = new Map(
    revisionRows
      .filter((row) => row.revisionStatus === "published")
      .map((row) => [row.revisionProfileId, hydrateRevision(row)]),
  );
  return {
    items: rows.map((row) => ({
      profile: hydrateProfile(row),
      owner: { id: row.ownerUserId, name: row.ownerName, email: row.ownerEmail },
      site: hydrateSite(row),
      pendingRevision: pendingByProfile.get(row.profileId) ?? null,
      publishedRevision: publishedByProfile.get(row.profileId) ?? null,
      eligibility: eligibilityFromAdminRow(row),
    })),
    total: totalRow?.total ?? 0,
  };
}

export type FanwardReviewAction = "approve" | "reject" | "suspend" | "restore";
export type FanwardReviewFailure = FanwardEligibilityReason | "target_not_found" | "invalid_transition";
export type FanwardReviewResult =
  | { ok: true; profileId: string; profileStatus: FanwardProfileStatus; revisionId: string | null; revisionStatus: FanwardRevisionStatus | null }
  | { ok: false; reason: FanwardReviewFailure };

export interface ReviewFanwardProfileInput {
  adminUserId: string;
  profileId: string;
  revisionId?: string;
  action: FanwardReviewAction;
  reason: string;
  requestId: string;
}

async function writeFanwardAudit(
  tx: Pick<FanwardTransaction, "insert">,
  input: ReviewFanwardProfileInput,
  previousState: Record<string, unknown>,
  newState: Record<string, unknown>,
): Promise<void> {
  const action = `fanward_${input.action}`;
  await tx.insert(moderationAction).values({
    actorUserId: input.adminUserId,
    action,
    targetType: "creator_profile",
    targetId: input.profileId,
    previousState,
    newState,
    reason: input.reason,
    requestId: input.requestId,
  });
  await tx.insert(adminAuditLog).values({
    actorUserId: input.adminUserId,
    action,
    targetType: "creator_profile",
    targetId: input.profileId,
    previousState,
    newState,
    details: { revisionId: input.revisionId ?? null, action: input.action },
    reason: input.reason,
    requestId: input.requestId,
  });
}

export async function reviewFanwardProfile(
  db: FanwardRepository,
  input: ReviewFanwardProfileInput,
): Promise<FanwardReviewResult> {
  return db.transaction(async (tx) => {
    const [profile] = await tx
      .select({
        id: creatorProfile.id,
        ownerUserId: creatorProfile.ownerUserId,
        primarySiteId: creatorProfile.primarySiteId,
        status: creatorProfile.status,
        updatedAt: creatorProfile.updatedAt,
      })
      .from(creatorProfile)
      .where(and(eq(creatorProfile.id, input.profileId), isNull(creatorProfile.deletedAt)))
      .limit(1)
      .for("update");
    if (!profile) return { ok: false, reason: "target_not_found" };
    const now = nextProfileTimestamp(profile.updatedAt);
    const previousState: Record<string, unknown> = { profileStatus: profile.status };

    if (input.action === "suspend") {
      if (profile.status !== "active") return { ok: false, reason: "invalid_transition" };
      await tx.update(creatorProfile).set({ status: "suspended", updatedAt: now }).where(eq(creatorProfile.id, profile.id));
      const newState = { profileStatus: "suspended" };
      await writeFanwardAudit(tx, input, previousState, newState);
      return { ok: true, profileId: profile.id, profileStatus: "suspended", revisionId: null, revisionStatus: null };
    }

    if (input.action === "restore") {
      if (profile.status !== "suspended") return { ok: false, reason: "invalid_transition" };
      const eligibility = await lockedSiteEligibility(tx, profile.ownerUserId, profile.primarySiteId, profile.id);
      if (!eligibility.eligible) return { ok: false, reason: eligibility.reason };
      const [published] = await tx
        .select({ id: creatorProfileRevision.id })
        .from(creatorProfileRevision)
        .where(and(eq(creatorProfileRevision.creatorProfileId, profile.id), eq(creatorProfileRevision.status, "published")))
        .limit(1)
        .for("update");
      if (!published) return { ok: false, reason: "invalid_transition" };
      await tx.update(creatorProfile).set({ status: "active", updatedAt: now }).where(eq(creatorProfile.id, profile.id));
      const newState = { profileStatus: "active", revisionId: published.id, revisionStatus: "published" };
      await writeFanwardAudit(tx, { ...input, revisionId: published.id }, previousState, newState);
      return { ok: true, profileId: profile.id, profileStatus: "active", revisionId: published.id, revisionStatus: "published" };
    }

    // A pending edit may coexist with a suspended published profile. Approval
    // cannot implicitly restore it, but rejection is safe and keeps it hidden.
    if (profile.status === "suspended" && input.action === "approve") {
      return { ok: false, reason: "invalid_transition" };
    }

    const [pending] = await tx
      .select({ id: creatorProfileRevision.id, status: creatorProfileRevision.status })
      .from(creatorProfileRevision)
      .where(and(
        eq(creatorProfileRevision.creatorProfileId, profile.id),
        eq(creatorProfileRevision.status, "pending"),
        input.revisionId ? eq(creatorProfileRevision.id, input.revisionId) : undefined,
      ))
      .limit(1)
      .for("update");
    if (!pending) return { ok: false, reason: "invalid_transition" };
    previousState.revisionId = pending.id;
    previousState.revisionStatus = pending.status;

    if (input.action === "approve") {
      const eligibility = await lockedSiteEligibility(tx, profile.ownerUserId, profile.primarySiteId, profile.id);
      if (!eligibility.eligible) return { ok: false, reason: eligibility.reason };
      await tx
        .update(creatorProfileRevision)
        .set({ status: "superseded", updatedAt: now })
        .where(and(eq(creatorProfileRevision.creatorProfileId, profile.id), eq(creatorProfileRevision.status, "published")));
      const [published] = await tx
        .update(creatorProfileRevision)
        .set({
          status: "published",
          publishedAt: now,
          reviewedAt: now,
          reviewedByUserId: input.adminUserId,
          reviewReason: input.reason,
          updatedAt: now,
        })
        .where(and(eq(creatorProfileRevision.id, pending.id), eq(creatorProfileRevision.status, "pending")))
        .returning({ id: creatorProfileRevision.id });
      if (!published) return { ok: false, reason: "invalid_transition" };
      await tx.update(creatorProfile).set({ status: "active", updatedAt: now }).where(eq(creatorProfile.id, profile.id));
      const newState = { profileStatus: "active", revisionId: published.id, revisionStatus: "published" };
      await writeFanwardAudit(tx, { ...input, revisionId: pending.id }, previousState, newState);
      return { ok: true, profileId: profile.id, profileStatus: "active", revisionId: published.id, revisionStatus: "published" };
    }

    if (input.action === "reject") {
      const [rejected] = await tx
        .update(creatorProfileRevision)
        .set({
          status: "rejected",
          reviewedAt: now,
          reviewedByUserId: input.adminUserId,
          reviewReason: input.reason,
          updatedAt: now,
        })
        .where(and(eq(creatorProfileRevision.id, pending.id), eq(creatorProfileRevision.status, "pending")))
        .returning({ id: creatorProfileRevision.id });
      if (!rejected) return { ok: false, reason: "invalid_transition" };
      const [published] = await tx
        .select({ id: creatorProfileRevision.id })
        .from(creatorProfileRevision)
        .where(and(eq(creatorProfileRevision.creatorProfileId, profile.id), eq(creatorProfileRevision.status, "published")))
        .limit(1);
      const profileStatus: FanwardProfileStatus = profile.status === "suspended"
        ? "suspended"
        : published ? "active" : "rejected";
      await tx.update(creatorProfile).set({ status: profileStatus, updatedAt: now }).where(eq(creatorProfile.id, profile.id));
      const newState = { profileStatus, revisionId: rejected.id, revisionStatus: "rejected" };
      await writeFanwardAudit(tx, { ...input, revisionId: pending.id }, previousState, newState);
      return { ok: true, profileId: profile.id, profileStatus, revisionId: rejected.id, revisionStatus: "rejected" };
    }

    return { ok: false, reason: "invalid_transition" };
  });
}
