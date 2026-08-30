import { describe, expect, it } from "vitest";
import {
  decodeFanwardCursor,
  currentFanwardReviewReason,
  encodeFanwardCursor,
  fanwardImpactFromScore,
  FanwardServiceError,
  normalizeFanwardDraftInput,
  normalizeFanwardReviewReason,
} from "../lib/server/fanward-service";
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

  it("shows review feedback only for the current rejected profile state", () => {
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
    expect(currentFanwardReviewReason("active", [rejectedRevision])).toBeNull();
    expect(currentFanwardReviewReason("draft", [rejectedRevision])).toBeNull();
  });
});
