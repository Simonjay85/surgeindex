import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getAuth: vi.fn(),
  toNextJsHandler: vi.fn(() => ({
    GET: vi.fn(() => new Response("delegated")),
    POST: vi.fn(() => new Response("delegated")),
  })),
  checkRateLimit: vi.fn(async () => ({ allowed: true, retryAfterSeconds: 0 })),
  verifyTurnstile: vi.fn(async () => ({ ok: true as const })),
  getTrustedClientIp: vi.fn(() => "unknown"),
  getServerEnv: vi.fn(() => ({ NEXT_PUBLIC_APP_URL: "https://surgeindex.example" })),
}));

vi.mock("better-auth/next-js", () => ({ toNextJsHandler: mocks.toNextJsHandler }));
vi.mock("../lib/server/auth", () => ({ getAuth: mocks.getAuth }));
vi.mock("../lib/server/rate-limit", () => ({ checkRateLimit: mocks.checkRateLimit }));
vi.mock("../lib/server/turnstile", () => ({ verifyTurnstile: mocks.verifyTurnstile }));
vi.mock("../lib/server/client-ip", () => ({ getTrustedClientIp: mocks.getTrustedClientIp }));
vi.mock("@surge/config", () => ({ getServerEnv: mocks.getServerEnv }));

import { GET, POST } from "../app/api/auth/[...all]/route";

async function errorBody(response: Response) {
  return response.json() as Promise<{ error?: { code?: string; message?: string } }>;
}

describe("authentication redirect boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects an unsafe callbackURL at the actual auth GET boundary", async () => {
    const response = await GET(new Request("https://surgeindex.example/api/auth/sign-in?callbackURL=%2F%2Fevil.example%2Fsteal"));

    expect(response.status).toBe(400);
    expect((await errorBody(response)).error?.code).toBe("unsafe_redirect");
    expect(mocks.toNextJsHandler).not.toHaveBeenCalled();
  });

  it("rejects an unsafe newUserCallbackURL at the actual auth GET boundary", async () => {
    const response = await GET(new Request("https://surgeindex.example/api/auth/sign-in?newUserCallbackURL=https%3A%2F%2Fevil.example%2Fafter-signup"));

    expect(response.status).toBe(400);
    expect((await errorBody(response)).error?.code).toBe("unsafe_redirect");
    expect(mocks.toNextJsHandler).not.toHaveBeenCalled();
  });

  it("rejects an unsafe callbackURL at the actual auth POST boundary before Turnstile or Better Auth", async () => {
    const response = await POST(new Request("https://surgeindex.example/api/auth/sign-up/email", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: "Attacker",
        email: "attacker@example.com",
        password: "password-fixture",
        callbackURL: "https://evil.example/collect",
        turnstileToken: "opaque-fixture",
      }),
    }));

    expect(response.status).toBe(400);
    expect((await errorBody(response)).error?.code).toBe("unsafe_redirect");
    expect(mocks.verifyTurnstile).not.toHaveBeenCalled();
    expect(mocks.getAuth).not.toHaveBeenCalled();
    expect(mocks.toNextJsHandler).not.toHaveBeenCalled();
  });

  it("rejects an unsafe newUserCallbackURL at the actual auth POST boundary", async () => {
    const response = await POST(new Request("https://surgeindex.example/api/auth/sign-in/email", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: "fixture@example.com",
        password: "password-fixture",
        newUserCallbackURL: "//evil.example/after-signup",
      }),
    }));

    expect(response.status).toBe(400);
    expect((await errorBody(response)).error?.code).toBe("unsafe_redirect");
    expect(mocks.getAuth).not.toHaveBeenCalled();
    expect(mocks.toNextJsHandler).not.toHaveBeenCalled();
  });
});
