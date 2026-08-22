import { beforeEach, describe, expect, it, vi } from "vitest";

import { extractMetaVerificationToken, fetchPublicMetadata, resolvePublicHost } from "../lib/server/ssrf";

function response(body: string, headers: Record<string, string> = {}, status = 200) {
  return new Response(body, { status, headers: { "content-type": "text/html; charset=utf-8", ...headers } });
}

describe("public metadata fetch safety", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("blocks a hostname that resolves to a private address", async () => {
    await expect(resolvePublicHost("example.test", async () => [{ address: "192.168.1.20", family: 4 }])).rejects.toMatchObject({ code: "private_host" });
  });

  it("re-resolves redirects and refuses a private redirect target", async () => {
    const resolver = vi.fn(async (hostname: string) => hostname === "public.example" ? [{ address: "93.184.216.34", family: 4 }] : [{ address: "127.0.0.1", family: 4 }]);
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => input.toString().includes("public.example") ? response("", { location: "http://private.example" }, 302) : response("<title>should not be read</title>"));
    await expect(fetchPublicMetadata("https://public.example", fetchImpl, resolver)).rejects.toMatchObject({ code: "private_host" });
    expect(resolver).toHaveBeenCalledWith("private.example");
  });

  it("rejects non-HTML and declared oversized responses", async () => {
    const resolver = async () => [{ address: "93.184.216.34", family: 4 }];
    await expect(fetchPublicMetadata("https://public.example", vi.fn(async () => new Response("{}", { headers: { "content-type": "application/json" } })), resolver)).rejects.toMatchObject({ code: "unsupported_content_type" });
    await expect(fetchPublicMetadata("https://public.example", vi.fn(async () => response("", { "content-length": "300000" })), resolver)).rejects.toMatchObject({ code: "response_too_large" });
  });

  it("imports bounded metadata and extracts the ownership token", async () => {
    const resolver = async () => [{ address: "93.184.216.34", family: 4 }];
    const html = '<html><head><title>Example site</title><meta name="description" content="A useful site" /><meta name="surgeindex-verification" content="abc123" /></head></html>';
    const result = await fetchPublicMetadata("https://public.example", vi.fn(async () => response(html)), resolver);
    expect(result.title).toBe("Example site");
    expect(result.description).toBe("A useful site");
    expect(extractMetaVerificationToken(result.html)).toBe("abc123");
  });
});
