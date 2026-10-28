import { describe, expect, it } from "vitest";
import { exponentialBackoffMs, retryableGoogleStatus } from "../src/backoff";
import { domainMatchState, isAcceptedDomainMatch, normalizeHost } from "../src/domain";
import { FixtureGa4Provider } from "../src/fixture-provider";
import { GoogleGa4Provider } from "../src/google-provider";
import { MockGa4Transport, mockJson } from "../src/mock-transport";
import { createOAuthState, buildGoogleAuthorizationUrl, GA4_READONLY_SCOPE, hashOAuthState, hasReadOnlyAnalyticsScope, parseGrantedScopes } from "../src/oauth";
import { normalizeCoreReport, normalizeRealtimeReport } from "../src/normalize";
import type { Ga4CredentialStore } from "../src/types";

describe("GA4 domain matching", () => {
  it("normalizes scheme, www, case, IDN, ports, and trailing dots", () => {
    expect(normalizeHost("HTTPS://WWW.Example.COM:443/")?.baseHost).toBe("example.com");
    expect(normalizeHost("https://www.example.com./")?.baseHost).toBe("example.com");
    expect(normalizeHost("https://bücher.example")?.host).toBe("xn--bcher-kva.example");
  });

  it("accepts exact and www-equivalent streams but not arbitrary subdomains", () => {
    expect(domainMatchState("example.com", "https://example.com").state).toBe("exact");
    expect(domainMatchState("example.com", "https://www.example.com").state).toBe("www_equivalent");
    expect(domainMatchState("example.com", "https://app.example.com").state).toBe("mismatch");
    expect(domainMatchState("example.com", "https://app.example.com", { approvedSubdomains: ["app.example.com"] }).state).toBe("approved_subdomain");
    expect(isAcceptedDomainMatch("mismatch")).toBe(false);
  });
});

describe("GA4 OAuth", () => {
  it("uses a cryptographic state and read-only PKCE authorization", () => {
    const state = createOAuthState();
    const url = new URL(buildGoogleAuthorizationUrl({ clientId: "client", redirectUri: "https://surgeindex.test/callback", state, codeChallenge: "challenge" }));
    expect(state).toHaveLength(43);
    expect(hashOAuthState(state)).toHaveLength(64);
    expect(url.searchParams.get("scope")).toBe(GA4_READONLY_SCOPE);
    expect(url.searchParams.get("access_type")).toBe("offline");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(hasReadOnlyAnalyticsScope(parseGrantedScopes(`${GA4_READONLY_SCOPE} openid`))).toBe(true);
    expect(hasReadOnlyAnalyticsScope(["https://www.googleapis.com/auth/analytics.edit"])).toBe(false);
  });
});

describe("GA4 fixture provider", () => {
  it("pages properties and web streams deterministically", async () => {
    const provider = new FixtureGa4Provider();
    const first = await provider.listAccountsAndProperties("connection");
    const second = await provider.listAccountsAndProperties("connection", first.nextPageToken ?? undefined);
    expect(first.properties).toHaveLength(1);
    expect(second.properties).toHaveLength(1);
    expect((await provider.listWebStreams("connection", "123456789")).streams.filter((stream) => stream.streamType === "web")).toHaveLength(1);
  });

  it("returns distinct Core and Realtime definitions", async () => {
    const provider = new FixtureGa4Provider();
    const core = await provider.fetchCoreReport("connection", { propertyId: "123456789", startDate: "2026-08-22", endDate: "2026-08-22", dimensions: ["date"], metrics: ["active_users", "sessions"] });
    const realtime = await provider.fetchRealtimeReport("connection", { propertyId: "123456789", minuteRange: 5, metrics: ["recent_active_users", "event_count"] });
    expect(core.rows[0]?.metrics.active_users).toBe(120);
    expect(realtime.activeUsers).toBe(12);
  });
});

describe("GA4 normalization and retry", () => {
  it("normalizes Google metric names without leaking provider shapes", () => {
    const result = normalizeCoreReport({ dimensionHeaders: [{ name: "date" }], metricHeaders: [{ name: "activeUsers" }, { name: "screenPageViews" }], rows: [{ dimensionValues: [{ value: "20260822" }], metricValues: [{ value: "3" }, { value: "7" }] }] }, { propertyId: "123", startDate: "2026-08-22", endDate: "2026-08-22", dimensions: ["date"], metrics: ["active_users", "screen_page_views"] }, "UTC");
    expect(result.rows[0]?.metrics).toEqual({ active_users: 3, screen_page_views: 7 });
    const realtime = normalizeRealtimeReport({ metricHeaders: [{ name: "activeUsers" }, { name: "eventCount" }], rows: [{ metricValues: [{ value: "4" }, { value: "9" }] }] }, { propertyId: "123", minuteRange: 30, metrics: ["recent_active_users", "event_count"] });
    expect(realtime.activeUsers).toBe(4);
    expect(realtime.eventCount).toBe(9);
    expect(retryableGoogleStatus(429)).toBe(true);
    expect(retryableGoogleStatus(403)).toBe(false);
    expect(exponentialBackoffMs(0, () => 0.5)).toBe(250);
  });
});

describe("Google provider transport boundary", () => {
  it("exchanges only the read-only grant through the mock transport", async () => {
    const transport = new MockGa4Transport();
    transport.enqueue(mockJson(200, { access_token: "access-fixture", refresh_token: "refresh-fixture", expires_in: 3600, scope: GA4_READONLY_SCOPE }));
    const provider = new GoogleGa4Provider({
      clientId: "client-fixture",
      clientSecret: "secret-fixture",
      redirectUri: "https://surgeindex.test/callback",
      credentials: {} as Ga4CredentialStore,
      transport,
    });
    const result = await provider.exchangeAuthorizationCode({ code: "authorization-code", codeVerifier: "verifier-fixture" });
    expect(result.refreshToken).toBe("refresh-fixture");
    expect(result.grantedScopes).toEqual([GA4_READONLY_SCOPE]);
    expect(transport.requests[0]?.url).toBe("https://oauth2.googleapis.com/token");
    expect(transport.requests[0]?.body).not.toContain("analytics.edit");
  });
});
