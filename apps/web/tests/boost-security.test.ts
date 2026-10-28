import { afterEach, describe, expect, it } from "vitest";
import { resetServerEnvCache } from "@surge/config";
import { anonymousVisitorHash, signClickToken, signImpressionToken, verifyClickToken, verifyImpressionToken } from "../lib/server/boost-tokens";

const original = { ...process.env };

afterEach(() => {
  process.env = { ...original };
  resetServerEnvCache();
});

describe("Boost token boundaries", () => {
  it("signs, binds, expires, and rejects replay-shaped tampering", () => {
    Object.assign(process.env, { NODE_ENV: "test" });
    process.env.APP_MODE = "demo";
    process.env.DATA_PROVIDER = "demo";
    process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
    resetServerEnvCache();
    const now = Date.now();
    const token = signImpressionToken({ campaignId: "campaign", siteId: "site", placementKey: "homepage_boosted", creativeVersion: 1, visitorContextHash: "visitor", routeContext: "/", issuedAt: now, expiresAt: now + 60_000 });
    expect(verifyImpressionToken(token)?.campaignId).toBe("campaign");
    expect(verifyImpressionToken(`${token.slice(0, -1)}x`)).toBeNull();
    const expired = signClickToken({ campaignId: "campaign", siteId: "site", siteSlug: "site", placementKey: "homepage_boosted", creativeVersion: 1, visitorContextHash: "visitor", destinationUrl: "https://example.com", issuedAt: now - 120_000, expiresAt: now - 1 });
    expect(verifyClickToken(expired)).toBeNull();
  });

  it("uses an opaque rotating hash for visitor context and does not return raw identifiers", () => {
    Object.assign(process.env, { NODE_ENV: "test" });
    process.env.APP_MODE = "demo";
    process.env.DATA_PROVIDER = "demo";
    process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
    resetServerEnvCache();
    const request = new Request("http://localhost:3000/api/boost/serve", { headers: { "x-surgeindex-visitor": "visitor-fixture", "x-forwarded-for": "203.0.113.4", "user-agent": "fixture-browser" } });
    const hash = anonymousVisitorHash(request, "site");
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    expect(hash).not.toContain("203.0.113.4");
    expect(hash).not.toContain("visitor-fixture");
  });
});
