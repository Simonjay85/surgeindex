import "server-only";

import { randomBytes } from "node:crypto";
import { getServerEnv } from "@surge/config";
import {
  findPublicFanwardCreatorBySlug as findPublicFanwardCreatorRecordBySlug,
  getFanwardOwnerWorkspace as getFanwardOwnerWorkspaceRecord,
  getPostgresDb,
  listFanwardAdminQueue as listFanwardAdminQueueRecords,
  listPublicFanwardCreators as listPublicFanwardCreatorRecords,
  listPublicFanwardSitemapEntries as listPublicFanwardSitemapEntryRecords,
  loadLatestFanwardScores,
  reviewFanwardProfile as reviewFanwardProfileRecord,
  saveFanwardDraft,
  submitFanwardDraft,
  type FanwardOwnerWriteFailure,
  type FanwardReviewAction,
  type FanwardReviewFailure,
  type RepositoryFanwardAdminItem,
  type RepositoryFanwardProfile,
  type RepositoryFanwardRevision,
  type RepositoryFanwardScore,
  type RepositoryFanwardSite,
  type RepositoryPublicFanwardCreator,
} from "@surge/db";
import {
  computeFanwardImpact,
  FANWARD_IMPACT_VERSION,
  type FanwardImpactComponent,
  type FanwardImpactResult,
} from "@surge/scoring";
import type { RankingState, ScoreComponentName } from "@surge/scoring";

export type FanwardServiceErrorCode =
  | "feature_disabled"
  | "data_provider_unavailable"
  | "invalid_cursor"
  | "invalid_input"
  | FanwardOwnerWriteFailure
  | FanwardReviewFailure;

export class FanwardServiceError extends Error {
  constructor(public readonly code: FanwardServiceErrorCode, message: string) {
    super(message);
    this.name = "FanwardServiceError";
  }
}

export interface FanwardCategoryDto {
  id: string;
  slug: string;
  name: string;
}

export interface FanwardImpactDto {
  score: number | null;
  state: RankingState;
  confidence: number;
  version: typeof FANWARD_IMPACT_VERSION;
  sourceVersion: string | null;
  source: "tracker" | "ga4";
  updatedAt: string | null;
  components: Record<"verifiedReach" | "attentionMomentum" | "engagementQuality" | "trustConfidence", FanwardImpactComponent>;
}

export interface PublicFanwardPrimarySite {
  slug: string;
  name: string;
  domain: string;
  verification: "tracker" | "ga4";
}

export interface PublicFanwardCreatorSummary {
  slug: string;
  displayName: string;
  headline: string;
  bioExcerpt: string;
  category: FanwardCategoryDto | null;
  logoUrl: string | null;
  primarySite: PublicFanwardPrimarySite;
  impact: FanwardImpactDto;
  publishedAt: string;
}

export interface PublicFanwardCreatorDetail extends PublicFanwardCreatorSummary {
  bio: string;
}

export interface FanwardCreatorListResult {
  creators: PublicFanwardCreatorSummary[];
  nextCursor: string | null;
  total: number;
  categories: FanwardCategoryDto[];
}

export interface FanwardSitemapEntry {
  slug: string;
  publishedAt: string;
}

export interface FanwardRevisionDto {
  id: string;
  displayName: string;
  headline: string;
  bio: string;
  category: FanwardCategoryDto | null;
  status: RepositoryFanwardRevision["status"];
  createdAt: string;
  updatedAt: string;
  submittedAt: string | null;
  publishedAt: string | null;
  reviewedAt: string | null;
  reviewReason: string | null;
}

export interface FanwardEligibleSiteDto {
  id: string;
  slug: string;
  name: string;
  domain: string;
  verification: "tracker" | "ga4";
  logoUrl: string | null;
}

export interface FanwardOwnerWorkspace {
  profile: {
    id: string;
    slug: string;
    primarySiteId: string;
    status: RepositoryFanwardProfile["status"];
    createdAt: string;
    updatedAt: string;
  } | null;
  primarySite: {
    id: string;
    slug: string;
    name: string;
    domain: string;
    verification: RepositoryFanwardSite["verification"];
    status: RepositoryFanwardSite["status"];
    ownership: RepositoryFanwardSite["ownership"];
    eligible: boolean;
    eligibilityReason: string | null;
  } | null;
  published: FanwardRevisionDto | null;
  draft: FanwardRevisionDto | null;
  pending: FanwardRevisionDto | null;
  eligibleSites: FanwardEligibleSiteDto[];
  categories: FanwardCategoryDto[];
  lastReviewReason: string | null;
}

export interface FanwardAdminReviewItem {
  profileId: string;
  profileStatus: RepositoryFanwardProfile["status"];
  slug: string;
  owner: { id: string; name: string; email: string };
  primarySite: {
    id: string;
    slug: string;
    name: string;
    domain: string;
    verification: RepositoryFanwardSite["verification"];
    status: RepositoryFanwardSite["status"];
    ownership: RepositoryFanwardSite["ownership"];
  };
  pendingRevision: FanwardRevisionDto | null;
  publishedRevision: FanwardRevisionDto | null;
  submittedAt: string | null;
  eligibility: { eligible: boolean; reason: string | null };
}

export interface FanwardAdminQueueResult {
  items: FanwardAdminReviewItem[];
  total: number;
  limit: number;
  offset: number;
  nextOffset: number | null;
}

export interface FanwardAdminReviewResult {
  profileId: string;
  profileStatus: RepositoryFanwardProfile["status"];
  revisionId: string | null;
  revisionStatus: RepositoryFanwardRevision["status"] | null;
}

function requireFanwardProvider(): void {
  const env = getServerEnv();
  if (!env.FEATURE_CREATORS) throw new FanwardServiceError("feature_disabled", "Fanward is not available.");
  if (env.DATA_PROVIDER !== "postgres") {
    throw new FanwardServiceError("data_provider_unavailable", "Fanward requires the production data provider.");
  }
}

function cleanText(value: string, max: number): string {
  return value
    .replace(/<[^>]*>/g, " ")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function creatorSlug(displayName: string): string {
  const base = displayName
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "creator";
  return `${base}-${randomBytes(3).toString("hex")}`;
}

function asIso(value: Date | null): string | null {
  return value?.toISOString() ?? null;
}

function revisionDto(revision: RepositoryFanwardRevision): FanwardRevisionDto {
  return {
    id: revision.id,
    displayName: revision.displayName,
    headline: revision.headline,
    bio: revision.bio,
    category: revision.category,
    status: revision.status,
    createdAt: revision.createdAt.toISOString(),
    updatedAt: revision.updatedAt.toISOString(),
    submittedAt: asIso(revision.submittedAt),
    publishedAt: asIso(revision.publishedAt),
    reviewedAt: asIso(revision.reviewedAt),
    reviewReason: revision.reviewReason,
  };
}

const EMPTY_COMPONENTS: FanwardImpactDto["components"] = {
  verifiedReach: { score: null, available: false, configuredWeight: 0.3, appliedWeight: 0 },
  attentionMomentum: { score: null, available: false, configuredWeight: 0.3, appliedWeight: 0 },
  engagementQuality: { score: null, available: false, configuredWeight: 0.2, appliedWeight: 0 },
  trustConfidence: { score: null, available: false, configuredWeight: 0.2, appliedWeight: 0 },
};

export function fanwardImpactFromScore(
  siteRecord: Pick<RepositoryFanwardSite, "verification">,
  score: RepositoryFanwardScore | null,
): FanwardImpactDto {
  const source = siteRecord.verification === "ga4" ? "ga4" : "tracker";
  if (!score) {
    return {
      score: null,
      state: "building_baseline",
      confidence: 0,
      version: FANWARD_IMPACT_VERSION,
      sourceVersion: null,
      source,
      updatedAt: null,
      components: EMPTY_COMPONENTS,
    };
  }
  const components: Partial<Record<ScoreComponentName, { normalizedValue: number; available: boolean }>> = {};
  const accepted = new Set<ScoreComponentName>([
    "growthVelocity",
    "liveAcceleration",
    "trafficVolume",
    "engagementQuality",
    "trustConfidence",
  ]);
  for (const component of score.components) {
    if (accepted.has(component.component as ScoreComponentName)) {
      components[component.component as ScoreComponentName] = {
        normalizedValue: component.normalizedValue,
        available: component.available,
      };
    }
  }
  const result: FanwardImpactResult = computeFanwardImpact({
    eligible: true,
    verification: siteRecord.verification,
    rankingState: score.rankingState,
    sourceConfidence: score.confidence,
    sourceVersion: score.scoreVersion,
    source: score.source,
    updatedAt: score.updatedAt,
    components,
  });
  return result;
}

function excerpt(value: string, max = 180): string {
  if (value.length <= max) return value;
  const shortened = value.slice(0, max - 1);
  const boundary = shortened.lastIndexOf(" ");
  return `${shortened.slice(0, boundary >= 80 ? boundary : shortened.length).trimEnd()}…`;
}

function publicDto(
  record: RepositoryPublicFanwardCreator,
  score: RepositoryFanwardScore | null,
): PublicFanwardCreatorDetail {
  if (!record.revision.publishedAt || (record.site.verification !== "tracker" && record.site.verification !== "ga4")) {
    throw new FanwardServiceError("invalid_input", "An ineligible creator record reached the public projection.");
  }
  return {
    slug: record.profile.slug,
    displayName: record.revision.displayName,
    headline: record.revision.headline,
    bioExcerpt: excerpt(record.revision.bio),
    bio: record.revision.bio,
    category: record.revision.category,
    logoUrl: record.site.logoUrl,
    primarySite: {
      slug: record.site.slug,
      name: record.site.name,
      domain: record.site.domain,
      verification: record.site.verification,
    },
    impact: fanwardImpactFromScore(record.site, score),
    publishedAt: record.revision.publishedAt.toISOString(),
  };
}

function publicSummaryDto(detail: PublicFanwardCreatorDetail): PublicFanwardCreatorSummary {
  return {
    slug: detail.slug,
    displayName: detail.displayName,
    headline: detail.headline,
    bioExcerpt: detail.bioExcerpt,
    category: detail.category,
    logoUrl: detail.logoUrl,
    primarySite: detail.primarySite,
    impact: detail.impact,
    publishedAt: detail.publishedAt,
  };
}

export function currentFanwardReviewReason(
  profileStatus: RepositoryFanwardProfile["status"] | undefined,
  revisions: FanwardRevisionDto[],
): string | null {
  if (!profileStatus || profileStatus === "suspended") return null;
  const latestReviewed = revisions
    .filter((revision) => revision.reviewedAt)
    .sort((left, right) => {
      const reviewedOrder = right.reviewedAt!.localeCompare(left.reviewedAt!);
      if (reviewedOrder !== 0) return reviewedOrder;
      const updatedOrder = right.updatedAt.localeCompare(left.updatedAt);
      return updatedOrder !== 0 ? updatedOrder : right.id.localeCompare(left.id);
    })[0];
  return latestReviewed?.status === "rejected" ? latestReviewed.reviewReason : null;
}

interface FanwardCursorPayload {
  v: 1;
  publishedAt: string;
  profileId: string;
}

export function encodeFanwardCursor(payload: Omit<FanwardCursorPayload, "v">): string {
  return Buffer.from(JSON.stringify({ v: 1, ...payload } satisfies FanwardCursorPayload), "utf8").toString("base64url");
}

export function decodeFanwardCursor(cursor: string): { publishedAt: Date; profileId: string } {
  try {
    if (!cursor || cursor.length > 512 || !/^[A-Za-z0-9_-]+$/.test(cursor)) throw new Error("invalid cursor encoding");
    const decoded = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as Partial<FanwardCursorPayload>;
    const timestamp = typeof decoded.publishedAt === "string" ? new Date(decoded.publishedAt) : new Date(Number.NaN);
    if (
      decoded.v !== 1
      || Number.isNaN(timestamp.getTime())
      || timestamp.toISOString() !== decoded.publishedAt
      || typeof decoded.profileId !== "string"
      || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(decoded.profileId)
    ) throw new Error("invalid cursor payload");
    return { publishedAt: timestamp, profileId: decoded.profileId };
  } catch {
    throw new FanwardServiceError("invalid_cursor", "The Fanward cursor is invalid or expired.");
  }
}

export async function listPublicFanwardCreators(input: {
  q?: string;
  category?: string;
  cursor?: string;
  limit?: number;
}): Promise<FanwardCreatorListResult> {
  requireFanwardProvider();
  const limit = input.limit ?? 24;
  const q = input.q?.trim();
  const categorySlug = input.category?.trim();
  if (!Number.isInteger(limit) || limit < 1 || limit > 50 || (q?.length ?? 0) > 80 || (categorySlug?.length ?? 0) > 80) {
    throw new FanwardServiceError("invalid_input", "The Fanward directory query is invalid.");
  }
  const db = getPostgresDb();
  const page = await listPublicFanwardCreatorRecords(db, {
    query: q || undefined,
    categorySlug: categorySlug || undefined,
    cursor: input.cursor ? decodeFanwardCursor(input.cursor) : undefined,
    limit,
  });
  const scores = await loadLatestFanwardScores(db, page.creators.map((creator) => creator.site.id));
  const detailed = page.creators.map((creator) => publicDto(creator, scores.get(creator.site.id) ?? null));
  const last = page.creators.at(-1);
  return {
    creators: detailed.map(publicSummaryDto),
    nextCursor: page.hasMore && last?.revision.publishedAt
      ? encodeFanwardCursor({ publishedAt: last.revision.publishedAt.toISOString(), profileId: last.profile.id })
      : null,
    total: page.total,
    categories: page.categories,
  };
}

export async function listPublicFanwardSitemapEntries(): Promise<FanwardSitemapEntry[]> {
  requireFanwardProvider();
  const records = await listPublicFanwardSitemapEntryRecords(getPostgresDb());
  return records.map((record) => ({
    slug: record.slug,
    publishedAt: record.publishedAt.toISOString(),
  }));
}

export async function getPublicFanwardCreatorBySlug(slug: string): Promise<PublicFanwardCreatorDetail | null> {
  requireFanwardProvider();
  const normalized = slug.trim().toLowerCase();
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(normalized) || normalized.length > 80) return null;
  const db = getPostgresDb();
  const record = await findPublicFanwardCreatorRecordBySlug(db, normalized);
  if (!record) return null;
  const scores = await loadLatestFanwardScores(db, [record.site.id]);
  return publicDto(record, scores.get(record.site.id) ?? null);
}

function ownerWorkspaceDto(record: Awaited<ReturnType<typeof getFanwardOwnerWorkspaceRecord>>): FanwardOwnerWorkspace {
  const revisions = record.revisions.map(revisionDto);
  return {
    profile: record.profile ? {
      id: record.profile.id,
      slug: record.profile.slug,
      primarySiteId: record.profile.primarySiteId,
      status: record.profile.status,
      createdAt: record.profile.createdAt.toISOString(),
      updatedAt: record.profile.updatedAt.toISOString(),
    } : null,
    primarySite: record.primarySite ? {
      id: record.primarySite.site.id,
      slug: record.primarySite.site.slug,
      name: record.primarySite.site.name,
      domain: record.primarySite.site.domain,
      verification: record.primarySite.site.verification,
      status: record.primarySite.site.status,
      ownership: record.primarySite.site.ownership,
      eligible: record.primarySite.eligibility.eligible,
      eligibilityReason: record.primarySite.eligibility.reason,
    } : null,
    published: revisions.find((revision) => revision.status === "published") ?? null,
    draft: revisions.find((revision) => revision.status === "draft") ?? null,
    pending: revisions.find((revision) => revision.status === "pending") ?? null,
    eligibleSites: record.eligibleSites.flatMap((siteRecord) =>
      siteRecord.verification === "tracker" || siteRecord.verification === "ga4"
        ? [{
            id: siteRecord.id,
            slug: siteRecord.slug,
            name: siteRecord.name,
            domain: siteRecord.domain,
            verification: siteRecord.verification,
            logoUrl: siteRecord.logoUrl,
          }]
        : [],
    ),
    categories: record.categories,
    lastReviewReason: currentFanwardReviewReason(record.profile?.status, revisions),
  };
}

export async function getFanwardOwnerWorkspace(userId: string): Promise<FanwardOwnerWorkspace> {
  requireFanwardProvider();
  return ownerWorkspaceDto(await getFanwardOwnerWorkspaceRecord(getPostgresDb(), userId));
}

function ownerFailure(reason: FanwardOwnerWriteFailure, updatedAt?: Date): never {
  const messages: Record<FanwardOwnerWriteFailure, string> = {
    site_not_found: "The selected site was not found.",
    site_owner_required: "Exact verified owner access is required for this site.",
    site_not_active: "The selected site is not active.",
    site_not_claimed: "The selected site must be claimed first.",
    traffic_not_verified: "The selected site needs tracker or GA4 verification.",
    demo_site: "Demo sites cannot back a Fanward profile.",
    site_already_linked: "This site already backs another Fanward profile.",
    profile_conflict: "The Fanward profile could not be created because its identity conflicts with another profile.",
    profile_not_found: "Create and save a Fanward draft first.",
    primary_site_locked: "The primary site cannot be changed after this Fanward profile is created.",
    category_not_found: "Choose a valid category.",
    edit_conflict: updatedAt
      ? `This profile changed since it was opened. Reload the current version (${updatedAt.toISOString()}).`
      : "This profile changed since it was opened. Reload before saving.",
    pending_exists: "This profile already has a revision waiting for review.",
    draft_not_found: "Save a Fanward draft before submitting it.",
    draft_incomplete: "Add a category, a 2–80 character display name, an 8–160 character headline, and a 40–2,000 character bio before submitting.",
    profile_suspended: "This Fanward profile is suspended.",
  };
  throw new FanwardServiceError(reason, messages[reason]);
}

export interface SaveFanwardOwnerDraftInput {
  primarySiteId: string;
  displayName: string;
  headline: string;
  bio: string;
  categoryId: string;
  expectedUpdatedAt?: string;
}

export function normalizeFanwardDraftInput(input: SaveFanwardOwnerDraftInput): {
  primarySiteId: string;
  displayName: string;
  headline: string;
  bio: string;
  categoryId: string;
  expectedUpdatedAt?: Date;
} {
  if (
    typeof input.primarySiteId !== "string"
    || typeof input.displayName !== "string"
    || typeof input.headline !== "string"
    || typeof input.bio !== "string"
    || typeof input.categoryId !== "string"
    || (input.expectedUpdatedAt != null && typeof input.expectedUpdatedAt !== "string")
  ) throw new FanwardServiceError("invalid_input", "Review the Fanward draft fields and try again.");
  const displayName = cleanText(input.displayName, 81);
  const headline = cleanText(input.headline, 161);
  const bio = cleanText(input.bio, 2_001);
  const expectedUpdatedAt = input.expectedUpdatedAt ? new Date(input.expectedUpdatedAt) : undefined;
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (
    displayName.length < 2
    || displayName.length > 80
    || headline.length < 8
    || headline.length > 160
    || bio.length < 40
    || bio.length > 2_000
    || !uuid.test(input.primarySiteId)
    || !uuid.test(input.categoryId)
    || (input.expectedUpdatedAt && Number.isNaN(expectedUpdatedAt?.getTime()))
  ) throw new FanwardServiceError("invalid_input", "Review the Fanward draft fields and try again.");
  return {
    primarySiteId: input.primarySiteId,
    displayName,
    headline,
    bio,
    categoryId: input.categoryId,
    expectedUpdatedAt,
  };
}

export async function saveFanwardOwnerDraft(userId: string, input: SaveFanwardOwnerDraftInput): Promise<FanwardOwnerWorkspace> {
  requireFanwardProvider();
  const normalized = normalizeFanwardDraftInput(input);
  const result = await saveFanwardDraft(getPostgresDb(), {
    userId,
    slug: creatorSlug(normalized.displayName),
    ...normalized,
  });
  if (!result.ok) ownerFailure(result.reason, result.updatedAt);
  return getFanwardOwnerWorkspace(userId);
}

export async function submitFanwardOwnerDraft(
  userId: string,
  input: { expectedUpdatedAt: string },
): Promise<FanwardOwnerWorkspace> {
  requireFanwardProvider();
  const expectedUpdatedAt = new Date(input.expectedUpdatedAt);
  if (Number.isNaN(expectedUpdatedAt.getTime())) throw new FanwardServiceError("invalid_input", "A current draft version is required.");
  const result = await submitFanwardDraft(getPostgresDb(), { userId, expectedUpdatedAt });
  if (!result.ok) ownerFailure(result.reason, result.updatedAt);
  return getFanwardOwnerWorkspace(userId);
}

function adminItemDto(item: RepositoryFanwardAdminItem): FanwardAdminReviewItem {
  return {
    profileId: item.profile.id,
    profileStatus: item.profile.status,
    slug: item.profile.slug,
    owner: item.owner,
    primarySite: {
      id: item.site.id,
      slug: item.site.slug,
      name: item.site.name,
      domain: item.site.domain,
      verification: item.site.verification,
      status: item.site.status,
      ownership: item.site.ownership,
    },
    pendingRevision: item.pendingRevision ? revisionDto(item.pendingRevision) : null,
    publishedRevision: item.publishedRevision ? revisionDto(item.publishedRevision) : null,
    submittedAt: asIso(item.pendingRevision?.submittedAt ?? null),
    eligibility: item.eligibility,
  };
}

export async function listFanwardAdminQueue(input: {
  q?: string;
  limit?: number;
  offset?: number;
}): Promise<FanwardAdminQueueResult> {
  requireFanwardProvider();
  const limit = input.limit ?? 50;
  const offset = input.offset ?? 0;
  if (!Number.isInteger(limit) || limit < 1 || limit > 100 || !Number.isInteger(offset) || offset < 0 || (input.q?.length ?? 0) > 80) {
    throw new FanwardServiceError("invalid_input", "The review queue query is invalid.");
  }
  const result = await listFanwardAdminQueueRecords(getPostgresDb(), { query: input.q?.trim() || undefined, limit, offset });
  const consumed = offset + result.items.length;
  return {
    items: result.items.map(adminItemDto),
    total: result.total,
    limit,
    offset,
    nextOffset: consumed < result.total ? consumed : null,
  };
}

function reviewFailure(reason: FanwardReviewFailure): never {
  const message = reason === "target_not_found"
    ? "The Fanward profile was not found."
    : reason === "invalid_transition"
      ? "This review action is no longer valid for the current profile state."
      : "The profile's primary site is no longer eligible for Fanward.";
  throw new FanwardServiceError(reason, message);
}

export function normalizeFanwardReviewReason(value: unknown): string {
  if (typeof value !== "string") {
    throw new FanwardServiceError("invalid_input", "A valid Fanward target and review reason are required.");
  }
  const reason = cleanText(value, 501);
  if (reason.length < 3 || reason.length > 500) {
    throw new FanwardServiceError("invalid_input", "A valid Fanward target and review reason are required.");
  }
  return reason;
}

export async function reviewFanwardProfile(
  adminUserId: string,
  profileId: string,
  input: { action: FanwardReviewAction; revisionId?: string; reason: string; requestId: string },
): Promise<FanwardAdminReviewResult> {
  requireFanwardProvider();
  if (
    typeof profileId !== "string"
    || (input.revisionId != null && typeof input.revisionId !== "string")
  ) throw new FanwardServiceError("invalid_input", "A valid Fanward target and review reason are required.");
  const reason = normalizeFanwardReviewReason(input.reason);
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (
    !uuid.test(profileId)
    || (input.revisionId != null && !uuid.test(input.revisionId))
  ) throw new FanwardServiceError("invalid_input", "A valid Fanward target and review reason are required.");
  const result = await reviewFanwardProfileRecord(getPostgresDb(), {
    adminUserId,
    profileId,
    revisionId: input.revisionId,
    action: input.action,
    reason,
    requestId: input.requestId,
  });
  if (!result.ok) reviewFailure(result.reason);
  return result;
}
