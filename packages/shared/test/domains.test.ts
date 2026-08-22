import { describe, expect, it } from "vitest";
import { isAllowedRedirectDestination, normalizeDomain } from "../src/domains";

describe("canonical domain safety", () => {
  it("normalizes HTTP(S) hostnames and safe ports", () => {
    expect(normalizeDomain("https://WWW.Example.com:443/path?q=1")).toBe("example.com");
    expect(normalizeDomain("http://example.com:80")).toBe("example.com");
    expect(normalizeDomain("example.com:3000")).toBeNull();
  });

  it("rejects private, credentialed, and non-domain inputs", () => {
    expect(normalizeDomain("http://localhost:3000")).toBeNull();
    expect(normalizeDomain("http://192.168.1.5")).toBeNull();
    expect(normalizeDomain("https://user:pass@example.com")).toBeNull();
    expect(normalizeDomain("ftp://example.com")).toBeNull();
  });

  it("keeps outbound redirects on canonical public domains", () => {
    expect(isAllowedRedirectDestination("https://example.com/path")).toBe(true);
    expect(isAllowedRedirectDestination("https://example.com:3000")).toBe(false);
    expect(isAllowedRedirectDestination("http://169.254.169.254/latest")).toBe(false);
    expect(isAllowedRedirectDestination("https://user@example.com")).toBe(false);
  });
});
