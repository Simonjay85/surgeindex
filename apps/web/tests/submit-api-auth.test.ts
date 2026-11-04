import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireVerifiedApiUser: vi.fn(),
  checkRateLimit: vi.fn(async () => ({ allowed: true, retryAfterSeconds: 0 })),
  verifyTurnstile: vi.fn(async () => ({ ok: true as const })),
  submitSiteForUser: vi.fn(),
  getServerEnv: vi.fn(() => ({
    NEXT_PUBLIC_APP_URL: "https://surgeindex.example",
    DATA_PROVIDER: "postgres",
  })),
}));

vi.mock("../lib/server/authorization", () => ({ requireVerifiedApiUser: mocks.requireVerifiedApiUser }));
vi.mock("../lib/server/rate-limit", () => ({ checkRateLimit: mocks.checkRateLimit }));
vi.mock("../lib/server/turnstile", () => ({ verifyTurnstile: mocks.verifyTurnstile }));
vi.mock("../lib/server/site-service", () => ({
  SiteServiceError: class SiteServiceError extends Error {},
  submitSiteForUser: mocks.submitSiteForUser,
}));
vi.mock("@surge/config", () => ({ getServerEnv: mocks.getServerEnv }));

import { POST } from "../app/api/sites/route";

function unauthorized(status: number) {
  return new Response(JSON.stringify({ error: { code: status === 401 ? "authentication_required" : "email_verification_required" } }), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("site submission API authorization order", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each([
    ["anonymous", 401],
    ["unverified", 403],
  ])("rejects %s requests before Turnstile, rate limiting, or metadata/provider work", async (_label, status) => {
    mocks.requireVerifiedApiUser.mockResolvedValue({ response: unauthorized(status) });

    const response = await POST(new Request("https://surgeindex.example/api/sites", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        url: "https://canary.example",
        category: "ai-tools",
        turnstileToken: "opaque-fixture",
      }),
    }));

    expect(response.status).toBe(status);
    expect(mocks.requireVerifiedApiUser).toHaveBeenCalledTimes(1);
    expect(mocks.checkRateLimit).not.toHaveBeenCalled();
    expect(mocks.verifyTurnstile).not.toHaveBeenCalled();
    expect(mocks.submitSiteForUser).not.toHaveBeenCalled();
  });
});
