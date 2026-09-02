import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetServerEnvCache } from "@surge/config";
import { verifyTurnstile } from "../lib/server/turnstile";

const originalEnv = { ...process.env };

function configureTurnstile(overrides: Record<string, string | undefined> = {}) {
  process.env = {
    ...originalEnv,
    NODE_ENV: "test",
    APP_MODE: "production",
    DATA_PROVIDER: "postgres",
    DATABASE_URL: "postgresql://turnstile-test",
    NEXT_PUBLIC_APP_URL: "https://staging.surgeindex.example",
    BETTER_AUTH_SECRET: "turnstile-test-secret-that-is-at-least-32-chars",
    TRUSTED_PROXY_MODE: "direct_nginx",
    EMAIL_PROVIDER: "http",
    EMAIL_FROM: "SurgeIndex <noreply@surgeindex.example>",
    EMAIL_HTTP_URL: "https://mail.surgeindex.example/send",
    EMAIL_HTTP_API_KEY: "test-only-mail-key",
    TURNSTILE_REQUIRED: "true",
    TURNSTILE_SITE_KEY: "site-key",
    TURNSTILE_SECRET_KEY: "secret-key",
    TURNSTILE_EXPECTED_HOSTNAME: "staging.surgeindex.example",
    ...overrides,
  };
  resetServerEnvCache();
}

function request() {
  return new Request("https://staging.surgeindex.example/api/sites", {
    headers: { "x-real-ip": "203.0.113.8" },
  });
}

function providerResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("server Turnstile verification", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    configureTurnstile();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    process.env = { ...originalEnv };
    resetServerEnvCache();
  });

  it("fails closed when Cloudflare returns a different action", async () => {
    const fetchMock = vi.fn(async () => providerResponse({ success: true, action: "password-reset", hostname: "staging.surgeindex.example" }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(verifyTurnstile(request(), "opaque-token", "site-submit")).resolves.toEqual({ ok: false, code: "turnstile_failed" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("fails closed when Cloudflare returns a different hostname", async () => {
    const fetchMock = vi.fn(async () => providerResponse({ success: true, action: "site-submit", hostname: "evil.example" }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(verifyTurnstile(request(), "opaque-token", "site-submit")).resolves.toEqual({ ok: false, code: "turnstile_failed" });
  });

  it("reports missing server configuration without making a provider call", async () => {
    // Production configuration rejects a missing key before the verifier can
    // run. Demo/test mode intentionally leaves that runtime branch available
    // so it is covered without weakening production configuration validation.
    configureTurnstile({ APP_MODE: "demo", DATA_PROVIDER: "demo", TURNSTILE_SITE_KEY: undefined, TURNSTILE_SECRET_KEY: undefined });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(verifyTurnstile(request(), "opaque-token", "site-submit")).resolves.toEqual({ ok: false, code: "turnstile_configuration" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("maps a provider HTTP failure to a safe failed result", async () => {
    const fetchMock = vi.fn(async () => new Response("upstream unavailable", { status: 503 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(verifyTurnstile(request(), "opaque-token", "site-submit")).resolves.toEqual({ ok: false, code: "turnstile_failed" });
  });

  it("maps a provider network failure to a safe failed result", async () => {
    const fetchMock = vi.fn(async () => { throw new TypeError("network unavailable"); });
    vi.stubGlobal("fetch", fetchMock);

    await expect(verifyTurnstile(request(), "opaque-token", "site-submit")).resolves.toEqual({ ok: false, code: "turnstile_failed" });
  });
});
