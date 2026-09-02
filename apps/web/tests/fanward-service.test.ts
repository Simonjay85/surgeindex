import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  env: {
    FEATURE_CREATORS: true,
    DATA_PROVIDER: "postgres" as "postgres" | "demo",
    NEXT_PUBLIC_APP_URL: "https://surgeindex.test",
    NEXT_PUBLIC_COMMERCIAL_ENABLED: false,
  },
  db: { kind: "fanward-sitemap-test-db" },
  getLeaderboard: vi.fn(),
  listPublicFanwardSitemapEntries: vi.fn(),
}));

vi.mock("@surge/config", () => ({ getServerEnv: () => mocks.env }));
vi.mock("@surge/db", async (importOriginal) => ({
  ...await importOriginal<typeof import("@surge/db")>(),
  getPostgresDb: () => mocks.db,
  listPublicFanwardSitemapEntries: mocks.listPublicFanwardSitemapEntries,
}));
vi.mock("../lib/server/public-provider", () => ({
  getPublicDataProvider: () => ({ getLeaderboard: mocks.getLeaderboard }),
}));

import {
  decodeFanwardCursor,
  currentFanwardReviewReason,
  encodeFanwardCursor,
  fanwardImpactFromScore,
  FanwardServiceError,
  listPublicFanwardSitemapEntries,
  normalizeFanwardDraftInput,
  normalizeFanwardReviewReason,
} from "../lib/server/fanward-service";
import sitemap from "../app/sitemap";
import type { RepositoryFanwardScore } from "@surge/db";

const score: RepositoryFanwardScore = {
  id: "10000000-0000-4000-8000-000000000001",
  siteId: "10000000-0000-4000-8000-000000000002",
  scoreVersion: "heat-v1",
  rankingState: "eligible",
  confidence: 0.8,
  source: "tracker",
  updatedAt: new Date("2026-08-30T01:02:03.000Z"),
  components: [
    { component: "trafficVolume", normalizedValue: 80, available: true },
    { component: "growthVelocity", normalizedValue: 50, available: true },
    { component: "liveAcceleration", normalizedValue: 100, available: false },
  ],
};

describe("Fanward server projection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.env.FEATURE_CREATORS = true;
    mocks.env.DATA_PROVIDER = "postgres";
    mocks.getLeaderboard.mockResolvedValue([]);
  });

  it("round-trips the strict deterministic public cursor", () => {
    const encoded = encodeFanwardCursor({
      publishedAt: "2026-08-30T01:02:03.000Z",
      profileId: "10000000-0000-4000-8000-000000000003",
    });
    expect(decodeFanwardCursor(encoded)).toEqual({
      publishedAt: new Date("2026-08-30T01:02:03.000Z"),
      profileId: "10000000-0000-4000-8000-000000000003",
    });
  });

  it.each(["", "not base64!", Buffer.from('{"v":2}', "utf8").toString("base64url")])(
    "rejects an invalid cursor without falling back to the first page",
    (cursor) => {
      expect(() => decodeFanwardCursor(cursor)).toThrowError(FanwardServiceError);
      try {
        decodeFanwardCursor(cursor);
      } catch (error) {
        expect(error).toMatchObject({ code: "invalid_cursor" });
      }
    },
  );

  it("returns an explicit building-baseline projection when no source score exists", () => {
    const result = fanwardImpactFromScore({ verification: "tracker" }, null);
    expect(result).toMatchObject({
      score: null,
      state: "building_baseline",
      confidence: 0,
      sourceVersion: null,
      updatedAt: null,
    });
    expect(Object.values(result.components).every((component) => !component.available && component.appliedWeight === 0)).toBe(true);
  });

  it("exposes configured and applied weights after missing-evidence normalization", () => {
    const result = fanwardImpactFromScore({ verification: "tracker" }, score);
    expect(result.score).toBe(65);
    expect(result.confidence).toBe(0.48);
    expect(result.components.verifiedReach).toMatchObject({ configuredWeight: 0.3, appliedWeight: 0.5 });
    expect(result.components.attentionMomentum).toMatchObject({ score: 50, configuredWeight: 0.3, appliedWeight: 0.5 });
    expect(Object.values(result.components).reduce((sum, component) => sum + component.appliedWeight, 0)).toBeCloseTo(1);
  });

  it("keeps a fraud-review source score fail-closed", () => {
    const result = fanwardImpactFromScore({ verification: "tracker" }, { ...score, rankingState: "fraud_review" });
    expect(result.score).toBeNull();
    expect(result.confidence).toBe(0);
    expect(Object.values(result.components).every((component) => component.appliedWeight === 0)).toBe(true);
  });

  it("validates creator fields after removing markup and controls", () => {
    expect(() => normalizeFanwardDraftInput({
      primarySiteId: "10000000-0000-4000-8000-000000000001",
      displayName: "<b></b>\u0000",
      headline: "Verified creator headline",
      bio: "A truthful creator biography that is comfortably longer than forty characters.",
      categoryId: "10000000-0000-4000-8000-000000000002",
    })).toThrowError(FanwardServiceError);
    expect(normalizeFanwardDraftInput({
      primarySiteId: "10000000-0000-4000-8000-000000000001",
      displayName: "<b>Creator Name</b>",
      headline: "Verified creator headline",
      bio: "A truthful creator biography that is comfortably longer than forty characters.",
      categoryId: "10000000-0000-4000-8000-000000000002",
    }).displayName).toBe("Creator Name");
  });

  it("rejects a moderation reason that becomes empty after sanitization", () => {
    expect(() => normalizeFanwardReviewReason("<span></span>\u0000")).toThrowError(FanwardServiceError);
    expect(normalizeFanwardReviewReason("<b>Evidence reviewed</b>")).toBe("Evidence reviewed");
  });

  it("shows the latest rejected review until a later moderation decision clears it", () => {
    const rejectedRevision = {
      id: "10000000-0000-4000-8000-000000000004",
      displayName: "Creator Name",
      headline: "Verified creator headline",
      bio: "A truthful creator biography that is comfortably longer than forty characters.",
      category: null,
      status: "rejected" as const,
      createdAt: "2026-08-30T01:00:00.000Z",
      updatedAt: "2026-08-30T02:00:00.000Z",
      submittedAt: "2026-08-30T01:30:00.000Z",
      publishedAt: null,
      reviewedAt: "2026-08-30T02:00:00.000Z",
      reviewReason: "Add clearer creator attribution.",
    };
    expect(currentFanwardReviewReason("rejected", [rejectedRevision])).toBe("Add clearer creator attribution.");
    expect(currentFanwardReviewReason("active", [rejectedRevision])).toBe("Add clearer creator attribution.");
    expect(currentFanwardReviewReason("draft", [rejectedRevision])).toBe("Add clearer creator attribution.");
    expect(currentFanwardReviewReason("pending", [rejectedRevision])).toBe("Add clearer creator attribution.");
    expect(currentFanwardReviewReason("suspended", [rejectedRevision])).toBeNull();

    const publishedRevision = {
      ...rejectedRevision,
      id: "10000000-0000-4000-8000-000000000005",
      status: "published" as const,
      publishedAt: "2026-08-30T03:00:00.000Z",
      reviewedAt: "2026-08-30T03:00:00.000Z",
      updatedAt: "2026-08-30T03:00:00.000Z",
      reviewReason: "Approved after evidence review.",
    };
    expect(currentFanwardReviewReason("active", [rejectedRevision, publishedRevision])).toBeNull();
    expect(currentFanwardReviewReason("active", [publishedRevision, rejectedRevision])).toBeNull();

    const newerRejectedRevision = {
      ...rejectedRevision,
      id: "10000000-0000-4000-8000-000000000006",
      reviewedAt: "2026-08-30T04:00:00.000Z",
      updatedAt: "2026-08-30T04:00:00.000Z",
      reviewReason: "Add a verifiable primary-site attribution.",
    };
    expect(currentFanwardReviewReason("active", [publishedRevision, newerRejectedRevision])).toBe(
      "Add a verifiable primary-site attribution.",
    );
  });

  it("loads the sitemap projection once through the guarded specialized repository", async () => {
    const publishedAt = new Date("2026-08-30T01:02:03.000Z");
    mocks.listPublicFanwardSitemapEntries.mockResolvedValue([
      { slug: "creator-one", publishedAt },
      { slug: "creator-two", publishedAt: new Date("2026-08-29T01:02:03.000Z") },
    ]);

    await expect(listPublicFanwardSitemapEntries()).resolves.toEqual([
      { slug: "creator-one", publishedAt: "2026-08-30T01:02:03.000Z" },
      { slug: "creator-two", publishedAt: "2026-08-29T01:02:03.000Z" },
    ]);
    expect(mocks.listPublicFanwardSitemapEntries).toHaveBeenCalledOnce();
    expect(mocks.listPublicFanwardSitemapEntries).toHaveBeenCalledWith(mocks.db);
  });

  it("fails closed before the sitemap repository when the feature or provider is unavailable", async () => {
    mocks.env.FEATURE_CREATORS = false;
    await expect(listPublicFanwardSitemapEntries()).rejects.toMatchObject({ code: "feature_disabled" });

    mocks.env.FEATURE_CREATORS = true;
    mocks.env.DATA_PROVIDER = "demo";
    await expect(listPublicFanwardSitemapEntries()).rejects.toMatchObject({ code: "data_provider_unavailable" });
    expect(mocks.listPublicFanwardSitemapEntries).not.toHaveBeenCalled();
  });

  it("builds all Fanward sitemap URLs with one specialized service query", async () => {
    mocks.listPublicFanwardSitemapEntries.mockResolvedValue([
      { slug: "creator-one", publishedAt: new Date("2026-08-30T01:02:03.000Z") },
      { slug: "creator-two", publishedAt: new Date("2026-08-29T01:02:03.000Z") },
    ]);

    const entries = await sitemap();

    expect(mocks.listPublicFanwardSitemapEntries).toHaveBeenCalledOnce();
    expect(entries.filter((entry) => entry.url.includes("/fanward/"))).toEqual([
      expect.objectContaining({ url: "https://surgeindex.test/fanward/creator-one", lastModified: "2026-08-30T01:02:03.000Z" }),
      expect.objectContaining({ url: "https://surgeindex.test/fanward/creator-two", lastModified: "2026-08-29T01:02:03.000Z" }),
    ]);
  });

  it("does not query or expose Fanward sitemap routes while the feature is disabled", async () => {
    mocks.env.FEATURE_CREATORS = false;

    const entries = await sitemap();

    expect(mocks.listPublicFanwardSitemapEntries).not.toHaveBeenCalled();
    expect(entries.some((entry) => entry.url.includes("/fanward"))).toBe(false);
  });
});
