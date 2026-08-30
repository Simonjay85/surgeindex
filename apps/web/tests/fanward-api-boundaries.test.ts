import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  env: { FEATURE_CREATORS: true, NEXT_PUBLIC_APP_URL: "https://surgeindex.test" },
  requireVerifiedApiUser: vi.fn(),
  requireApiAdmin: vi.fn(),
  checkRateLimit: vi.fn(),
  verifyTurnstile: vi.fn(),
  saveFanwardOwnerDraft: vi.fn(),
  submitFanwardOwnerDraft: vi.fn(),
  listPublicFanwardCreators: vi.fn(),
  getPublicFanwardCreatorBySlug: vi.fn(),
  listFanwardAdminQueue: vi.fn(),
  reviewFanwardProfile: vi.fn(),
}));

vi.mock("@surge/config", () => ({ getServerEnv: () => mocks.env }));
vi.mock("../lib/server/authorization", () => ({
  requireVerifiedApiUser: mocks.requireVerifiedApiUser,
  requireApiAdmin: mocks.requireApiAdmin,
}));
vi.mock("../lib/server/rate-limit", () => ({ checkRateLimit: mocks.checkRateLimit }));
vi.mock("../lib/server/turnstile", () => ({ verifyTurnstile: mocks.verifyTurnstile }));
vi.mock("../lib/server/client-ip", () => ({ getTrustedClientIp: () => "203.0.113.10" }));
vi.mock("../lib/server/fanward-service", () => {
  class FanwardServiceError extends Error {
    constructor(public readonly code: string, message: string) {
      super(message);
    }
  }
  return {
    FanwardServiceError,
    saveFanwardOwnerDraft: mocks.saveFanwardOwnerDraft,
    submitFanwardOwnerDraft: mocks.submitFanwardOwnerDraft,
    listPublicFanwardCreators: mocks.listPublicFanwardCreators,
    getPublicFanwardCreatorBySlug: mocks.getPublicFanwardCreatorBySlug,
    listFanwardAdminQueue: mocks.listFanwardAdminQueue,
    reviewFanwardProfile: mocks.reviewFanwardProfile,
  };
});

import { PATCH as saveDraft } from "../app/api/fanward/me/route";
import { POST as submitDraft } from "../app/api/fanward/me/submit/route";
import { GET as listCreators } from "../app/api/fanward/creators/route";
import { POST as reviewCreator } from "../app/api/admin/fanward/[profileId]/review/route";

const user = { id: "fanward-user", role: "user", emailVerified: true };

function mutationRequest(path: string, body: Record<string, unknown>, origin = "https://surgeindex.test") {
  return new Request(`https://surgeindex.test${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", origin },
    body: JSON.stringify(body),
  });
}

describe("Fanward API security boundaries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.env.FEATURE_CREATORS = true;
    mocks.requireVerifiedApiUser.mockResolvedValue({ user });
    mocks.requireApiAdmin.mockResolvedValue({ user: { ...user, id: "fanward-admin", role: "admin" } });
    mocks.checkRateLimit.mockResolvedValue({ allowed: true, retryAfterSeconds: 0 });
    mocks.verifyTurnstile.mockResolvedValue({ ok: true });
    mocks.saveFanwardOwnerDraft.mockResolvedValue({ profile: null });
    mocks.submitFanwardOwnerDraft.mockResolvedValue({ profile: null });
    mocks.listPublicFanwardCreators.mockResolvedValue({ creators: [], nextCursor: null, total: 0, categories: [] });
  });

  it("saves a verified same-origin draft without requiring a Turnstile token", async () => {
    const request = mutationRequest("/api/fanward/me", {
      primarySiteId: "10000000-0000-4000-8000-000000000001",
      displayName: "Creator Name",
      headline: "Verified creator headline",
      bio: "A truthful creator biography that is comfortably longer than forty characters.",
      categoryId: "10000000-0000-4000-8000-000000000002",
    });
    const response = await saveDraft(new Request(request, { method: "PATCH" }));
    expect(response.status).toBe(200);
    expect(mocks.verifyTurnstile).not.toHaveBeenCalled();
    expect(mocks.checkRateLimit).toHaveBeenCalledWith("fanward-owner-save", user.id, 30, 60 * 60 * 1000);
    expect(mocks.saveFanwardOwnerDraft).toHaveBeenCalledWith(user.id, expect.not.objectContaining({ turnstileToken: expect.anything() }));
  });

  it("requires the fanward-submit Turnstile action and enforces five submissions per day", async () => {
    const response = await submitDraft(mutationRequest("/api/fanward/me/submit", {
      expectedUpdatedAt: "2026-08-30T01:02:03.000Z",
      turnstileToken: "opaque-token",
    }));
    expect(response.status).toBe(200);
    expect(mocks.verifyTurnstile).toHaveBeenCalledWith(expect.any(Request), "opaque-token", "fanward-submit");
    expect(mocks.checkRateLimit).toHaveBeenCalledWith("fanward-owner-submit", user.id, 5, 24 * 60 * 60 * 1000);
  });

  it("rejects a cross-origin owner mutation before authorization or persistence", async () => {
    const response = await submitDraft(mutationRequest("/api/fanward/me/submit", {
      expectedUpdatedAt: "2026-08-30T01:02:03.000Z",
      turnstileToken: "opaque-token",
    }, "https://attacker.example"));
    expect(response.status).toBe(403);
    expect(mocks.requireVerifiedApiUser).not.toHaveBeenCalled();
    expect(mocks.submitFanwardOwnerDraft).not.toHaveBeenCalled();
  });

  it("charges malformed payloads to the limiter and does not parse or persist after denial", async () => {
    mocks.checkRateLimit.mockResolvedValue({ allowed: false, retryAfterSeconds: 60 });
    const response = await saveDraft(new Request("https://surgeindex.test/api/fanward/me", {
      method: "PATCH",
      headers: { "content-type": "application/json", origin: "https://surgeindex.test" },
      body: "{malformed",
    }));
    expect(response.status).toBe(429);
    expect(mocks.checkRateLimit).toHaveBeenCalledWith("fanward-owner-save", user.id, 30, 60 * 60 * 1000);
    expect(mocks.saveFanwardOwnerDraft).not.toHaveBeenCalled();

    mocks.checkRateLimit.mockResolvedValue({ allowed: true, retryAfterSeconds: 0 });
    const invalidResponse = await saveDraft(new Request("https://surgeindex.test/api/fanward/me", {
      method: "PATCH",
      headers: { "content-type": "application/json", origin: "https://surgeindex.test" },
      body: "{malformed",
    }));
    expect(invalidResponse.status).toBe(422);
    expect(mocks.checkRateLimit).toHaveBeenCalledTimes(2);
  });

  it("rate-limits an admin review before parsing its body", async () => {
    mocks.checkRateLimit.mockResolvedValue({ allowed: false, retryAfterSeconds: 60 });
    const response = await reviewCreator(new Request("https://surgeindex.test/api/admin/fanward/10000000-0000-4000-8000-000000000001/review", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "https://surgeindex.test" },
      body: "{malformed",
    }), { params: Promise.resolve({ profileId: "10000000-0000-4000-8000-000000000001" }) });
    expect(response.status).toBe(429);
    expect(mocks.checkRateLimit).toHaveBeenCalledWith("fanward-admin-review", "fanward-admin", 120, 60 * 60 * 1000);
    expect(mocks.reviewFanwardProfile).not.toHaveBeenCalled();
  });

  it("returns a generic public 404 while the creator flag is off", async () => {
    mocks.env.FEATURE_CREATORS = false;
    const response = await listCreators(new Request("https://surgeindex.test/api/fanward/creators"));
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ error: { code: "not_found", message: "Not found." } });
    expect(mocks.listPublicFanwardCreators).not.toHaveBeenCalled();
  });
});
