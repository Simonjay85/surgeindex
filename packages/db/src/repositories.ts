import {
  and,
  asc,
  desc,
  eq,
  ilike,
  isNull,
  or,
  sql,
} from "drizzle-orm";
import type { PostgresDatabase } from "./connection";
import {
  activityEvent,
  adminAuditLog,
  category,
  moderationAction,
  rankSnapshot,
  site,
  siteCategory,
  siteClaim,
  siteMetricCurrent,
  siteMetricSnapshot,
  siteOwner,
} from "./schema";

export type Repository = PostgresDatabase;

export interface RepositorySite {
  id: string;
  slug: string;
  domain: string;
  name: string;
  description: string;
  categoryId: string | null;
  categorySlug: string;
  categoryName: string;
  status: "pending" | "active" | "suspended" | "rejected";
  verification: "tracker" | "ga4" | "unverified";
  ownership: "unclaimed" | "claimed";
  logoUrl: string | null;
  faviconUrl: string | null;
  submittedByUserId: string | null;
  featured: boolean;
  isDemo: boolean;
  createdAt: Date;
  current: {
    activeNow: number | null;
    visitors24h: number | null;
    visitors7d: number | null;
    pageviews24h: number | null;
    engagementRate: number | null;
    avgEngagementSeconds: number | null;
    baselineDailyVisitors: number | null;
    typicalActiveNow: number | null;
    growth24hPct: number | null;
    growth7dPct: number | null;
    surgeReferrals24h: number;
    heatScore: number;
    heatLeague: string;
    scoreVersion: string;
    updatedAt: Date;
  } | null;
  rank: { rank: number; previousRank: number | null; capturedAt: Date } | null;
}

export interface RepositoryCategory {
  id: string;
  slug: string;
  name: string;
  description: string;
  siteCount: number;
}

export interface RepositoryActivity {
  id: string;
  type: string;
  siteId: string | null;
  siteSlug: string | null;
  siteName: string | null;
  domain: string | null;
  detail: string | null;
  payload: Record<string, unknown> | null;
  occurredAt: Date;
  isDemo: boolean;
}

export interface RepositoryClaimReview {
  id: string;
  siteId: string;
  siteName: string;
  domain: string;
  userId: string;
  method: "meta_tag" | "html_file" | "dns_txt" | "tracker" | "ga4";
  status: "pending" | "verified" | "failed" | "expired";
  attempts: number;
  lastError: string | null;
  requestedAt: Date;
  expiresAt: Date;
  verifiedAt: Date | null;
}

const siteSelection = {
  id: site.id,
  slug: site.slug,
  domain: site.domain,
  name: site.name,
  description: site.description,
  categoryId: site.categoryId,
  categorySlug: category.slug,
  categoryName: category.name,
  status: site.status,
  verification: site.verification,
  ownership: site.ownership,
  logoUrl: site.logoUrl,
  faviconUrl: site.faviconUrl,
  submittedByUserId: site.submittedByUserId,
  featured: site.featured,
  isDemo: site.isDemo,
  createdAt: site.createdAt,
  current: siteMetricCurrent,
  rank: rankSnapshot,
};

type SiteJoinRow = {
  id: string;
  slug: string;
  domain: string;
  name: string;
  description: string;
  categoryId: string | null;
  categorySlug: string | null;
  categoryName: string | null;
  status: "pending" | "active" | "suspended" | "rejected";
  verification: "tracker" | "ga4" | "unverified";
  ownership: "unclaimed" | "claimed";
  logoUrl: string | null;
  faviconUrl: string | null;
  submittedByUserId: string | null;
  featured: boolean;
  isDemo: boolean;
  createdAt: Date;
  current: {
    siteId: string;
    activeNow: number | null;
    visitors24h: number | null;
    visitors7d: number | null;
    pageviews24h: number | null;
    engagementRate: string | null;
    avgEngagementSeconds: number | null;
    baselineDailyVisitors: number | null;
    typicalActiveNow: number | null;
    growth24hPct: string | null;
    growth7dPct: string | null;
    surgeReferrals24h: number;
    heatScore: number;
    heatLeague: string;
    scoreVersion: string;
    updatedAt: Date;
  } | null;
  rank: { siteId: string; rank: number; previousRank: number | null; capturedAt: Date } | null;
};

function hydrateSite(row: SiteJoinRow): RepositorySite {
  const current = row.current?.siteId
    ? {
        activeNow: row.current.activeNow,
        visitors24h: row.current.visitors24h,
        visitors7d: row.current.visitors7d,
        pageviews24h: row.current.pageviews24h,
        engagementRate: row.current.engagementRate == null ? null : Number(row.current.engagementRate),
        avgEngagementSeconds: row.current.avgEngagementSeconds,
        baselineDailyVisitors: row.current.baselineDailyVisitors,
        typicalActiveNow: row.current.typicalActiveNow,
        growth24hPct: row.current.growth24hPct == null ? null : Number(row.current.growth24hPct),
        growth7dPct: row.current.growth7dPct == null ? null : Number(row.current.growth7dPct),
        surgeReferrals24h: row.current.surgeReferrals24h,
        heatScore: row.current.heatScore,
        heatLeague: row.current.heatLeague,
        scoreVersion: row.current.scoreVersion,
        updatedAt: row.current.updatedAt,
      }
    : null;
  const rank = row.rank?.siteId
    ? { rank: row.rank.rank, previousRank: row.rank.previousRank, capturedAt: row.rank.capturedAt }
    : null;
  return {
    ...row,
    categorySlug: row.categorySlug ?? "uncategorized",
    categoryName: row.categoryName ?? "Uncategorized",
    current,
    rank,
  };
}

function publicSitePredicate() {
  return and(eq(site.status, "active"), isNull(site.deletedAt), eq(site.isDemo, false));
}

async function selectSites(db: Repository, where: ReturnType<typeof and>) {
  const rows = await db
    .select(siteSelection)
    .from(site)
    .leftJoin(category, eq(site.categoryId, category.id))
    .leftJoin(siteMetricCurrent, eq(siteMetricCurrent.siteId, site.id))
    .leftJoin(
      rankSnapshot,
      and(
        eq(rankSnapshot.siteId, site.id),
        eq(rankSnapshot.scope, "global"),
        eq(rankSnapshot.window, "live"),
        sql`${rankSnapshot.capturedAt} = (select max(rs.captured_at) from rank_snapshot rs where rs.site_id = ${site.id} and rs.scope = 'global' and rs.window = 'live')`,
      ),
    )
    .where(where);
  return rows.map((row) => hydrateSite(row));
}

export async function findPublicSiteBySlug(db: Repository, slug: string): Promise<RepositorySite | null> {
  const rows = await selectSites(db, and(publicSitePredicate(), eq(site.slug, slug)));
  return rows[0] ?? null;
}

export async function findSiteById(db: Repository, id: string): Promise<RepositorySite | null> {
  const rows = await selectSites(db, and(isNull(site.deletedAt), eq(site.id, id)));
  return rows[0] ?? null;
}

export async function findSiteByDomain(db: Repository, domain: string): Promise<RepositorySite | null> {
  const rows = await selectSites(db, and(isNull(site.deletedAt), eq(site.domain, domain)));
  return rows[0] ?? null;
}

export async function listPublicSites(
  db: Repository,
  input: { categorySlug?: string; query?: string; status?: "active" | "pending" | "suspended"; limit?: number },
): Promise<RepositorySite[]> {
  const conditions = [
    input.status ? eq(site.status, input.status) : publicSitePredicate(),
    input.categorySlug && input.categorySlug !== "all" ? eq(category.slug, input.categorySlug) : undefined,
    input.query
      ? or(ilike(site.name, `%${input.query}%`), ilike(site.domain, `%${input.query}%`), ilike(site.description, `%${input.query}%`))
      : undefined,
  ].filter(Boolean) as Array<ReturnType<typeof eq>>;
  const rows = await selectSites(db, and(...conditions));
  return rows
    .sort((a, b) => (b.current?.heatScore ?? 0) - (a.current?.heatScore ?? 0) || a.createdAt.getTime() - b.createdAt.getTime())
    .slice(0, input.limit ?? 50);
}

export async function listNewPublicSites(db: Repository, limit = 50, categorySlug?: string, query?: string): Promise<RepositorySite[]> {
  const rows = await listPublicSites(db, { limit, categorySlug, query });
  return rows.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).slice(0, limit);
}

export async function listBreakoutSites(db: Repository, limit = 50, categorySlug?: string, query?: string): Promise<RepositorySite[]> {
  const rows = await listPublicSites(db, { limit: Math.max(limit, 100), categorySlug, query });
  return rows
    .filter((row) => row.current?.growth24hPct != null && row.current.visitors24h != null)
    .sort((a, b) => (b.current?.growth24hPct ?? -Infinity) - (a.current?.growth24hPct ?? -Infinity))
    .slice(0, limit);
}

export async function listCategories(db: Repository): Promise<RepositoryCategory[]> {
  const rows = await db
    .select({ id: category.id, slug: category.slug, name: category.name, description: category.description, siteCount: sql<number>`count(${site.id})::int` })
    .from(category)
    .leftJoin(site, and(eq(site.categoryId, category.id), publicSitePredicate()))
    .groupBy(category.id)
    .orderBy(asc(category.sortOrder), asc(category.name));
  return rows.map((row) => ({ ...row, siteCount: Number(row.siteCount) }));
}

export async function findCategoryBySlug(db: Repository, slug: string) {
  const [row] = await db.select({ id: category.id, slug: category.slug, name: category.name }).from(category).where(eq(category.slug, slug)).limit(1);
  return row ?? null;
}

export async function listActivity(db: Repository, limit = 30): Promise<RepositoryActivity[]> {
  const rows = await db
    .select({
      id: activityEvent.id,
      type: activityEvent.type,
      siteId: activityEvent.siteId,
      siteSlug: site.slug,
      siteName: site.name,
      domain: site.domain,
      detail: activityEvent.detail,
      payload: activityEvent.payload,
      occurredAt: activityEvent.occurredAt,
      isDemo: activityEvent.isDemo,
    })
    .from(activityEvent)
    .leftJoin(site, eq(activityEvent.siteId, site.id))
    .where(and(eq(activityEvent.isDemo, false), or(eq(site.status, "active"), isNull(site.id))))
    .orderBy(desc(activityEvent.occurredAt))
    .limit(limit);
  return rows;
}

/**
 * Owner-scoped activity includes submissions that are still pending as well
 * as sites that have already acquired an owner relation. It never broadens
 * the public feed or exposes another user's private site events.
 */
export async function listActivityForUser(db: Repository, userId: string, limit = 30): Promise<RepositoryActivity[]> {
  const rows = await db
    .select({
      id: activityEvent.id,
      type: activityEvent.type,
      siteId: activityEvent.siteId,
      siteSlug: site.slug,
      siteName: site.name,
      domain: site.domain,
      detail: activityEvent.detail,
      payload: activityEvent.payload,
      occurredAt: activityEvent.occurredAt,
      isDemo: activityEvent.isDemo,
    })
    .from(activityEvent)
    .innerJoin(site, eq(activityEvent.siteId, site.id))
    .where(and(
      eq(activityEvent.isDemo, false),
      isNull(site.deletedAt),
      or(
        eq(site.submittedByUserId, userId),
        sql`exists (select 1 from site_owner owner_link where owner_link.site_id = ${site.id} and owner_link.user_id = ${userId})`,
      ),
    ))
    .orderBy(desc(activityEvent.occurredAt))
    .limit(limit);
  return rows;
}

/** Failed and expired proof attempts are visible to admins for manual review. */
export async function listClaimReviews(db: Repository, limit = 100): Promise<RepositoryClaimReview[]> {
  return db
    .select({
      id: siteClaim.id,
      siteId: siteClaim.siteId,
      siteName: site.name,
      domain: site.domain,
      userId: siteClaim.userId,
      method: siteClaim.method,
      status: siteClaim.status,
      attempts: siteClaim.attempts,
      lastError: siteClaim.lastError,
      requestedAt: siteClaim.requestedAt,
      expiresAt: siteClaim.expiresAt,
      verifiedAt: siteClaim.verifiedAt,
    })
    .from(siteClaim)
    .innerJoin(site, eq(siteClaim.siteId, site.id))
    .where(or(eq(siteClaim.status, "failed"), eq(siteClaim.status, "expired")))
    .orderBy(desc(siteClaim.requestedAt))
    .limit(limit);
}

export async function getSnapshots(db: Repository, siteId: string, limit = 24) {
  return db
    .select({ capturedAt: siteMetricSnapshot.capturedAt, visitors: siteMetricSnapshot.visitors, activeNow: siteMetricSnapshot.activeNow, growthPct: siteMetricSnapshot.growthPct, heatScore: siteMetricSnapshot.heatScore })
    .from(siteMetricSnapshot)
    .where(eq(siteMetricSnapshot.siteId, siteId))
    .orderBy(desc(siteMetricSnapshot.capturedAt))
    .limit(limit);
}

export async function getRankHistory(db: Repository, siteId: string, limit = 12) {
  return db
    .select({ capturedAt: rankSnapshot.capturedAt, rank: rankSnapshot.rank, previousRank: rankSnapshot.previousRank })
    .from(rankSnapshot)
    .where(and(eq(rankSnapshot.siteId, siteId), eq(rankSnapshot.scope, "global"), eq(rankSnapshot.window, "live")))
    .orderBy(desc(rankSnapshot.capturedAt))
    .limit(limit);
}

export async function listSitesForOwner(db: Repository, userId: string): Promise<RepositorySite[]> {
  return selectSites(db, and(
    isNull(site.deletedAt),
    or(
      eq(site.submittedByUserId, userId),
      sql`exists (select 1 from site_owner owner_link where owner_link.site_id = ${site.id} and owner_link.user_id = ${userId})`,
    ),
  ));
}

export async function createPendingSite(
  db: Repository,
  input: {
    domain: string;
    slug: string;
    name: string;
    description: string;
    categoryId: string | null;
    submittedByUserId: string;
    requestId: string;
  },
) {
  return db.transaction(async (tx) => {
    const [existing] = await tx.select({ id: site.id }).from(site).where(eq(site.domain, input.domain)).limit(1);
    if (existing) return { duplicate: true as const, siteId: existing.id };
    const [created] = await tx
      .insert(site)
      .values({
        domain: input.domain,
        slug: input.slug,
        name: input.name,
        description: input.description,
        categoryId: input.categoryId,
        status: "pending",
        submittedByUserId: input.submittedByUserId,
        isDemo: false,
      })
      .returning({ id: site.id, slug: site.slug });
    if (!created) throw new Error("site_insert_failed");
    if (input.categoryId) {
      await tx.insert(siteCategory).values({ siteId: created.id, categoryId: input.categoryId }).onConflictDoNothing();
    }
    await tx.insert(activityEvent).values({ type: "site_submitted", siteId: created.id, detail: "Site submitted for moderation.", isDemo: false });
    return { duplicate: false as const, siteId: created.id, slug: created.slug };
  });
}

export async function listPendingSites(db: Repository, limit = 100, query?: string): Promise<RepositorySite[]> {
  return selectSites(db, and(
    eq(site.status, "pending"),
    isNull(site.deletedAt),
    eq(site.isDemo, false),
    query ? or(ilike(site.name, `%${query}%`), ilike(site.domain, `%${query}%`), ilike(site.description, `%${query}%`)) : undefined,
  )).then((rows) => rows.slice(0, limit));
}

export async function updateSiteCategory(db: Repository, input: { siteId: string; categoryId: string; adminUserId: string; reason: string; requestId: string }) {
  return db.transaction(async (tx) => {
    const [before] = await tx.select({ categoryId: site.categoryId }).from(site).where(eq(site.id, input.siteId)).limit(1);
    if (!before) return false;
    await tx.update(site).set({ categoryId: input.categoryId, updatedAt: new Date() }).where(eq(site.id, input.siteId));
    await tx.insert(siteCategory).values({ siteId: input.siteId, categoryId: input.categoryId }).onConflictDoNothing();
    await tx.insert(activityEvent).values({ type: "category_changed", siteId: input.siteId, detail: "Category updated by moderation.", isDemo: false });
    await writeAudit(tx, { ...input, action: "category_changed", targetType: "site", targetId: input.siteId, previousState: { categoryId: before.categoryId }, newState: { categoryId: input.categoryId } });
    return true;
  });
}

export async function moderateSite(
  db: Repository,
  input: { siteId: string; adminUserId: string; action: "approve" | "reject" | "suspend" | "restore"; reason: string; requestId: string },
) {
  const nextStatus = { approve: "active", reject: "rejected", suspend: "suspended", restore: "active" }[input.action] as "active" | "rejected" | "suspended";
  const activityType = { approve: "site_approved", reject: "site_rejected", suspend: "site_suspended", restore: "site_restored" }[input.action] as "site_approved" | "site_rejected" | "site_suspended" | "site_restored";
  return db.transaction(async (tx) => {
    const [before] = await tx.select({ status: site.status }).from(site).where(eq(site.id, input.siteId)).limit(1);
    if (!before) return false;
    await tx.update(site).set({ status: nextStatus, updatedAt: new Date() }).where(eq(site.id, input.siteId));
    await tx.insert(activityEvent).values({ type: activityType, siteId: input.siteId, detail: input.reason, isDemo: false });
    await writeAudit(tx, { ...input, action: input.action, targetType: "site", targetId: input.siteId, previousState: { status: before.status }, newState: { status: nextStatus } });
    return true;
  });
}

export async function createClaim(
  db: Repository,
  input: { siteId: string; userId: string; method: "meta_tag" | "dns_txt"; token: string; expiresAt: Date },
) {
  return db.transaction(async (tx) => {
    const [target] = await tx.select({ id: site.id, domain: site.domain, ownership: site.ownership }).from(site).where(eq(site.id, input.siteId)).limit(1);
    if (!target) return { ok: false as const, reason: "site_not_found" as const };
    const owners = await tx.select({ userId: siteOwner.userId, role: siteOwner.role }).from(siteOwner).where(eq(siteOwner.siteId, input.siteId));
    if (owners.some((owner) => owner.role === "owner" && owner.userId !== input.userId)) {
      await tx.insert(siteClaim).values({ ...input, status: "failed", lastError: "ownership_conflict", usedAt: new Date() });
      return { ok: false as const, reason: "ownership_conflict" as const };
    }
    const [claim] = await tx.insert(siteClaim).values({ ...input, status: "pending" }).returning({ id: siteClaim.id, token: siteClaim.token, expiresAt: siteClaim.expiresAt });
    await tx.insert(activityEvent).values({ type: "ownership_verification_started", siteId: input.siteId, detail: `Ownership verification started with ${input.method}.`, isDemo: false });
    return { ok: true as const, claim };
  });
}

export async function getClaimForUser(db: Repository, claimId: string, userId: string) {
  const [claim] = await db
    .select({ id: siteClaim.id, siteId: siteClaim.siteId, userId: siteClaim.userId, method: siteClaim.method, token: siteClaim.token, status: siteClaim.status, attempts: siteClaim.attempts, expiresAt: siteClaim.expiresAt, domain: site.domain })
    .from(siteClaim)
    .innerJoin(site, eq(siteClaim.siteId, site.id))
    .where(and(eq(siteClaim.id, claimId), eq(siteClaim.userId, userId)))
    .limit(1);
  return claim ?? null;
}

export async function recordClaimAttempt(db: Repository, claimId: string, status: "failed" | "expired", error: string) {
  await db.update(siteClaim).set({ status, lastError: error, attempts: sql`${siteClaim.attempts} + 1` }).where(eq(siteClaim.id, claimId));
}

export async function completeClaim(db: Repository, claimId: string, userId: string) {
  return db.transaction(async (tx) => {
    const [claim] = await tx.select({ id: siteClaim.id, siteId: siteClaim.siteId, status: siteClaim.status, expiresAt: siteClaim.expiresAt }).from(siteClaim).where(and(eq(siteClaim.id, claimId), eq(siteClaim.userId, userId))).limit(1);
    if (!claim) return { ok: false as const, reason: "not_found" as const };
    if (claim.status !== "pending") return { ok: false as const, reason: "not_pending" as const };
    const now = new Date();
    if (claim.expiresAt <= now) {
      await tx.update(siteClaim).set({ status: "expired", lastError: "challenge_expired", attempts: sql`${siteClaim.attempts} + 1` }).where(and(eq(siteClaim.id, claimId), eq(siteClaim.status, "pending")));
      return { ok: false as const, reason: "expired" as const };
    }
    const [existingOwner] = await tx.select({ userId: siteOwner.userId, role: siteOwner.role }).from(siteOwner).where(and(eq(siteOwner.siteId, claim.siteId), eq(siteOwner.role, "owner"))).limit(1);
    if (existingOwner && existingOwner.userId !== userId) return { ok: false as const, reason: "ownership_conflict" as const };
    await tx.update(siteClaim).set({ status: "verified", verifiedAt: now, usedAt: now, lastError: null, attempts: sql`${siteClaim.attempts} + 1` }).where(eq(siteClaim.id, claimId));
    await tx.update(site).set({ ownership: "claimed", updatedAt: now }).where(eq(site.id, claim.siteId));
    await tx.insert(siteOwner).values({ siteId: claim.siteId, userId, role: "owner" }).onConflictDoNothing();
    await tx.insert(activityEvent).values({ type: "ownership_verified", siteId: claim.siteId, detail: "Ownership verification succeeded.", isDemo: false });
    return { ok: true as const, siteId: claim.siteId };
  });
}

async function writeAudit(
  tx: Pick<Repository, "insert">,
  input: {
    adminUserId: string;
    action: string;
    targetType: string;
    targetId: string;
    previousState?: Record<string, unknown>;
    newState?: Record<string, unknown>;
    reason: string;
    requestId: string;
  },
) {
  await tx.insert(moderationAction).values({
    actorUserId: input.adminUserId,
    action: input.action,
    targetType: input.targetType,
    targetId: input.targetId,
    previousState: input.previousState,
    newState: input.newState,
    reason: input.reason,
    requestId: input.requestId,
  });
  await tx.insert(adminAuditLog).values({
    actorUserId: input.adminUserId,
    action: input.action,
    targetType: input.targetType,
    targetId: input.targetId,
    previousState: input.previousState,
    newState: input.newState,
    details: { reason: input.reason },
    reason: input.reason,
    requestId: input.requestId,
  });
}

export async function listAuditLog(db: Repository, limit = 100) {
  return db.select().from(adminAuditLog).orderBy(desc(adminAuditLog.createdAt)).limit(limit);
}
