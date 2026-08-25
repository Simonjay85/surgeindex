import { afterEach, describe, expect, it } from "vitest";
import { resetServerEnvCache } from "@surge/config";
import { getTrustedClientIp } from "../lib/server/client-ip";
import { checkRateLimit } from "../lib/server/rate-limit";

const original = { ...process.env };

function request(headers: Record<string, string>): Request {
  return new Request("https://surgeindex.example/api/test", { headers });
}

describe("trusted client identity", () => {
  afterEach(() => {
    process.env = { ...original };
    resetServerEnvCache();
  });

  it("ignores client-controlled forwarding chains", () => {
    process.env.APP_MODE = "demo";
    process.env.DATA_PROVIDER = "demo";
    process.env.TRUSTED_PROXY_MODE = "direct_nginx";
    resetServerEnvCache();
    expect(getTrustedClientIp(request({ "x-real-ip": "203.0.113.10", "x-forwarded-for": "10.0.0.2, 203.0.113.10" }))).toBe("203.0.113.10");
    expect(getTrustedClientIp(request({ "x-real-ip": "203.0.113.10", "x-forwarded-for": "198.51.100.7" }))).toBe("203.0.113.10");
  });

  it("returns an aggregate subject when no trusted proxy is configured", () => {
    process.env.APP_MODE = "demo";
    process.env.DATA_PROVIDER = "demo";
    process.env.TRUSTED_PROXY_MODE = "none";
    resetServerEnvCache();
    expect(getTrustedClientIp(request({ "x-real-ip": "203.0.113.10", "x-forwarded-for": "198.51.100.7" }))).toBe("unknown");
  });

  it("rejects malformed proxy identity values", () => {
    process.env.APP_MODE = "demo";
    process.env.DATA_PROVIDER = "demo";
    process.env.TRUSTED_PROXY_MODE = "direct_nginx";
    resetServerEnvCache();
    expect(getTrustedClientIp(request({ "x-real-ip": "not-an-ip" }))).toBe("unknown");
  });

  it("does not let a changed X-Forwarded-For bypass the shared limiter", async () => {
    process.env.APP_MODE = "demo";
    process.env.DATA_PROVIDER = "demo";
    process.env.TRUSTED_PROXY_MODE = "direct_nginx";
    resetServerEnvCache();
    const first = getTrustedClientIp(request({ "x-real-ip": "203.0.113.10", "x-forwarded-for": "198.51.100.7" }));
    const spoofed = getTrustedClientIp(request({ "x-real-ip": "203.0.113.10", "x-forwarded-for": "192.0.2.99" }));
    const scope = `xff-spoof-${crypto.randomUUID()}`;
    expect(first).toBe(spoofed);
    expect((await checkRateLimit(scope, first, 1, 60_000)).allowed).toBe(true);
    expect((await checkRateLimit(scope, spoofed, 1, 60_000)).allowed).toBe(false);
  });
});
